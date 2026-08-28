// =========================================================
// Supabase 데이터를 가비아 MySQL 용 INSERT 문으로 뽑아냅니다.
//   node tools/export-supabase.mjs
// 결과: migration/gabia_data.sql
// =========================================================
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://cffosiozfhadpjvgljgj.supabase.co'
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmZm9zaW96ZmhhZHBqdmdsamdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDM4NDUsImV4cCI6MjA5NzUxOTg0NX0.XrNzVHrYXiObZ1AlojFTIauLyriZdiBuWfv_uQTxPXY'

const PAGE = 1000

async function fetchAll(table) {
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${offset}`
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
    if (!res.ok) throw new Error(`${table} 조회 실패 (${res.status}): ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  const s = String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '')
  return `'${s}'`
}

// Postgres timestamptz -> MySQL DATETIME (한국 시간)
function toMysqlDatetime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (isNaN(d.getTime())) return null
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 19).replace('T', ' ')
}

function buildInserts(table, columns, rows) {
  if (rows.length === 0) return `-- ${table}: 데이터 없음\n`
  const lines = rows.map(
    r => '  (' + columns.map(c => sqlValue(r[c])).join(', ') + ')'
  )
  return (
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n` +
    lines.join(',\n') +
    ';\n'
  )
}

const main = async () => {
  const profiles = await fetchAll('profiles')
  const targets = await fetchAll('daily_targets')
  const stamps = await fetchAll('study_stamps')
  const events = await fetchAll('custom_events')

  console.log(
    `profiles ${profiles.length} / daily_targets ${targets.length} / study_stamps ${stamps.length} / custom_events ${events.length}`
  )

  const eventRows = events.map(e => ({
    ...e,
    settled_until: e.settled_until ?? null,
    created_at: toMysqlDatetime(e.created_at),
  }))

  const out = [
    '-- =========================================================',
    '-- Supabase -> 가비아 MySQL 데이터 이전',
    '-- gabia_schema.sql 을 먼저 실행한 뒤 이 파일을 실행하세요.',
    `-- 생성 시각 기준 행 수: profiles ${profiles.length}, daily_targets ${targets.length}, study_stamps ${stamps.length}, custom_events ${events.length}`,
    '-- =========================================================',
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
    '-- 스키마 생성 시 들어간 기본 계정을 지우고 실제 데이터로 교체합니다',
    'DELETE FROM custom_events;',
    'DELETE FROM study_stamps;',
    'DELETE FROM daily_targets;',
    'DELETE FROM profiles;',
    '',
    buildInserts('profiles', ['id', 'name', 'password', 'is_password_set', 'role'], profiles),
    '',
    buildInserts('daily_targets', ['id', 'user_id', 'date_str', 'target_count'], targets),
    '',
    buildInserts('study_stamps', ['id', 'user_id', 'date_str', 'stamp_index', 'is_coupon_used'], stamps),
    '',
    buildInserts(
      'custom_events',
      ['id', 'user_id', 'event_type', 'amount', 'coupon_amount', 'settled_until', 'created_at'],
      eventRows
    ),
    '',
    'SET FOREIGN_KEY_CHECKS = 1;',
    '',
  ].join('\n')

  const target = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../migration/gabia_data.sql'
  )
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, out, 'utf8')
  console.log('저장 완료:', target)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
