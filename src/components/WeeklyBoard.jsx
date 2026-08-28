import { useState, useEffect, useCallback } from 'react'
import { fetchBoard, addStamp, removeStamp, setTarget, addPayout, widgetToken } from '../api'

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

// '2026-08-27' -> '8/27'
function formatMD(dateStr) {
  if (!dateStr) return ''
  const parts = String(dateStr).slice(0, 10).split('-')
  if (parts.length < 3) return String(dateStr)
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`
}

// timestamptz -> '8/27'
function formatStamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
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

// 위젯이 부를 주소 (지금 열려 있는 주소 기준)
const WIDGET_URL = typeof document !== 'undefined'
  ? new URL('api/', document.baseURI).href
  : '/api/'

function copy(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => alert('복사했어요'),
      () => window.prompt('길게 눌러 복사하세요', text)
    )
  } else {
    window.prompt('길게 눌러 복사하세요', text)
  }
}

export default function WeeklyBoard({ userId, onLogout, onToday, onPreview }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [stamps, setStamps] = useState({})       // { `kidId_dateStr`: { stampIndex: { isCouponUsed } } }
  const [targets, setTargets] = useState({})     // { `kidId_dateStr`: count }
  const [targetInputs, setTargetInputs] = useState({})
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(new Set())
  const [batchHours, setBatchHours] = useState({})
  const [couponMode, setCouponMode] = useState({}) // { kidId: boolean }
  const [historyKid, setHistoryKid] = useState(null) // 지급 내역 모달
  const [widgetKid, setWidgetKid] = useState(null)   // 위젯 설정 모달
  const [widgetInfo, setWidgetInfo] = useState(null)
  const [widgetBusy, setWidgetBusy] = useState(false)
  const [loadError, setLoadError] = useState('')

  const weekDays = getWeekDays(weekOffset)
  const weekLabel = `${weekDays[0]} ~ ${weekDays[6]}`
  const isAdmin = userId === 'admin'

  // 탭 순서: 관리자는 원래 순서, 아이는 자기 것이 첫 번째
  const tabKids = isAdmin
    ? KIDS
    : [...KIDS.filter(k => k.id === userId), ...KIDS.filter(k => k.id !== userId)]

  const [activeKidId, setActiveKidId] = useState(tabKids[0].id)
  const activeKid = tabKids.find(k => k.id === activeKidId) || tabKids[0]

  const todayObj = new Date()
  const yesterdayObj = new Date(todayObj)
  yesterdayObj.setDate(todayObj.getDate() - 1)
  const today = toLocalDate(todayObj)
  const yesterday = toLocalDate(yesterdayObj)

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    try {
      const data = await fetchBoard(weekDays)

      // 이번 주 도장
      const stampMap = {}
      ;(data.weekStamps || []).forEach(s => {
        const key = `${s.user_id}_${s.date_str}`
        if (!stampMap[key]) stampMap[key] = {}
        stampMap[key][s.stamp_index] = { isCouponUsed: s.is_coupon_used }
      })
      setStamps(stampMap)

      // 이번 주 목표
      const targetMap = {}
      const inputMap = {}
      ;(data.weekTargets || []).forEach(t => {
        const key = `${t.user_id}_${t.date_str}`
        targetMap[key] = t.target_count
        inputMap[key] = String(t.target_count)
      })
      setTargets(targetMap)
      setTargetInputs(prev => ({ ...inputMap, ...prev }))

      // 전체 통계 (서버에서 계산해서 내려줍니다)
      setStats(data.stats || {})
      setLoadError('')
    } catch (e) {
      console.error('로드 실패:', e)
      setLoadError(e?.message || '데이터를 불러오지 못했습니다.')
    }
    if (isInitial) setLoading(false)
  }, [weekDays.join(',')])

  useEffect(() => { loadData(true) }, [loadData])

  // 실제 DB 저장 실행
  const executeStampToggle = async (kidId, dateStr, stampIndex, isRemove, isCouponUsed) => {
    const cellKey = `${kidId}_${dateStr}_${stampIndex}`
    setProcessing(prev => new Set([...prev, cellKey]))

    // 낙관적 UI 업데이트 (빠른 반응성을 위해 화면 먼저 변경)
    setStamps(prev => {
      const next = { ...prev }
      const key = `${kidId}_${dateStr}`
      next[key] = { ...(next[key] || {}) }
      if (isRemove) {
        delete next[key][stampIndex]
      } else {
        next[key][stampIndex] = { isCouponUsed }
      }
      return next
    })

    try {
      if (isRemove) {
        await removeStamp(kidId, dateStr, stampIndex)
      } else {
        await addStamp(kidId, dateStr, stampIndex, isCouponUsed)
      }
      // 통계 및 화면 전체 갱신 (Race condition 방지 및 실시간 UI 업데이트)
      await loadData()
    } catch (e) {
      console.error('도장 오류:', e)
      alert('저장 실패: ' + (e?.message || JSON.stringify(e)))
    }

    setProcessing(prev => {
      const next = new Set(prev)
      next.delete(cellKey)
      return next
    })
  }

  // 도장 클릭 핸들러
  const handleStampClick = async (kidId, dateStr, stampIndex) => {
    // 날짜 제한 확인 (아이만 해당)
    if (!isAdmin && dateStr !== today && dateStr !== yesterday) {
      alert('오늘과 어제 도장만 체크할 수 있습니다!')
      return
    }

    const cellKey = `${kidId}_${dateStr}_${stampIndex}`
    if (processing.has(cellKey)) return

    const key = `${kidId}_${dateStr}`
    const dayStamps = stamps[key] || {}
    const hasStamp = dayStamps[stampIndex] !== undefined
    const target = targets[key] || 0
    const withinTarget = stampIndex < target
    const usableCoupons = stats[kidId]?.usableCoupons || 0
    const isCouponMode = couponMode[kidId]

    // 순차적 클릭 검사
    const maxIndex = Object.keys(dayStamps).length > 0 ? Math.max(...Object.keys(dayStamps).map(Number)) : -1
    if (hasStamp) {
      if (stampIndex !== maxIndex) {
        alert('가장 마지막 도장부터 순서대로 지워주세요!')
        return
      }
    } else {
      if (stampIndex !== maxIndex + 1) {
        alert('순서대로 도장을 찍어주세요!')
        return
      }
    }

    let useCoupon = false
    if (!hasStamp && withinTarget && isCouponMode) {
      if (usableCoupons > 0) {
        useCoupon = true
      } else {
        alert('사용할 수 있는 쿠폰이 없습니다!')
        setCouponMode(prev => ({ ...prev, [kidId]: false }))
        return
      }
    }

    await executeStampToggle(kidId, dateStr, stampIndex, hasStamp, useCoupon)

    // 쿠폰 모드는 1회 사용 후 자동 해제
    if (useCoupon) {
      setCouponMode(prev => ({ ...prev, [kidId]: false }))
    }
  }

  // 쿠폰 모드 토글
  const toggleCouponMode = (kidId) => {
    const usableCoupons = stats[kidId]?.usableCoupons || 0
    if (usableCoupons <= 0) {
      alert('사용할 수 있는 쿠폰이 없습니다!')
      return
    }
    setCouponMode(prev => ({ ...prev, [kidId]: !prev[kidId] }))
  }

  // 주간 일괄 시간 배정
  const handleBatchSet = async (kidId) => {
    const val = parseInt(batchHours[kidId] || '0')
    const count = Math.max(0, Math.min(MAX_STAMPS, isNaN(val) ? 0 : val))
    try {
      for (const dateStr of weekDays) {
        await setTarget(kidId, dateStr, count)
      }
      await loadData() // 전체 다시 불러오기
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
      await loadData()
    } catch (e) {
      console.error('목표 저장 실패:', e)
      alert('저장 실패: ' + e.message)
    }
  }

  // 위젯용 토큰 발급
  const handleWidget = async (kidObj) => {
    setWidgetKid(kidObj)
    setWidgetInfo(null)
    setWidgetBusy(true)
    try {
      const res = await widgetToken(kidObj.id)
      setWidgetInfo(res)
    } catch (e) {
      alert('위젯 설정 만들기 실패: ' + (e?.message || e))
      setWidgetKid(null)
    }
    setWidgetBusy(false)
  }

  // 용돈 지급 및 마이너스 초기화
  const handlePayout = async (kidId) => {
    const s = stats[kidId] || { unsettledMoney: 0, waitCoupons: 0, lastStampDate: null }
    if (s.unsettledMoney === 0 && s.waitCoupons === 0) return

    const kidName = KIDS.find(k => k.id === kidId)?.name
    // 이번 지급이 커버하는 마지막 날짜 = 지금까지 찍힌 도장 중 가장 늦은 날짜
    const settledUntil = s.lastStampDate || today

    let msg = ''
    if (s.unsettledMoney >= 0) {
      msg = `${kidName}에게 미정산 금액 ${s.unsettledMoney.toLocaleString()}원과 대기 쿠폰 ${s.waitCoupons}장을 지급할까요?`
    } else {
      msg = `${kidName}의 마이너스 잔액(${s.unsettledMoney.toLocaleString()}원)을 0원으로 초기화`
      if (s.waitCoupons > 0) msg += `하고 대기 쿠폰 ${s.waitCoupons}장을 지급할까요?`
      else msg += '할까요?'
    }
    msg += `\n\n정산 기준일: ${formatMD(settledUntil)}까지`

    if (!window.confirm(msg)) return

    try {
      await addPayout(kidId, -s.unsettledMoney, s.waitCoupons, settledUntil)
      await loadData()
    } catch (e) {
      alert('지급 실패: ' + (e?.message || JSON.stringify(e)))
    }
  }

  const kid = activeKid
  const kidStats = stats[kid.id] || { unsettledMoney: 0, usableCoupons: 0, waitCoupons: 0, settledUntil: null, history: [] }
  const hasUnsettled = kidStats.unsettledMoney !== 0 || kidStats.waitCoupons > 0
  const canEditKid = isAdmin || kid.id === userId

  return (
    <div className="board-page">
      {/* 헤더 */}
      <header className="board-header">
        <h1>📚 공부 도장판</h1>
        <div className="header-right">
          <span className="user-badge">
            {isAdmin ? '👩 관리자' : `${KIDS.find(k => k.id === userId)?.icon} ${KIDS.find(k => k.id === userId)?.name}`}
          </span>
          {onToday && (
            <button className="btn-today" onClick={onToday}>오늘 화면</button>
          )}
          <button className="btn-logout" onClick={onLogout}>로그아웃</button>
        </div>
      </header>

      {/* 아이 탭 */}
      <div className="kid-tabs">
        {tabKids.map(k => (
          <button
            key={k.id}
            className={`kid-tab ${k.id === activeKidId ? 'active' : ''}`}
            onClick={() => setActiveKidId(k.id)}
          >
            <span className="kid-tab-icon">{k.icon}</span>
            <span className="kid-tab-name">{k.name}</span>
            {!isAdmin && k.id !== userId && <span className="kid-tab-lock">🔒</span>}
          </button>
        ))}
      </div>

      {/* 주 네비게이션 */}
      <div className="week-nav">
        <button className="week-btn" onClick={() => setWeekOffset(o => o - 1)}>◀ 이전</button>
        <span className="week-label">{weekLabel}</span>
        <button className="week-btn" onClick={() => setWeekOffset(o => o + 1)}>다음 ▶</button>
      </div>

      {loading && <div className="loading">불러오는 중...</div>}
      {loadError && <div className="load-error">⚠ {loadError}</div>}

      {!loading && (
        <div className="kid-section">
          {/* 아이 헤더 */}
          <div className="kid-header">
            <span className="kid-name">{kid.icon} {kid.name}</span>
            <div className="kid-stats">
              <span className="stat-money">💰 {kidStats.unsettledMoney.toLocaleString()}원</span>

              <button
                className={`btn-coupon-toggle ${couponMode[kid.id] ? 'active' : ''}`}
                onClick={() => toggleCouponMode(kid.id)}
                disabled={!canEditKid}
                title="클릭하면 다음 도장은 쿠폰으로 찍힙니다!"
              >
                {couponMode[kid.id] ? '🎫 쿠폰 모드 ON' : `🎟 사용가능: ${kidStats.usableCoupons}장`}
                <span className="coupon-wait">(대기: {kidStats.waitCoupons})</span>
              </button>

              {isAdmin && onPreview && (
                <button
                  className="btn-preview"
                  onClick={() => onPreview(kid.id)}
                  title="아이가 보는 화면을 그대로 봅니다"
                >
                  아이 화면 보기
                </button>
              )}

              {isAdmin && (
                <button
                  className="btn-preview"
                  onClick={() => handleWidget(kid)}
                  title="홈 화면 위젯 버튼 만들기"
                >
                  📱 위젯
                </button>
              )}

              {isAdmin && (
                <button
                  className={`btn-payout ${!hasUnsettled ? 'disabled' : ''}`}
                  onClick={() => handlePayout(kid.id)}
                  disabled={!hasUnsettled}
                >
                  지급
                </button>
              )}
            </div>
          </div>

          {/* 지급 현황 */}
          <div className="payout-status">
            {kidStats.settledUntil ? (
              <span className="paid-until">✅ <b>{formatMD(kidStats.settledUntil)}</b>까지 지급 완료</span>
            ) : (
              <span className="paid-until none">아직 지급 내역이 없어요</span>
            )}
            {kidStats.history && kidStats.history.length > 0 && (
              <button className="btn-history" onClick={() => setHistoryKid(kid)}>
                지급 내역 {kidStats.history.length}건 ▸
              </button>
            )}
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
                      const dayStamps = stamps[key] || {}
                      const filledData = dayStamps[si]
                      const isFilled = filledData !== undefined
                      const isCouponUsed = isFilled && filledData.isCouponUsed
                      const withinTarget = si < target
                      const isEarnedCoupon = isFilled && !withinTarget

                      const cellKey = `${kid.id}_${dateStr}_${si}`
                      const isProcessing = processing.has(cellKey)
                      const canClick = canEditKid && !isProcessing

                      return (
                        <td
                          key={dateStr}
                          className={`stamp-cell ${dateStr === today ? 'today-col' : ''} ${withinTarget ? 'in-range' : 'out-range'}`}
                          onClick={() => canClick && handleStampClick(kid.id, dateStr, si)}
                          style={{ opacity: isProcessing ? 0.6 : 1, cursor: canClick ? 'pointer' : 'default' }}
                        >
                          {isFilled ? (
                            <span className={`stamp ${isEarnedCoupon ? 'stamp-coupon' : 'stamp-filled'}`}>
                              {isEarnedCoupon ? '⭐' : (isCouponUsed ? '🎫' : '🔴')}
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
              <tfoot>
                <tr className="week-summary-row">
                  <td></td>
                  {weekDays.map(dateStr => {
                    const key = `${kid.id}_${dateStr}`
                    const target = targets[key] || 0
                    const dayStamps = stamps[key] || {}
                    const moneyCount = Object.keys(dayStamps).filter(i => parseInt(i) < target).length
                    const earnedCoupons = Object.keys(dayStamps).filter(i => parseInt(i) >= target).length
                    const isPaid = kidStats.settledUntil && dateStr <= kidStats.settledUntil
                    return (
                      <td key={dateStr} className={`day-summary ${dateStr === today ? 'today-summary' : ''}`}>
                        <div className="summary-count">{moneyCount}/{target}h</div>
                        <div className="summary-money">{(moneyCount * RATE).toLocaleString()}원</div>
                        {earnedCoupons > 0 && <div className="summary-coupon">⭐+{earnedCoupons}</div>}
                        {isPaid && <div className="summary-paid">지급완료</div>}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 위젯 설정 모달 */}
      {widgetKid && (
        <div className="modal-overlay" onClick={() => setWidgetKid(null)}>
          <div className="modal-box widget-box" onClick={e => e.stopPropagation()}>
            <h2>📱 {widgetKid.name} 홈 화면 위젯</h2>

            {widgetBusy && <p className="modal-hint">만드는 중...</p>}

            {widgetInfo && (
              <>
                <p className="modal-hint">
                  안드로이드 <b>HTTP Shortcuts</b> 앱에 아래 내용을 그대로 넣으면,
                  홈 화면 버튼 한 번에 도장이 하나 찍힙니다.
                </p>

                <div className="widget-field">
                  <div className="widget-label">주소 (Method: POST)</div>
                  <code className="widget-code">{WIDGET_URL}?action=stamp_next</code>
                  <button className="widget-copy" onClick={() => copy(`${WIDGET_URL}?action=stamp_next`)}>복사</button>
                </div>

                <div className="widget-field">
                  <div className="widget-label">Body (Content type: application/json)</div>
                  <code className="widget-code small">
                    {JSON.stringify({ token: widgetInfo.token, userId: widgetInfo.userId })}
                  </code>
                  <button
                    className="widget-copy"
                    onClick={() => copy(JSON.stringify({ token: widgetInfo.token, userId: widgetInfo.userId }))}
                  >복사</button>
                </div>

                <div className="widget-field">
                  <div className="widget-label">취소 버튼도 만들려면 (주소만 바꾸면 됩니다)</div>
                  <code className="widget-code">{WIDGET_URL}?action=stamp_undo</code>
                  <button className="widget-copy" onClick={() => copy(`${WIDGET_URL}?action=stamp_undo`)}>복사</button>
                </div>

                <p className="widget-warn">
                  ⚠ 이 내용은 {widgetKid.name}의 열쇠입니다. 다른 사람에게 보내지 마세요.<br />
                  {widgetKid.name}가 비밀번호를 바꾸면 위젯이 멈춥니다 — 그때 여기서 다시 만드세요.
                </p>
              </>
            )}

            <div className="modal-btns">
              <button className="btn-ghost" onClick={() => setWidgetKid(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 지급 내역 모달 */}
      {historyKid && (
        <div className="modal-overlay" onClick={() => setHistoryKid(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>{historyKid.icon} {historyKid.name} 지급 내역</h2>
            <div className="history-list">
              <div className="history-row history-head">
                <span className="history-date">지급일</span>
                <span className="history-until">정산 기준</span>
                <span className="history-amount">금액</span>
                <span className="history-coupon">쿠폰</span>
              </div>
              {(stats[historyKid.id]?.history || []).map(h => (
                <div key={h.id} className="history-row">
                  <span className="history-date">{formatStamp(h.created_at)}</span>
                  <span className="history-until">
                    {h.settled_until ? `${formatMD(h.settled_until)}까지` : '-'}
                  </span>
                  <span className="history-amount">{(-h.amount).toLocaleString()}원</span>
                  <span className="history-coupon">{h.coupon_amount > 0 ? `🎟${h.coupon_amount}` : '-'}</span>
                </div>
              ))}
            </div>
            <div className="modal-btns">
              <button className="btn-ghost" onClick={() => setHistoryKid(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
