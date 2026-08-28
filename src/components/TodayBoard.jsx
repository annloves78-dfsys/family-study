import { useState, useEffect, useCallback } from 'react'
import { fetchBoard, addStamp, removeStamp } from '../api'

const RATE = 500
const MAX_STAMPS = 15
const WINDOW = 14   // 아래 '지난 기록' 띠에 보여줄 날짜 수

const KIDS = [
  { id: 'yoonseo', name: '윤서', icon: '👧' },
  { id: 'yeonwoo', name: '연우', icon: '👦' },
  { id: 'yeontaek', name: '연택', icon: '🧒' },
]

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalDate(d)
}

export default function TodayBoard({ userId, kidId = userId, onLogout, onWeek, isPreview = false }) {
  const today = toLocalDate(new Date())
  const yesterday = addDays(today, -1)

  const [dateStr, setDateStr] = useState(today)
  // 아래 띠에 보여줄 14일 구간의 마지막 날 (과거로 넘어가면 같이 따라갑니다)
  const [windowEnd, setWindowEnd] = useState(today)
  const [stamps, setStamps] = useState({})   // { dateStr: { index: {isCouponUsed} } }
  const [targets, setTargets] = useState({}) // { dateStr: count }
  const [stat, setStat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [couponMode, setCouponMode] = useState(false)

  const kid = KIDS.find(k => k.id === kidId) || { name: '나', icon: '🙂' }

  const days = Array.from({ length: WINDOW }, (_, i) => addDays(windowEnd, i - (WINDOW - 1)))
  const daysKey = days.join(',')

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    try {
      // 보고 있는 날짜가 구간 밖이어도 같이 불러옵니다
      const wanted = Array.from(new Set([...daysKey.split(','), dateStr, today, yesterday]))
      const data = await fetchBoard(wanted)

      const sm = {}
      ;(data.weekStamps || []).forEach(s => {
        if (s.user_id !== kidId) return
        if (!sm[s.date_str]) sm[s.date_str] = {}
        sm[s.date_str][s.stamp_index] = { isCouponUsed: s.is_coupon_used }
      })
      setStamps(sm)

      const tm = {}
      ;(data.weekTargets || []).forEach(t => {
        if (t.user_id !== kidId) return
        tm[t.date_str] = t.target_count
      })
      setTargets(tm)

      setStat(data.stats?.[kidId] || null)
      setError('')
    } catch (e) {
      setError(e?.message || '불러오지 못했어요')
    }
    if (isInitial) setLoading(false)
  }, [kidId, daysKey, dateStr, today, yesterday])

  useEffect(() => { loadData(true) }, [loadData])

  const dayStamps = stamps[dateStr] || {}
  const target = targets[dateStr] || 0
  const filled = Object.keys(dayStamps).length
  const doneInTarget = Object.keys(dayStamps).filter(i => Number(i) < target).length
  const extra = Object.keys(dayStamps).filter(i => Number(i) >= target).length

  // 아이는 오늘·어제만 고칠 수 있습니다 (관리자 미리보기는 아무 날짜나)
  const canEdit = isPreview || dateStr === today || dateStr === yesterday
  const isToday = dateStr === today

  const slots = canEdit
    ? Math.min(MAX_STAMPS, Math.max(target, filled + 1))
    : Math.max(target, filled)

  const goToDate = (next) => {
    if (next > today) return
    setDateStr(next)
    setError('')
    if (next > windowEnd) {
      setWindowEnd(next)
    } else if (next < days[0]) {
      const end = addDays(next, WINDOW - 1)
      setWindowEnd(end > today ? today : end)
    }
  }

  const handleTap = async (index) => {
    if (busy) return
    if (!canEdit) {
      setError('지난 날은 보기만 할 수 있어요')
      return
    }
    const has = dayStamps[index] !== undefined
    const maxIndex = filled > 0 ? Math.max(...Object.keys(dayStamps).map(Number)) : -1

    if (has && index !== maxIndex) {
      setError('마지막 도장부터 순서대로 지워주세요')
      return
    }
    if (!has && index !== maxIndex + 1) {
      setError('순서대로 찍어주세요')
      return
    }

    let useCoupon = false
    if (!has && index < target && couponMode) {
      if ((stat?.usableCoupons || 0) > 0) useCoupon = true
      else {
        setError('쓸 수 있는 쿠폰이 없어요')
        setCouponMode(false)
        return
      }
    }

    setBusy(true)
    setError('')
    // 화면 먼저 바꿔서 바로 반응하게
    setStamps(prev => {
      const next = { ...prev, [dateStr]: { ...(prev[dateStr] || {}) } }
      if (has) delete next[dateStr][index]
      else next[dateStr][index] = { isCouponUsed: useCoupon }
      return next
    })

    try {
      if (has) await removeStamp(kidId, dateStr, index)
      else await addStamp(kidId, dateStr, index, useCoupon)
      await loadData()
      if (useCoupon) setCouponMode(false)
    } catch (e) {
      setError(e?.message || '저장하지 못했어요')
      await loadData()
    }
    setBusy(false)
  }

  if (loading) return <div className="app-splash">불러오는 중...</div>

  const dayLabel = DAY_LABELS[new Date(dateStr + 'T00:00:00').getDay()]
  const [, mm, dd] = dateStr.split('-')
  const dayWord = isToday ? '오늘' : (dateStr === yesterday ? '어제' : '이날')

  // 지난 기록 띠
  const stripDays = days.map(d => {
    const st = stamps[d] || {}
    const tg = targets[d] || 0
    const inTarget = Object.keys(st).filter(i => Number(i) < tg).length
    return { date: d, target: tg, done: inTarget, ratio: tg > 0 ? inTarget / tg : 0 }
  })
  const windowHours = stripDays.reduce((sum, d) => sum + d.done, 0)
  const windowMoney = windowHours * RATE

  return (
    <div className="today-page">
      <header className="today-header">
        <span className="today-who">{kid.icon} {kid.name}</span>
        <div className="today-header-btns">
          <button className="today-link" onClick={onWeek}>
            {isPreview ? '관리자 화면' : '주간 보기'}
          </button>
          {!isPreview && (
            <button className="today-link ghost" onClick={onLogout}>로그아웃</button>
          )}
        </div>
      </header>

      {isPreview && (
        <div className="today-preview-note">
          👩 관리자가 보는 <b>{kid.name}</b>의 화면입니다 — 아이가 보는 것과 똑같아요
        </div>
      )}

      {/* 날짜 이동 */}
      <div className="today-nav">
        <button className="nav-arrow" onClick={() => goToDate(addDays(dateStr, -1))} aria-label="전날">◀</button>
        <div className="nav-date">
          <div className="nav-date-main">{parseInt(mm)}월 {parseInt(dd)}일 {dayLabel}</div>
          {(isToday || dateStr === yesterday) && (
            <div className="nav-date-sub">{isToday ? '오늘' : '어제'}</div>
          )}
        </div>
        <button
          className="nav-arrow"
          onClick={() => goToDate(addDays(dateStr, 1))}
          disabled={isToday}
          aria-label="다음날"
        >▶</button>
      </div>

      {!isToday && (
        <button className="nav-today" onClick={() => { setDateStr(today); setWindowEnd(today); setError('') }}>
          오늘로 돌아가기
        </button>
      )}

      {/* 진행 */}
      <div className="today-progress">
        <span className="today-count">{doneInTarget}</span>
        <span className="today-of">/ {target}시간</span>
        {extra > 0 && <span className="today-extra">⭐ +{extra}</span>}
      </div>

      {target > 0 && (
        <div className="today-bar">
          <div
            className="today-bar-fill"
            style={{ width: `${Math.min(100, (doneInTarget / target) * 100)}%` }}
          />
        </div>
      )}

      {error && <div className="today-error">{error}</div>}

      {!canEdit && (
        <div className="today-readonly">👀 지난 기록이에요 — 보기만 할 수 있어요</div>
      )}

      {/* 도장 동그라미 */}
      {slots > 0 ? (
        <div className="today-stamps">
          {Array.from({ length: slots }, (_, i) => {
            const data = dayStamps[i]
            const isFilled = data !== undefined
            const isExtra = i >= target
            const cls = isFilled
              ? (isExtra ? 'filled extra' : (data.isCouponUsed ? 'filled coupon' : 'filled'))
              : (isExtra ? 'empty extra' : 'empty')
            return (
              <button
                key={i}
                className={`today-stamp ${cls}${canEdit ? '' : ' locked'}`}
                onClick={() => handleTap(i)}
                disabled={busy}
                aria-label={`${i + 1}번째 도장`}
              >
                {isFilled ? (isExtra ? '⭐' : (data.isCouponUsed ? '🎫' : '🔴')) : i + 1}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="today-empty">이날은 목표가 없었어요</div>
      )}

      {target > 0 && doneInTarget >= target && (
        <div className="today-done">{dayWord} 목표 다 했어요! 🎉</div>
      )}

      {/* 요약 */}
      <div className="today-summary">
        <div className="today-card">
          <div className="today-card-label">{dayWord} 번 돈</div>
          <div className="today-card-value">{(doneInTarget * RATE).toLocaleString()}원</div>
        </div>
        <div className="today-card">
          <div className="today-card-label">아직 못 받은 돈</div>
          <div className="today-card-value">{(stat?.unsettledMoney || 0).toLocaleString()}원</div>
        </div>
      </div>

      {canEdit && (
        <button
          className={`today-coupon ${couponMode ? 'active' : ''}`}
          onClick={() => {
            if ((stat?.usableCoupons || 0) <= 0) { setError('쓸 수 있는 쿠폰이 없어요'); return }
            setCouponMode(v => !v)
            setError('')
          }}
        >
          {couponMode
            ? '🎫 쿠폰 모드 — 다음 도장은 쿠폰으로!'
            : `🎟 쿠폰 ${stat?.usableCoupons || 0}장 (대기 ${stat?.waitCoupons || 0})`}
        </button>
      )}

      {/* 지난 기록 */}
      <div className="strip-section">
        <div className="strip-head">
          <span className="strip-title">
            {days[0].slice(5).replace('-', '/')} ~ {days[days.length - 1].slice(5).replace('-', '/')}
          </span>
          <span className="strip-total">{windowHours}시간 · {windowMoney.toLocaleString()}원</span>
        </div>

        <div className="strip-grid">
          {stripDays.map(d => {
            const label = DAY_LABELS[new Date(d.date + 'T00:00:00').getDay()]
            const level =
              d.target === 0 ? 'none' : d.ratio >= 1 ? 'full' : d.ratio > 0 ? 'part' : 'zero'
            return (
              <button
                key={d.date}
                className={`strip-day ${level}${d.date === dateStr ? ' sel' : ''}${d.date === today ? ' is-today' : ''}`}
                onClick={() => goToDate(d.date)}
                title={`${d.date} — ${d.done}/${d.target}시간`}
              >
                <span className="strip-dow">{label}</span>
                <span className="strip-num">{parseInt(d.date.split('-')[2])}</span>
                <span className="strip-mark">
                  {d.target === 0 ? '·' : d.ratio >= 1 ? '🔴' : d.done > 0 ? d.done : ''}
                </span>
              </button>
            )
          })}
        </div>

        <button className="strip-more" onClick={() => goToDate(addDays(days[0], -1))}>
          ◀ 더 이전 보기
        </button>
      </div>

      {stat?.settledUntil && (
        <div className="today-paid">
          ✅ {parseInt(stat.settledUntil.split('-')[1])}/{parseInt(stat.settledUntil.split('-')[2])}까지 받았어요
        </div>
      )}
    </div>
  )
}
