import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { addStamp, removeStamp, setTarget } from '../db'

const RATE = 500
const MAX_STAMPS = 15

const KIDS = [
  { id: 'yoonseo', name: '윤서', icon: '👧' },
  { id: 'yeonwoo', name: '연우', icon: '👦' },
  { id: 'yeontaek', name: '연택', icon: '🧒' },
]

function toLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekDays(offset = 0) {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
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
  const [stamps, setStamps] = useState({})       // { `kidId_dateStr`: [0,1,...] }
  const [targets, setTargets] = useState({})     // { `kidId_dateStr`: count }
  const [targetInputs, setTargetInputs] = useState({})
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(new Set())
  const [batchHours, setBatchHours] = useState({}) // { kidId: '숫자' }

  const weekDays = getWeekDays(weekOffset)
  const weekLabel = `${weekDays[0]} ~ ${weekDays[6]}`
  const isAdmin = userId === 'admin'
  const visibleKids = isAdmin ? KIDS : KIDS.filter(k => k.id === userId)
  const today = toLocalDate(new Date())

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 이번 주 도장
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

      // 이번 주 목표
      const { data: targetData } = await supabase
        .from('daily_targets')
        .select('user_id, date_str, target_count')
        .in('date_str', weekDays)

      const targetMap = {}
      const inputMap = {}
      ;(targetData || []).forEach(t => {
        const key = `${t.user_id}_${t.date_str}`
        targetMap[key] = t.target_count
        inputMap[key] = String(t.target_count)
      })
      setTargets(targetMap)
      setTargetInputs(prev => ({ ...inputMap, ...prev }))

      // 전체 통계
      const { data: allStamps } = await supabase
        .from('study_stamps')
        .select('user_id, date_str, stamp_index')

      const { data: allTargets } = await supabase
        .from('daily_targets')
        .select('user_id, date_str, target_count')

      const { data: payouts } = await supabase
        .from('custom_events')
        .select('user_id, amount')
        .eq('event_type', 'payout')

      const targetLookup = {}
      ;(allTargets || []).forEach(t => {
        targetLookup[`${t.user_id}_${t.date_str}`] = t.target_count
      })

      const statMap = {}
      KIDS.forEach(k => {
        let money = 0, coupons = 0
        ;(allStamps || []).filter(s => s.user_id === k.id).forEach(s => {
          const target = targetLookup[`${k.id}_${s.date_str}`] || 0
          if (s.stamp_index < target) money += RATE
          else coupons += 1
        })
        const paid = (payouts || [])
          .filter(p => p.user_id === k.id)
          .reduce((sum, p) => sum + p.amount, 0)
        statMap[k.id] = { money: money + paid, coupons }
      })
      setStats(statMap)
    } catch (e) {
      console.error('로드 실패:', e)
    }
    setLoading(false)
  }, [weekDays.join(',')])

  useEffect(() => { loadData() }, [loadData])

  // 도장 클릭 (DB 응답 후 UI 갱신 - race condition 방지)
  const handleStampClick = async (kidId, dateStr, stampIndex) => {
    const cellKey = `${kidId}_${dateStr}_${stampIndex}`
    if (processing.has(cellKey)) return

    setProcessing(prev => new Set([...prev, cellKey]))

    const key = `${kidId}_${dateStr}`
    const hasStamp = (stamps[key] || []).includes(stampIndex)

    try {
      if (hasStamp) {
        await removeStamp(kidId, dateStr, stampIndex)
      } else {
        await addStamp(kidId, dateStr, stampIndex)
      }
      // DB에서 해당 날짜 도장 재조회
      const { data } = await supabase
        .from('study_stamps')
        .select('stamp_index')
        .eq('user_id', kidId)
        .eq('date_str', dateStr)
      setStamps(prev => ({ ...prev, [key]: (data || []).map(s => s.stamp_index) }))
    } catch (e) {
      console.error('도장 오류:', e)
      alert('저장 실패! 잠시 후 다시 눌러보세요.')
    }

    setProcessing(prev => {
      const next = new Set(prev)
      next.delete(cellKey)
      return next
    })
  }

  // 주간 일괄 시간 배정
  const handleBatchSet = async (kidId) => {
    const val = parseInt(batchHours[kidId] || '0')
    const count = Math.max(0, Math.min(MAX_STAMPS, isNaN(val) ? 0 : val))
    try {
      for (const dateStr of weekDays) {
        await setTarget(kidId, dateStr, count)
      }
      const newTargets = {}
      const newInputs = {}
      weekDays.forEach(d => {
        newTargets[`${kidId}_${d}`] = count
        newInputs[`${kidId}_${d}`] = String(count)
      })
      setTargets(prev => ({ ...prev, ...newTargets }))
      setTargetInputs(prev => ({ ...prev, ...newInputs }))
      setBatchHours(prev => ({ ...prev, [kidId]: '' }))
    } catch (e) {
      alert('일괄 배정 실패: ' + e.message)
    }
  }

  // 목표 시간 저장
  const handleTargetSave = async (kidId, dateStr) => {
    const inputKey = `${kidId}_${dateStr}`
    const raw = targetInputs[inputKey]
    const count = Math.max(0, Math.min(MAX_STAMPS, parseInt(raw) || 0))
    try {
      await setTarget(kidId, dateStr, count)
      setTargets(prev => ({ ...prev, [inputKey]: count }))
      setTargetInputs(prev => ({ ...prev, [inputKey]: String(count) }))
    } catch (e) {
      console.error('목표 저장 실패:', e)
      alert('저장 실패: ' + e.message)
    }
  }

  // 용돈 지급
  const handlePayout = async (kidId) => {
    const money = stats[kidId]?.money || 0
    if (money === 0) return
    const kidName = KIDS.find(k => k.id === kidId)?.name
    const msg = money > 0
      ? `${kidName}에게 ${money.toLocaleString()}원 지급할까요?`
      : `${kidName}의 마이너스 잔액(${money.toLocaleString()}원)을 0원으로 초기화할까요?`
    if (!window.confirm(msg)) return
    try {
      const { error } = await supabase
        .from('custom_events')
        .insert([{ user_id: kidId, event_type: 'payout', amount: -money }])
      if (error) throw error
      await loadData()
    } catch (e) {
      alert('지급 실패!')
    }
  }

  return (
    <div className="board-page">
      {/* 헤더 */}
      <header className="board-header">
        <h1>📚 공부 도장판</h1>
        <div className="header-right">
          <span className="user-badge">
            {isAdmin ? '👩 관리자' : `${KIDS.find(k => k.id === userId)?.icon} ${KIDS.find(k => k.id === userId)?.name}`}
          </span>
          <button className="btn-logout" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      {/* 주 네비게이션 */}
      <div className="week-nav">
        <button className="week-btn" onClick={() => setWeekOffset(o => o - 1)}>◀ 이전</button>
        <span className="week-label">{weekLabel}</span>
        <button className="week-btn" onClick={() => setWeekOffset(o => o + 1)}>다음 ▶</button>
      </div>

      {loading && <div className="loading">불러오는 중...</div>}

      {!loading && visibleKids.map(kid => {
        const kidStats = stats[kid.id] || { money: 0, coupons: 0 }
        return (
          <div key={kid.id} className="kid-section">
            {/* 아이 헤더 */}
            <div className="kid-header">
              <span className="kid-name">{kid.icon} {kid.name}</span>
              <div className="kid-stats">
                <span className="stat-money">💰 {kidStats.money.toLocaleString()}원</span>
                <span className="stat-coupon">🎟 {kidStats.coupons}장</span>
                {isAdmin && (
                  <button
                    className={`btn-payout ${kidStats.money === 0 ? 'disabled' : ''}`}
                    onClick={() => handlePayout(kid.id)}
                    disabled={kidStats.money === 0}
                  >
                    {kidStats.money < 0 ? '초기화' : '지급'}
                  </button>
                )}
              </div>
            </div>

            {/* 주간 일괄 배정 (관리자) */}
            {isAdmin && (
              <div className="batch-row">
                <span className="batch-label">📅 주간 일괄:</span>
                <input
                  type="number"
                  min="0"
                  max={MAX_STAMPS}
                  className="batch-input"
                  value={batchHours[kid.id] ?? ''}
                  onChange={e => setBatchHours(prev => ({ ...prev, [kid.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleBatchSet(kid.id)}
                  placeholder="시간"
                />
                <span className="batch-unit">시간</span>
                <button className="btn-batch" onClick={() => handleBatchSet(kid.id)}>
                  {kid.name} 전체 배정
                </button>
              </div>
            )}

            {/* 도장 테이블 */}
            <div className="stamp-grid-wrapper">
              <table className="stamp-table">
                <thead>
                  <tr>
                    <th className="row-num-header">시간</th>
                    {weekDays.map((d, i) => (
                      <th key={d} className={d === today ? 'today-col' : ''}>
                        <div className="day-label">{DAY_LABELS[i]}</div>
                        <div className="date-label">{d.slice(5)}</div>
                        {isAdmin ? (
                          <input
                            type="number"
                            min="0"
                            max={MAX_STAMPS}
                            className="target-cell-input"
                            value={targetInputs[`${kid.id}_${d}`] ?? ''}
                            onChange={e => setTargetInputs(prev => ({
                              ...prev, [`${kid.id}_${d}`]: e.target.value
                            }))}
                            onBlur={() => handleTargetSave(kid.id, d)}
                            onKeyDown={e => e.key === 'Enter' && handleTargetSave(kid.id, d)}
                            placeholder="0h"
                          />
                        ) : (
                          <div className="target-display">{targets[`${kid.id}_${d}`] || 0}h</div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: MAX_STAMPS }, (_, si) => (
                    <tr key={si}>
                      <td className="row-num">{si + 1}</td>
                      {weekDays.map(dateStr => {
                        const key = `${kid.id}_${dateStr}`
                        const target = targets[key] || 0
                        const filled = (stamps[key] || []).includes(si)
                        const withinTarget = si < target
                        const isCoupon = filled && !withinTarget
                        const cellKey = `${kid.id}_${dateStr}_${si}`
                        const isProcessing = processing.has(cellKey)
                        const canClick = (isAdmin || kid.id === userId) && !isProcessing

                        return (
                          <td
                            key={dateStr}
                            className={`stamp-cell ${dateStr === today ? 'today-col' : ''} ${withinTarget ? 'in-range' : 'out-range'}`}
                            onClick={() => canClick && handleStampClick(kid.id, dateStr, si)}
                          >
                            {isProcessing ? (
                              <span className="stamp-processing">⏳</span>
                            ) : filled ? (
                              <span className={`stamp ${isCoupon ? 'stamp-coupon' : 'stamp-filled'}`}>
                                {isCoupon ? '⭐' : '🔴'}
                              </span>
                            ) : withinTarget ? (
                              <span className="stamp stamp-empty">⭕</span>
                            ) : (
                              <span className="stamp-dot" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 일별 합계 */}
            <div className="week-summary">
              <div className="summary-spacer" />
              {weekDays.map(dateStr => {
                const key = `${kid.id}_${dateStr}`
                const target = targets[key] || 0
                const dayStamps = stamps[key] || []
                const moneyCount = dayStamps.filter(i => i < target).length
                const couponCount = dayStamps.filter(i => i >= target).length
                return (
                  <div key={dateStr} className={`day-summary ${dateStr === today ? 'today-summary' : ''}`}>
                    <span className="summary-count">{moneyCount}/{target}h</span>
                    <span className="summary-money">{(moneyCount * RATE).toLocaleString()}원</span>
                    {couponCount > 0 && <span className="summary-coupon">🎟{couponCount}</span>}
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
