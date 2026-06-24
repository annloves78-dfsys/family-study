import { useState, useEffect } from 'react'
import { api } from '../db'

export default function WeeklyBoard({ userId, onLogout }) {
    const kidsList = [
        { id: 'yoonseo', name: '윤서' },
        { id: 'yeonwoo', name: '연우' },
        { id: 'yeontaek', name: '연택' }
    ];

    // 시작 날짜를 6/25 목요일(2026-06-25)로 고정
    const [startDate, setStartDate] = useState(new Date('2026-06-25'))
    const [allStamps, setAllStamps] = useState({})
    const [allTargets, setAllTargets] = useState({})
    
    // 나의 통계(아이용) 및 모든 통계(관리자용)
    const [myStats, setMyStats] = useState({ money: 0, coupons: 0 })
    const [allStats, setAllStats] = useState({}) 
    const [loading, setLoading] = useState(true)

    // Coupon mode for kids
    const [isCouponMode, setIsCouponMode] = useState(false)

    // Admin target setting modal
    const [showAdminModal, setShowAdminModal] = useState(false)
    const [selectedDate, setSelectedDate] = useState('')
    const [targetMap, setTargetMap] = useState({})

    const getFormattedDate = (date) => {
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }

    const getDayName = (date) => {
        const days = ['일', '월', '화', '수', '목', '금', '토']
        return days[date.getDay()]
    }

    const weekDates = Array.from({length: 7}).map((_, i) => {
        const d = new Date(startDate)
        d.setDate(d.getDate() + i)
        return { dateObj: d, dateStr: getFormattedDate(d), dayName: getDayName(d) }
    })

    const loadData = async () => {
        setLoading(true)
        const stampsData = {}
        const targetsData = {}
        const statsData = {}
        
        for (const kid of kidsList) {
            const stamps = await api.getStamps(kid.id)
            stampsData[kid.id] = stamps
            
            // fetch targets for the week
            const targets = await api.getTargets(kid.id, weekDates[0].dateStr, weekDates[6].dateStr)
            targetsData[kid.id] = {}
            targets.forEach(t => { targetsData[kid.id][t.date_str] = t.target_count })

            if (userId === 'admin') {
                statsData[kid.id] = await api.getStats(kid.id)
            }
        }
        
        setAllStamps(stampsData)
        setAllTargets(targetsData)

        if (userId === 'admin') {
            setAllStats(statsData)
        } else {
            const stats = await api.getStats(userId)
            setMyStats(stats)
            if (stats.coupons <= 0) setIsCouponMode(false) // 쿠폰 없으면 모드 해제
        }
        setLoading(false)
    }

    useEffect(() => { loadData() }, [startDate, userId])

    const handleStampClick = async (kidId, dateStr, stampIndex) => {
        const stampsForDay = allStamps[kidId]?.filter(s => s.date_str === dateStr) || []
        const existingStamp = stampsForDay.find(s => s.stamp_index === stampIndex)
        const targetCount = allTargets[kidId]?.[dateStr] || 0;
        
        // 1. 관리자(Admin)의 경우
        if (userId === 'admin') {
            if (existingStamp) {
                const msg = existingStamp.is_coupon 
                    ? "쿠폰 사용을 취소하시겠습니까? (쿠폰 1장이 반환됩니다)" 
                    : "실제 공부한 도장입니다. 지우시겠습니까?";
                if (window.confirm(msg)) {
                    await api.toggleStamp(kidId, dateStr, stampIndex);
                    loadData();
                }
            } else {
                if (stampIndex >= targetCount) {
                    alert("초과 시간은 쿠폰으로 채울 수 없습니다.");
                    return;
                }
                const availableCoupons = allStats[kidId]?.coupons || 0;
                if (availableCoupons <= 0) {
                    alert("사용 가능한 쿠폰이 없습니다!");
                    return;
                }
                if (window.confirm("쿠폰 1장을 사용하여 도장을 채우시겠습니까? (용돈은 동일하게 지급됩니다)")) {
                    await api.toggleStamp(kidId, dateStr, stampIndex, true);
                    loadData();
                }
            }
            return;
        }

        // 2. 아이들 본인의 경우
        if (userId !== kidId) return; // Cannot click others

        if (isCouponMode) {
            // 쿠폰 모드일 때
            if (existingStamp) {
                if (existingStamp.is_coupon) {
                    if (window.confirm("사용한 쿠폰을 취소하시겠습니까? (쿠폰 1장이 반환됩니다)")) {
                        await api.toggleStamp(kidId, dateStr, stampIndex);
                        loadData();
                    }
                } else {
                    alert("이 칸은 실제 공부로 채운 도장입니다. 취소하려면 쿠폰 모드를 끄고 눌러주세요.");
                }
            } else {
                if (stampIndex >= targetCount) {
                    alert("초과 시간(목표 이후 칸)은 쿠폰으로 채울 수 없습니다.");
                    return;
                }
                if (myStats.coupons <= 0) {
                    alert("사용 가능한 쿠폰이 부족합니다!");
                    setIsCouponMode(false);
                    return;
                }
                if (window.confirm("쿠폰 1장을 사용하여 도장을 채울까요? (빈 칸이 🎟️ 모양으로 채워집니다)")) {
                    await api.toggleStamp(kidId, dateStr, stampIndex, true);
                    loadData();
                }
            }
            return;
        }

        // 일반 모드일 때
        if (existingStamp && existingStamp.is_coupon) {
            if (window.confirm("쿠폰으로 채운 도장입니다. 쿠폰 사용을 취소하시겠습니까?")) {
                await api.toggleStamp(kidId, dateStr, stampIndex);
                loadData();
            }
            return;
        }

        await api.toggleStamp(kidId, dateStr, stampIndex);
        loadData();
    }

    const handleDayClick = (dateStr) => {
        if (userId !== 'admin') return;
        setSelectedDate(dateStr)
        const currentTargets = {}
        kidsList.forEach(k => {
            currentTargets[k.id] = allTargets[k.id]?.[dateStr] || 0
        })
        setTargetMap(currentTargets)
        setShowAdminModal(true)
    }

    const handleSaveTarget = async () => {
        for (const kid of kidsList) {
            await api.setTarget(kid.id, selectedDate, targetMap[kid.id] || 0)
        }
        setShowAdminModal(false)
        loadData()
    }

    const handlePrevWeek = () => {
        const newD = new Date(startDate)
        newD.setDate(newD.getDate() - 7)
        setStartDate(newD)
    }
    const handleNextWeek = () => {
        const newD = new Date(startDate)
        newD.setDate(newD.getDate() + 7)
        setStartDate(newD)
    }
    const handleToday = () => {
        setStartDate(new Date('2026-06-25')) // 6/25로 초기화
    }

    return (
        <div className="container">
            {showAdminModal && (
                <div className="modal">
                    <div className="modal-content">
                        <h2>목표 시간 개별 설정 ⏰</h2>
                        <p style={{marginBottom:'1.5rem'}}>{selectedDate}</p>
                        <div className="input-group">
                            {kidsList.map(kid => (
                                <div key={kid.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem'}}>
                                    <label style={{margin: 0}}>{kid.name}의 목표</label>
                                    <input 
                                        type="number" 
                                        min="0" max="10" 
                                        value={targetMap[kid.id] || 0} 
                                        onChange={e => setTargetMap({...targetMap, [kid.id]: Number(e.target.value)})} 
                                        style={{width: '100px'}}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button className="btn" onClick={handleSaveTarget}>저장</button>
                            <button className="btn btn-outline" onClick={() => setShowAdminModal(false)}>취소</button>
                        </div>
                    </div>
                </div>
            )}

            <header style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                    <h1 style={{textAlign: 'left', margin: 0}}>
                        {userId === 'admin' ? '가족 도장판 (관리자)' : '나의 도장판'} 🎯
                    </h1>
                </div>
                <button className="btn btn-outline btn-small" onClick={onLogout}>로그아웃</button>
            </header>

            {userId !== 'admin' && (
                <div style={{background: isCouponMode ? '#eff6ff' : '#f9fafb', padding: '1rem', borderRadius: '12px', border: `1px solid ${isCouponMode ? '#3b82f6' : 'var(--border-color)'}`, marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s'}}>
                    <div>
                        <div style={{fontWeight: 'bold', color: isCouponMode ? '#1e40af' : 'var(--text-primary)'}}>🎟️ 쿠폰 사용 모드</div>
                        <div style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>
                            {isCouponMode ? '이제 채우지 못한 목표 칸을 클릭하면 쿠폰이 사용됩니다.' : '모은 쿠폰으로 빈 칸을 채울 수 있습니다.'}
                        </div>
                    </div>
                    <button 
                        className={`btn ${isCouponMode ? '' : 'btn-outline'}`}
                        style={{background: isCouponMode ? '#3b82f6' : '', color: isCouponMode ? 'white' : ''}}
                        onClick={() => setIsCouponMode(!isCouponMode)}
                        disabled={!isCouponMode && myStats.coupons <= 0}
                    >
                        {isCouponMode ? '끄기' : '켜기'}
                    </button>
                </div>
            )}

            <div className="board-container">
                <div className="board-header">
                    <button className="board-nav-btn" onClick={handlePrevWeek}>◀</button>
                    <h2 style={{fontSize: '1.2rem', margin: 0}}>
                        <span onClick={handleToday} style={{cursor:'pointer'}}>{weekDates[0].dateStr} ~ {weekDates[6].dateStr}</span>
                    </h2>
                    <button className="board-nav-btn" onClick={handleNextWeek}>▶</button>
                </div>

                {loading ? <div style={{padding:'3rem', textAlign:'center'}}>불러오는 중...</div> : (
                    <div>
                        {weekDates.map(d => (
                            <div key={d.dateStr} className="day-row">
                                <div className="day-date" onClick={() => handleDayClick(d.dateStr)}>
                                    <span>{d.dateStr.substring(5)} ({d.dayName})</span>
                                    {userId === 'admin' && <span style={{color:'var(--primary-color)', fontSize:'0.8rem'}}>⚙️ 설정</span>}
                                </div>
                                
                                {kidsList.map(kid => {
                                    const stampsForDay = allStamps[kid.id]?.filter(s => s.date_str === d.dateStr) || []
                                    const targetCount = allTargets[kid.id]?.[d.dateStr] || 0
                                    
                                    return (
                                        <div key={kid.id} className="kid-row">
                                            <div className="kid-name">{kid.name}</div>
                                            <div className="stamps-container">
                                                {Array.from({length: 10}).map((_, idx) => {
                                                    const existing = stampsForDay.find(s => s.stamp_index === idx)
                                                    const isFilled = !!existing
                                                    const isCoupon = isFilled && existing.is_coupon
                                                    const isTarget = idx < targetCount
                                                    const isMine = userId === kid.id
                                                    const canAdminClick = userId === 'admin' && (!isFilled ? isTarget : true)
                                                    const isClickable = isMine || canAdminClick
                                                    
                                                    const boxClass = `stamp-box ${!isClickable ? 'readonly' : ''} ${isTarget && !isFilled ? 'target' : ''} ${isFilled && !isCoupon ? 'filled' : ''}`
                                                    
                                                    const extraStyle = isCoupon ? { background: '#eff6ff', borderColor: '#3b82f6', color: '#3b82f6' } : {}

                                                    return (
                                                        <div 
                                                            key={idx} 
                                                            className={boxClass}
                                                            style={extraStyle}
                                                            onClick={() => handleStampClick(kid.id, d.dateStr, idx)}
                                                        >
                                                            {isFilled && (isCoupon ? '🎟️' : '⭕')}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {userId !== 'admin' && !loading && (
                <div className="stats-container">
                    <div className="stat-box">
                        <div className="label">누적 용돈</div>
                        <div className="value">{myStats.money.toLocaleString()}원</div>
                    </div>
                    <div className="stat-box">
                        <div className="label">보너스 쿠폰</div>
                        <div className="value">{myStats.coupons}장</div>
                    </div>
                </div>
            )}
            
            {userId === 'admin' && !loading && (
                <div style={{marginTop: '2rem'}}>
                    <h3>아이들 누적 현황 💰</h3>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem'}}>
                        {kidsList.map(kid => (
                            <div key={kid.id} style={{padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '12px', background: '#f9fafb', textAlign: 'center'}}>
                                <div style={{fontWeight: 'bold', marginBottom: '0.5rem'}}>{kid.name}</div>
                                <div style={{color: 'var(--primary-color)', fontWeight: 'bold'}}>{allStats[kid.id]?.money.toLocaleString()}원</div>
                                <div style={{color: 'var(--text-secondary)', fontSize: '0.9rem'}}>쿠폰: {allStats[kid.id]?.coupons}장</div>
                            </div>
                        ))}
                    </div>
                    <div style={{marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                        날짜 칸을 클릭하면 해당 날짜의 목표 도장 개수를 일괄 배정할 수 있습니다.
                    </div>
                </div>
            )}
        </div>
    )
}
