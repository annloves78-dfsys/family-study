import { useState, useEffect, useCallback } from 'react'
import { fetchBoard, addStamp, removeStamp } from '../api'

const RATE = 500
const MAX_STAMPS = 15

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

export default function TodayBoard({ userId, kidId = userId, onLogout, onWeek, isPreview = false }) {
  const todayObj = new Date()
  const yesterdayObj = new Date(todayObj)
  yesterdayObj.setDate(todayObj.getDate() - 1)
  const today = toLocalDate(todayObj)
  const yesterday = toLocalDate(yesterdayObj)

  const [dateStr, setDateStr] = useState(today)
  const [stamps, setStamps] = useState({})   // { dateStr: { index: {isCouponUsed} } }
  const [targets, setTargets] = useState({}) // { dateStr: count }
  const [stat, setStat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [couponMode, setCouponMode] = useState(false)

  const kid = KIDS.find(k => k.id === kidId) || { name: '나', icon: '🙂' }

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true)
    try {
      const data = await fetchBoard([yesterday, today])

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
  }, [kidId, today, yesterday])

  useEffect(() => { loadData(true) }, [loadData])

  const dayStamps = stamps[dateStr] || {}
  const target = targets[dateStr] || 0
  const filled = Object.keys(dayStamps).length
  const doneInTarget = Object.keys(dayStamps).filter(i => Number(i) < target).length
  const extra = Object.keys(dayStamps).filter(i => Number(i) >= target).length

  // 보여줄 동그라미 개수: 목표만큼 + 이미 찍은 초과분 + 다음 한 칸
  const slots = Math.min(MAX_STAMPS, Math.max(target, filled + 1))

  const handleTap = async (index) => {
    if (busy) return
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
  const dayWord = dateStr === today ? '오늘' : '어제'
  const [, mm, dd] = dateStr.split('-')

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

      {/* 어제 / 오늘 */}
      <div className="today-daypick">
        <button
          className={`daypick-btn ${dateStr === yesterday ? 'active' : ''}`}
          onClick={() => { setDateStr(yesterday); setError('') }}
        >어제</button>
        <button
          className={`daypick-btn ${dateStr === today ? 'active' : ''}`}
          onClick={() => { setDateStr(today); setError('') }}
        >오늘</button>
      </div>

      <div className="today-date">{parseInt(mm)}월 {parseInt(dd)}일 {dayLabel}요일</div>

      {/* 오늘 진행 */}
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

      {/* 도장 동그라미 */}
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
              className={`today-stamp ${cls}`}
              onClick={() => handleTap(i)}
              disabled={busy}
              aria-label={`${i + 1}번째 도장`}
            >
              {isFilled ? (isExtra ? '⭐' : (data.isCouponUsed ? '🎫' : '🔴')) : i + 1}
            </button>
          )
        })}
      </div>

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

      {stat?.settledUntil && (
        <div className="today-paid">✅ {parseInt(stat.settledUntil.split('-')[1])}/{parseInt(stat.settledUntil.split('-')[2])}까지 받았어요</div>
      )}
    </div>
  )
}
