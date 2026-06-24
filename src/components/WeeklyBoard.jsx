import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { addStamp, removeStamp, setTarget, addPayoutEvent } from '../db'

const RATE = 500 // 도장 1개당 500원
const MAX_STAMPS = 15

const KIDS = [
  { id: 'yoonseo', name: '윤서', icon: '👧' },
  { id: 'yeonwoo', name: '연우', icon: '👦' },
  { id: 'yeontaek', name: '연택', icon: '🧑' },
]

// 로컬 타임존 기준 날짜 문자열 (YYYY-MM-DD)
function toLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 월요일~일요일 7일 반환
function getWeekDays(offset = 0) {
  const today = new Date()
  const day = today.getDay() // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day // 이번 주 월요일로 이동
  today.setDate(today.getDate() + diff + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return toLocalDate(d)
  })
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

export default function WeeklyBoard({ userId, onLogout }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [stamps, setStamps] = useState({})      // { userId_dateStr: [0,1,2,...] }
  const [targets, setTargets] = useState({})    // { userId_dateStr: count }
  const [stats, setStats] = useState({})        // { userId: { total, paidOut } }
  const [loading, setLoading] = useState(true)
  const [weekHours, setWeekHours] = useState('') // 주간 목표 설정 입력값

  const weekDays = getWeekDays(weekOffset)
  const weekLabel = `${weekDays[0]} ~ ${weekDays[6]}`
  const isAdmin = userId === 'admin'
  const visibleKids = isAdmin ? KIDS : KIDS.filter(k => k.id === userId)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 도장 불러오기
      const { data: stampData } = await supabase
        .from('study_stamps')
        .select('user_id, date_str, stamp_index')
        .in('date_str', weekDays)

      const stampMap = {}
      ;(stampData || []).forEach(s => {
        const key = `${s.user_id}_${s.date_str}`
        if (!stampMap[key]) stampMap[key] = []
        stampMap[key].push(s.stamp_index)
      })
      setStamps(stampMap)

      // 목표 불러오기
      const { data: targetData } = await supabase
        .from('daily_targets')
        .select('user_id, date_str, target_count')
        .in('date_str', weekDays)

      const targetMap = {}
      ;(targetData || []).forEach(t => {
        targetMap[`${t.user_id}_${t.date_str}`] = t.target_count
      })
      setTargets(targetMap)

      // 통계 (전체 기간)
      const { data: allStamps } = await supabase
        .from('study_stamps')
        .select('user_id, stamp_index')

      const { data: payouts } = await supabase
        .from('custom_events')
        .select('user_id, amount')
        .eq('event_type', 'payout')

      const statMap = {}
      KIDS.forEach(k => {
        const total = (allStamps || []).filter(s => s.user_id === k.id).length * RATE
        const paid = (payouts || []).filter(p => p.user_id === k.id).reduce((s, p) => s + p.amount, 0)
        statMap[k.id] = { total, net: total + paid } // paid는 음수임
      })
      setStats(statMap)
    } catch (e) {
      console.error('데이터 로드 실패:', e)
    }
    setLoading(false)
  }, [weekDays.join()])

  useEffect(() => { loadData() }, [loadData])

  const handleStampClick = async (kidId, dateStr, index) => {
    if (!isAdmin && kidId !== userId) return
    const key = `${kidId}_${dateStr}`
    const current = stamps[key] || []
    const hasStamp = current.includes(index)

    // 낙관적 업데이트 (즉시 UI 반영)
    setStamps(prev => {
      const cur = prev[key] || []
      return {
        ...prev,
        [key]: hasStamp ? cur.filter(i => i !== index) : [...cur, index]
      }
    })

    try {
      if (hasStamp) {
        await removeStamp(kidId, dateStr, index)
      } else {
        await addStamp(kidId, dateStr, index)
      }
    } catch (e) {
      // 실패하면 원래 상태로 복구
      console.error('도장 저장 실패:', e)
      setStamps(prev => ({
        ...prev,
        [key]: hasStamp ? [...(prev[key] || []), index] : (prev[key] || []).filter(i => i !== index)
      }))
      alert('저장 실패! 잠시 후 다시 시도해주세요.')
    }
  }

  const handleSetWeekTarget = async (kidId) => {
    const hours = parseFloat(weekHours)
    if (isNaN(hours) || hours < 0) return alert('올바른 시간을 입력해주세요.')
    const stampsPerDay = Math.round(hours) // 1시간=1도장
    try {
      for (const dateStr of weekDays) {
        await setTarget(kidId, dateStr, stampsPerDay)
        setTargets(prev => ({ ...prev, [`${kidId}_${dateStr}`]: stampsPerDay }))
      }
      setWeekHours('')
    } catch (e) {
      alert('저장 실패!')
    }
  }

  const handlePayout = async (kidId) => {
    const net = stats[kidId]?.net || 0
    if (net === 0) return
    const msg = net > 0
      ? `${KIDS.find(k=>k.id===kidId)?.name}에게 ${net.toLocaleString()}원 지급하시겠습니까?`
      : `${KIDS.find(k=>k.id===kidId)?.name}의 잔액(${net.toLocaleString()}원)을 0원으로 초기화하시겠습니까?`
    if (!window.confirm(msg)) return
    try {
      await addPayoutEvent(kidId, -net)
      await loadData()
    } catch (e) {
      alert('지급 실패!')
    }
  }

  const today = toLocalDate(new Date())

  return (
    <div className="board-page">
      {/* 헤더 */}
      <header className="board-header">
        <h1>📚 공부 도장판</h1>
        <div className="header-right">
          <span className="user-badge">{isAdmin ? '👩 관리자' : `🧒 ${KIDS.find(k=>k.id===userId)?.name}`}</span>
          <button className="btn-logout" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      {/* 주 네비게이션 */}
      <div className="week-nav">
        <button className="week-btn" onClick={() => setWeekOffset(o => o - 1)}>◀ 이전 주</button>
        <span className="week-label">{weekLabel}</span>
        <button className="week-btn" onClick={() => setWeekOffset(o => o + 1)}>다음 주 ▶</button>
      </div>

      {loading && <div className="loading">불러오는 중...</div>}

      {!loading && visibleKids.map(kid => {
        const kidStats = stats[kid.id] || { total: 0, net: 0 }
        return (
          <div key={kid.id} className="kid-section">
            {/* 아이 이름 + 통계 */}
            <div className="kid-header">
              <span className="kid-name">{kid.icon} {kid.name}</span>
              <div className="kid-stats">
                <span className="stat-money">💰 {kidStats.net.toLocaleString()}원</span>
                {isAdmin && (
                  <button
                    className={`btn-payout ${kidStats.net === 0 ? 'disabled' : ''}`}
                    onClick={() => handlePayout(kid.id)}
                    disabled={kidStats.net === 0}
                  >
                    {kidStats.net > 0 ? '지급' : kidStats.net < 0 ? '초기화' : '지급'}
                  </button>
                )}
              </div>
            </div>

            {/* 관리자: 주간 목표 설정 */}
            {isAdmin && (
              <div className="week-target-row">
                <span>주간 목표 시간:</span>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={weekHours}
                  onChange={e => setWeekHours(e.target.value)}
                  placeholder="시간"
                  className="target-input"
                />
                <button className="btn-set-target" onClick={() => handleSetWeekTarget(kid.id)}>
                  {kid.name} 배정
                </button>
              </div>
            )}

            {/* 도장판 */}
            <div className="stamp-grid-wrapper">
              <table className="stamp-table">
                <thead>
                  <tr>
                    {weekDays.map((d, i) => (
                      <th key={d} className={d === today ? 'today-col' : ''}>
                        <div className="day-label">{DAY_LABELS[i]}</div>
                        <div className="date-label">{d.slice(5)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: MAX_STAMPS }, (_, si) => (
                    <tr key={si}>
                      {weekDays.map(dateStr => {
                        const key = `${kid.id}_${dateStr}`
                        const target = targets[key] || 0
                        const filled = (stamps[key] || []).includes(si)
                        const isInRange = si < target
                        const canClick = isAdmin || kid.id === userId
                        return (
                          <td
                            key={dateStr}
                            className={`stamp-cell ${dateStr === today ? 'today-col' : ''}`}
                            onClick={() => canClick && handleStampClick(kid.id, dateStr, si)}
                            style={{ cursor: canClick && isInRange ? 'pointer' : 'default' }}
                          >
                            {isInRange ? (
                              <div className={`stamp ${filled ? 'filled' : 'empty'}`}>
                                {filled ? '🔴' : '⭕'}
                              </div>
                            ) : (
                              <div className="stamp-blank" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 주간 도장 합계 */}
            <div className="week-summary">
              {weekDays.map(dateStr => {
                const key = `${kid.id}_${dateStr}`
                const count = (stamps[key] || []).length
                const target = targets[key] || 0
                return (
                  <div key={dateStr} className="day-summary">
                    <span className="summary-count">{count}/{target}</span>
                    <span className="summary-money">{(count * RATE).toLocaleString()}원</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
