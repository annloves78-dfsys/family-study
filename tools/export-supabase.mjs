// =========================================================
// Supabase 데이터를 가비아 서버(PostgreSQL) 용 INSERT 문으로 뽑아냅니다.
//   npm run export:supabase
// 결과: deploy/sql/02_data.sql
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

// PostgreSQL 문자열 리터럴 (standard_conforming_strings 기준: 홑따옴표만 두 번)
function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

function buildInserts(table, columns, rows) {
  if (rows.length === 0) return `-- ${table}: 데이터 없음\n`
  const lines = rows.map(r => '  (' + columns.map(c => sqlValue(r[c])).join(', ') + ')')
  return (
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n` + lines.join(',\n') + ';\n'
  )
}

// id 를 직접 넣었으므로 시퀀스를 최대값 다음으로 맞춰 줍니다
function resetSequence(table) {
  return `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1));`
}

const main = async () => {
  const profiles = await fetchAll('profiles')
  const targets = await fetchAll('daily_targets')
  const stamps = await fetchAll('study_stamps')
  const events = await fetchAll('custom_events')

  console.log(
    `profiles ${profiles.length} / daily_targets ${targets.length} / study_stamps ${stamps.length} / custom_events ${events.length}`
  )

  const eventRows = events.map(e => ({ ...e, settled_until: e.settled_until ?? null }))

  const out = [
    '-- =========================================================',
    '-- Supabase -> 가비아 서버(PostgreSQL) 데이터 이전',
    '-- 01_schema.sql 을 먼저 실행한 뒤 이 파일을 실행하세요.',
    '--   sudo -u postgres psql -d stamp -f 02_data.sql',
    `-- 행 수: profiles ${profiles.length}, daily_targets ${targets.length}, study_stamps ${stamps.length}, custom_events ${events.length}`,
    '-- =========================================================',
    '',
    '-- 실수로 다른 DB 에 실행하는 것을 막습니다',
    'DO $$',
    'BEGIN',
    "  IF current_database() <> 'stamp' THEN",
    "    RAISE EXCEPTION '이 스크립트는 stamp 데이터베이스에서만 실행할 수 있습니다 (현재: %)', current_database();",
    '  END IF;',
    'END $$;',
    '',
    'BEGIN;',
    '',
    'TRUNCATE custom_events, study_stamps, daily_targets, sessions, profiles RESTART IDENTITY CASCADE;',
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
    '-- 시퀀스 재정렬',
    resetSequence('daily_targets'),
    resetSequence('study_stamps'),
    resetSequence('custom_events'),
    '',
    'COMMIT;',
    '',
  ].join('\n')

  const target = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../deploy/sql/02_data.sql'
  )
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, out, 'utf8')
  console.log('저장 완료:', target)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
