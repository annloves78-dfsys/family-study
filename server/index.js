// =========================================================
//  도장판 API 서버 (가비아 서버 / Node + PostgreSQL)
//    POST /api/?action=<액션>   Body: JSON
//
//  학원앱(annest)과 완전히 분리되어 있습니다.
//    - 리눅스 계정: stamp        (annest 폴더 접근 불가)
//    - 데이터베이스: stamp DB    (annest DB 접근 불가)
//    - 포트: 3010               (annest 는 3001/3002)
// =========================================================
import http from 'node:http'
import crypto from 'node:crypto'
import pg from 'pg'
import webpush from 'web-push'

const PORT = Number(process.env.PORT || 3010)
const RATE = Number(process.env.RATE || 500)
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 60)
const REMINDER_HOUR_KST = Number.isInteger(Number(process.env.REMINDER_HOUR_KST))
  && Number(process.env.REMINDER_HOUR_KST) >= 0
  && Number(process.env.REMINDER_HOUR_KST) <= 23
  ? Number(process.env.REMINDER_HOUR_KST)
  : 13
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@family.anne.ai.kr'
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (PUSH_ENABLED) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
} else {
  console.warn('[stamp-api] VAPID 키가 없어 푸시 알림이 비활성화됩니다.')
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다. systemd 유닛의 Environment 를 확인하세요.')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4, // 램이 넉넉하지 않으므로 작게
  idleTimeoutMillis: 30_000,
})

pool.on('error', err => console.error('[stamp-api] pool error:', err.message))

// ---------- 공통 ----------
class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function asInt(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v)
  return null
}

// 길이가 달라도 시간이 새지 않도록 해시로 비교
function samePassword(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest()
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest()
  return crypto.timingSafeEqual(ha, hb)
}

// ---------- 세션 ----------
async function currentUser(token) {
  if (typeof token !== 'string' || token.length !== 64) return null
  const { rows } = await pool.query(
    `SELECT p.id, p.role
       FROM sessions s
       JOIN profiles p ON p.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  )
  return rows[0] || null
}

async function requireUser(body) {
  const u = await currentUser(body.token)
  if (!u) throw new ApiError(401, '로그인이 필요합니다.')
  return u
}

async function requireAdmin(body) {
  const u = await requireUser(body)
  if (u.role !== 'admin') throw new ApiError(403, '관리자만 할 수 있습니다.')
  return u
}

// 관리자이거나 본인일 때만 수정 가능
async function requireCanEdit(body, targetId) {
  const u = await requireUser(body)
  if (u.role !== 'admin' && u.id !== targetId) {
    throw new ApiError(403, '다른 사람의 도장은 바꿀 수 없습니다.')
  }
  return u
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()')
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, NOW() + make_interval(days => $3))`,
    [token, userId, SESSION_DAYS]
  )
  return token
}

// ---------- 통계 ----------
async function buildStats() {
  const [kids, agg, payouts] = await Promise.all([
    pool.query("SELECT id FROM profiles WHERE role = 'child'"),
    pool.query(
      `SELECT s.user_id,
              COUNT(*) FILTER (WHERE s.stamp_index <  COALESCE(t.target_count, 0)) AS money_stamps,
              COUNT(*) FILTER (WHERE s.stamp_index <  COALESCE(t.target_count, 0) AND s.is_coupon_used) AS used_coupons,
              COUNT(*) FILTER (WHERE s.stamp_index >= COALESCE(t.target_count, 0)) AS earned_coupons,
              MAX(s.date_str) AS last_stamp_date
         FROM study_stamps s
         LEFT JOIN daily_targets t
                ON t.user_id = s.user_id AND t.date_str = s.date_str
        GROUP BY s.user_id`
    ),
    pool.query(
      `SELECT id, user_id, amount, coupon_amount, settled_until, created_at
         FROM custom_events
        WHERE event_type = 'payout'
        ORDER BY created_at DESC, id DESC`
    ),
  ])

  const stats = {}
  for (const k of kids.rows) {
    stats[k.id] = {
      unsettledMoney: 0,
      usableCoupons: 0,
      waitCoupons: 0,
      settledUntil: null,
      lastStampDate: null,
      history: [],
    }
  }

  const earned = {}
  const used = {}
  for (const r of agg.rows) {
    const s = stats[r.user_id]
    if (!s) continue
    s.unsettledMoney = Number(r.money_stamps) * RATE
    s.lastStampDate = r.last_stamp_date
    earned[r.user_id] = Number(r.earned_coupons)
    used[r.user_id] = Number(r.used_coupons)
  }

  const paidMoney = {}
  const paidCoupons = {}
  for (const p of payouts.rows) {
    const s = stats[p.user_id]
    if (!s) continue
    // 지급액은 음수로 저장돼 있습니다
    paidMoney[p.user_id] = (paidMoney[p.user_id] || 0) - p.amount
    paidCoupons[p.user_id] = (paidCoupons[p.user_id] || 0) + p.coupon_amount

    if (p.settled_until && (!s.settledUntil || p.settled_until > s.settledUntil)) {
      s.settledUntil = p.settled_until
    }
    if (s.history.length < 30) {
      s.history.push({
        id: p.id,
        amount: p.amount,
        coupon_amount: p.coupon_amount,
        settled_until: p.settled_until,
        created_at: p.created_at,
      })
    }
  }

  for (const [id, s] of Object.entries(stats)) {
    s.unsettledMoney -= paidMoney[id] || 0
    s.usableCoupons = (paidCoupons[id] || 0) - (used[id] || 0)
    s.waitCoupons = (earned[id] || 0) - (paidCoupons[id] || 0)
  }

  return stats
}

// 한국 시간 기준 오늘 (서버는 UTC 로 돌 수 있으므로)
function todayKST(nowMs = Date.now()) {
  const now = new Date(nowMs + 9 * 60 * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

function yesterdayKST(nowMs = Date.now()) {
  return todayKST(nowMs - 24 * 60 * 60 * 1000)
}

function hourKST(nowMs = Date.now()) {
  return new Date(nowMs + 9 * 60 * 60 * 1000).getUTCHours()
}

function millisecondsUntilNextReminder(nowMs = Date.now()) {
  const kst = new Date(nowMs + 9 * 60 * 60 * 1000)
  let next = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    REMINDER_HOUR_KST,
    0,
    0,
    0
  )
  if (next <= kst.getTime()) next += 24 * 60 * 60 * 1000
  return next - kst.getTime()
}

function isGonePushError(error) {
  return error?.statusCode === 404 || error?.statusCode === 410
}

async function sendMissedReminderToChild(userId, name, dateStr) {
  if (!PUSH_ENABLED) return { sent: 0, skipped: true }

  const alreadySent = await pool.query(
    'SELECT 1 FROM push_delivery_log WHERE user_id = $1 AND date_str = $2',
    [userId, dateStr]
  )
  if (alreadySent.rowCount > 0) return { sent: 0, skipped: true }

  const missed = await pool.query(
    'SELECT 1 FROM study_stamps WHERE user_id = $1 AND date_str = $2 LIMIT 1',
    [userId, dateStr]
  )
  if (missed.rowCount > 0) return { sent: 0, skipped: true }

  const subscriptions = await pool.query(
    `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = $1`,
    [userId]
  )
  if (subscriptions.rowCount === 0) return { sent: 0, skipped: true }

  const payload = JSON.stringify({
    title: '어제 공부 도장을 확인해 주세요',
    body: `${name}님, 어제 찍힌 공부 도장이 없어요. 앱을 열어 기록해 주세요.`,
    url: './',
    tag: `missed-stamps-${dateStr}`,
    badge: 1,
  })

  let sent = 0
  for (const sub of subscriptions.rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        { TTL: 12 * 60 * 60, urgency: 'normal' }
      )
      sent += 1
    } catch (error) {
      if (isGonePushError(error)) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
      } else {
        console.error(`[stamp-api] push failed for ${userId}:`, error?.message || error)
      }
    }
  }

  if (sent > 0) {
    await pool.query(
      `INSERT INTO push_delivery_log (user_id, date_str, success_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, date_str) DO NOTHING`,
      [userId, dateStr, sent]
    )
  }
  return { sent, skipped: false }
}

let reminderRunning = false
async function runMissedReminders() {
  if (!PUSH_ENABLED || reminderRunning) return
  reminderRunning = true
  const dateStr = yesterdayKST()
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name
         FROM profiles p
        WHERE p.role = 'child'
          AND EXISTS (
            SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = p.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM study_stamps s
             WHERE s.user_id = p.id AND s.date_str = $1
          )`,
      [dateStr]
    )

    let sent = 0
    for (const child of rows) {
      const result = await sendMissedReminderToChild(child.id, child.name, dateStr)
      sent += result.sent
    }
    console.log(`[stamp-api] ${dateStr} 미기록 알림 완료: 아이 ${rows.length}명, 기기 ${sent}대`)
  } catch (error) {
    console.error('[stamp-api] 미기록 알림 실행 실패:', error?.message || error)
  } finally {
    reminderRunning = false
  }
}

function scheduleMissedReminders() {
  if (!PUSH_ENABLED) return

  const scheduleNext = () => {
    const delay = millisecondsUntilNextReminder()
    const nextAt = new Date(Date.now() + delay).toISOString()
    console.log(`[stamp-api] 다음 미기록 알림: ${nextAt} (KST ${REMINDER_HOUR_KST}:00)`)
    setTimeout(async () => {
      await runMissedReminders()
      scheduleNext()
    }, delay).unref()
  }

  // 서버가 오후 1시 이후 재시작되었어도 그날 알림을 놓치지 않습니다.
  if (hourKST() >= REMINDER_HOUR_KST) {
    runMissedReminders()
  }
  scheduleNext()
}

// 그날의 진행 상황 (위젯 응답용)
async function daySummary(userId, dateStr) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM study_stamps WHERE user_id = $1 AND date_str = $2) AS total,
       (SELECT COALESCE(target_count, 0) FROM daily_targets WHERE user_id = $1 AND date_str = $2) AS target`,
    [userId, dateStr]
  )
  const total = Number(rows[0]?.total || 0)
  const target = Number(rows[0]?.target || 0)
  return {
    dateStr,
    total,
    target,
    done: Math.min(total, target),
    extra: Math.max(0, total - target),
  }
}

// 위젯이 그대로 띄울 짧은 안내문
async function dayMessage(userId, dateStr) {
  const { rows } = await pool.query('SELECT name FROM profiles WHERE id = $1', [userId])
  const name = rows[0]?.name || userId
  const s = await daySummary(userId, dateStr)
  let msg = `${name} ${s.done}/${s.target}시간`
  if (s.extra > 0) msg += ` (+${s.extra}⭐)`
  if (s.target > 0 && s.done >= s.target) msg += ' 목표 달성!'
  return msg
}

// 아이는 오늘·어제만 고칠 수 있습니다 (관리자는 아무 날짜나)
function assertEditableDate(user, dateStr) {
  if (user.role === 'admin') return
  const today = todayKST()
  const d = new Date(today + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  const yesterday = d.toISOString().slice(0, 10)
  if (dateStr !== today && dateStr !== yesterday) {
    throw new ApiError(403, '오늘과 어제 도장만 바꿀 수 있어요.')
  }
}

// ---------- 액션 ----------
const actions = {
  async health() {
    await pool.query('SELECT 1')
    return { ok: true }
  },

  async login(b) {
    if (typeof b.userId !== 'string' || typeof b.password !== 'string') {
      throw new ApiError(400, '입력값이 올바르지 않습니다.')
    }
    const { rows } = await pool.query(
      'SELECT id, name, role, password FROM profiles WHERE id = $1',
      [b.userId]
    )
    const row = rows[0]
    if (!row) throw new ApiError(404, '사용자를 찾을 수 없습니다.')
    if (!samePassword(row.password, b.password)) throw new ApiError(401, '비밀번호가 틀렸습니다.')

    return {
      token: await createSession(row.id),
      userId: row.id,
      name: row.name,
      role: row.role,
    }
  },

  // 저장된 토큰이 아직 유효한지 확인 (자동 로그인)
  async me(b) {
    const u = await currentUser(b.token)
    return u ? { userId: u.id, role: u.role } : { userId: null }
  },

  async logout(b) {
    if (typeof b.token === 'string' && b.token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [b.token])
    }
    return { ok: true }
  },

  async push_config(b) {
    const u = await requireUser(b)
    if (u.role !== 'child') throw new ApiError(403, '아이 계정에서만 알림을 설정할 수 있습니다.')
    return {
      enabled: PUSH_ENABLED,
      publicKey: PUSH_ENABLED ? VAPID_PUBLIC_KEY : '',
      reminderHourKST: REMINDER_HOUR_KST,
    }
  },

  async push_subscribe(b) {
    const u = await requireUser(b)
    if (u.role !== 'child') throw new ApiError(403, '아이 계정에서만 알림을 설정할 수 있습니다.')
    if (!PUSH_ENABLED) throw new ApiError(503, '푸시 알림이 아직 준비되지 않았습니다.')

    const subscription = b.subscription
    const endpoint = subscription?.endpoint
    const p256dh = subscription?.keys?.p256dh
    const auth = subscription?.keys?.auth
    if (
      typeof endpoint !== 'string' || endpoint.length < 20 || endpoint.length > 4096 ||
      !endpoint.startsWith('https://') ||
      typeof p256dh !== 'string' || p256dh.length < 20 || p256dh.length > 512 ||
      typeof auth !== 'string' || auth.length < 8 || auth.length > 256
    ) {
      throw new ApiError(400, '알림 기기 정보가 올바르지 않습니다.')
    }

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth,
             updated_at = NOW()`,
      [u.id, endpoint, p256dh, auth]
    )

    // 오후 1시가 지난 뒤 처음 켠 기기도 오늘 알림을 받을 수 있게 한 번 확인합니다.
    if (hourKST() >= REMINDER_HOUR_KST) {
      const { rows } = await pool.query('SELECT name FROM profiles WHERE id = $1', [u.id])
      await sendMissedReminderToChild(u.id, rows[0]?.name || u.id, yesterdayKST())
    }

    return { ok: true, reminderHourKST: REMINDER_HOUR_KST }
  },

  async push_unsubscribe(b) {
    const u = await requireUser(b)
    const endpoint = b.endpoint
    if (typeof endpoint !== 'string' || endpoint.length > 4096) {
      throw new ApiError(400, '알림 기기 정보가 올바르지 않습니다.')
    }
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [u.id, endpoint]
    )
    return { ok: true }
  },

  async change_password(b) {
    const { userId, currentPassword, newPassword } = b
    if (
      typeof userId !== 'string' ||
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string'
    ) {
      throw new ApiError(400, '입력값이 올바르지 않습니다.')
    }
    if (!newPassword) throw new ApiError(400, '새 비밀번호를 입력해 주세요.')
    if (newPassword.length > 60) throw new ApiError(400, '비밀번호가 너무 깁니다.')

    const { rows } = await pool.query('SELECT id, password FROM profiles WHERE id = $1', [userId])
    const row = rows[0]
    if (!row) throw new ApiError(404, '사용자를 찾을 수 없습니다.')
    if (!samePassword(row.password, currentPassword)) {
      throw new ApiError(401, '현재 비밀번호가 틀렸습니다.')
    }

    await pool.query(
      'UPDATE profiles SET password = $1, is_password_set = true WHERE id = $2',
      [newPassword, userId]
    )
    // 다른 기기의 기존 세션은 만료시킵니다
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])

    return { token: await createSession(userId), userId }
  },

  async board(b) {
    await requireUser(b)
    const week = b.week
    if (!Array.isArray(week) || week.length === 0 || week.length > 31) {
      throw new ApiError(400, '주간 날짜가 올바르지 않습니다.')
    }
    if (!week.every(isDate)) throw new ApiError(400, '날짜 형식이 올바르지 않습니다.')

    const [stampRes, targetRes, stats] = await Promise.all([
      pool.query(
        `SELECT user_id, date_str, stamp_index, is_coupon_used
           FROM study_stamps WHERE date_str = ANY($1)`,
        [week]
      ),
      pool.query(
        `SELECT user_id, date_str, target_count
           FROM daily_targets WHERE date_str = ANY($1)`,
        [week]
      ),
      buildStats(),
    ])

    return { weekStamps: stampRes.rows, weekTargets: targetRes.rows, stats }
  },

  // ---- 위젯용 토큰 발급 (관리자만) ----
  //  홈 화면 위젯에 넣어둘 오래 가는 토큰입니다.
  //  ⚠ 그 아이가 비밀번호를 바꾸면 이 토큰도 함께 만료됩니다 (다시 발급하세요).
  async widget_token(b) {
    await requireAdmin(b)
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const { rows } = await pool.query('SELECT id, name FROM profiles WHERE id = $1', [targetId])
    if (!rows[0]) throw new ApiError(404, '사용자를 찾을 수 없습니다.')

    const token = crypto.randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES ($1, $2, NOW() + make_interval(days => 3650))`,
      [token, targetId]
    )
    return { token, userId: targetId, name: rows[0].name }
  },

  // ---- 위젯용: 오늘 도장 하나 추가 (번호는 서버가 계산) ----
  //  홈 화면 위젯이 통째로 보내기 쉽도록, 몸통은 {token, userId} 만 있으면 됩니다.
  async stamp_next(b) {
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const u = await requireCanEdit(b, targetId)

    const dateStr = isDate(b.dateStr) ? b.dateStr : todayKST()
    assertEditableDate(u, dateStr)

    // 다음 번호를 찾아 넣는 것을 한 번에 (동시에 두 번 눌러도 꼬이지 않게)
    const { rows } = await pool.query(
      `INSERT INTO study_stamps (user_id, date_str, stamp_index, is_coupon_used)
       SELECT $1, $2,
              COALESCE(MAX(stamp_index) + 1, 0),
              false
         FROM study_stamps WHERE user_id = $1 AND date_str = $2
       ON CONFLICT (user_id, date_str, stamp_index) DO NOTHING
       RETURNING stamp_index`,
      [targetId, dateStr]
    )
    if (rows.length === 0) throw new ApiError(409, '방금 눌린 것 같아요. 다시 해보세요.')

    return { ok: true, ...(await daySummary(targetId, dateStr)), message: await dayMessage(targetId, dateStr) }
  },

  // ---- 위젯용: 오늘 마지막 도장 하나 취소 ----
  async stamp_undo(b) {
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const u = await requireCanEdit(b, targetId)

    const dateStr = isDate(b.dateStr) ? b.dateStr : todayKST()
    assertEditableDate(u, dateStr)

    const { rows } = await pool.query(
      `DELETE FROM study_stamps
        WHERE ctid = (
          SELECT ctid FROM study_stamps
           WHERE user_id = $1 AND date_str = $2
           ORDER BY stamp_index DESC LIMIT 1
        )
        RETURNING stamp_index`,
      [targetId, dateStr]
    )
    if (rows.length === 0) throw new ApiError(404, '지울 도장이 없어요.')

    return { ok: true, ...(await daySummary(targetId, dateStr)), message: await dayMessage(targetId, dateStr) }
  },

  async stamp_add(b) {
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const stampIndex = asInt(b.stampIndex)
    if (!isDate(b.dateStr) || stampIndex === null || stampIndex < 0 || stampIndex > 100) {
      throw new ApiError(400, '입력값이 올바르지 않습니다.')
    }
    const u1 = await requireCanEdit(b, targetId)
    assertEditableDate(u1, b.dateStr)

    await pool.query(
      `INSERT INTO study_stamps (user_id, date_str, stamp_index, is_coupon_used)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date_str, stamp_index) DO NOTHING`,
      [targetId, b.dateStr, stampIndex, Boolean(b.isCouponUsed)]
    )
    return { ok: true }
  },

  async stamp_remove(b) {
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const stampIndex = asInt(b.stampIndex)
    if (!isDate(b.dateStr) || stampIndex === null) {
      throw new ApiError(400, '입력값이 올바르지 않습니다.')
    }
    const u2 = await requireCanEdit(b, targetId)
    assertEditableDate(u2, b.dateStr)

    await pool.query(
      'DELETE FROM study_stamps WHERE user_id = $1 AND date_str = $2 AND stamp_index = $3',
      [targetId, b.dateStr, stampIndex]
    )
    return { ok: true }
  },

  async target_set(b) {
    await requireAdmin(b)
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const count = asInt(b.count)
    if (!isDate(b.dateStr) || count === null || count < 0 || count > 100) {
      throw new ApiError(400, '입력값이 올바르지 않습니다.')
    }

    await pool.query(
      `INSERT INTO daily_targets (user_id, date_str, target_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, date_str) DO UPDATE SET target_count = EXCLUDED.target_count`,
      [targetId, b.dateStr, count]
    )
    return { ok: true }
  },

  async payout_add(b) {
    await requireAdmin(b)
    const targetId = typeof b.userId === 'string' ? b.userId : ''
    const amount = asInt(b.amount)
    const couponAmount = asInt(b.couponAmount ?? 0)
    const settledUntil = b.settledUntil ?? null
    if (amount === null || couponAmount === null) throw new ApiError(400, '금액이 올바르지 않습니다.')
    if (settledUntil !== null && !isDate(settledUntil)) {
      throw new ApiError(400, '정산 기준일이 올바르지 않습니다.')
    }

    await pool.query(
      `INSERT INTO custom_events (user_id, event_type, amount, coupon_amount, settled_until)
       VALUES ($1, 'payout', $2, $3, $4)`,
      [targetId, amount, couponAmount, settledUntil]
    )
    return { ok: true }
  },
}

// ---------- HTTP ----------
const MAX_BODY = 64 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new ApiError(413, '요청이 너무 큽니다.'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new ApiError(400, '요청 형식이 올바르지 않습니다.'))
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const send = (status, obj) => {
    const buf = Buffer.from(JSON.stringify(obj), 'utf8')
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(buf)
  }

  try {
    const url = new URL(req.url, 'http://localhost')
    if (req.method !== 'POST') return send(405, { error: 'POST 로 요청해 주세요.' })

    const name = url.searchParams.get('action') || ''
    const handler = Object.prototype.hasOwnProperty.call(actions, name) ? actions[name] : null
    if (!handler) return send(404, { error: `알 수 없는 요청입니다: ${name}` })

    const body = await readBody(req)
    send(200, await handler(body))
  } catch (e) {
    if (e instanceof ApiError) return send(e.status, { error: e.message })
    console.error('[stamp-api]', e)
    send(500, { error: '서버 오류가 발생했습니다.' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[stamp-api] listening on 127.0.0.1:${PORT}`)
  scheduleMissedReminders()
})

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => pool.end().then(() => process.exit(0)))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
