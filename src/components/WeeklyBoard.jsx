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
    const [myStats, setMyStats] = useState({ money: 0, coupons: 0 })
    const [loading, setLoading] = useState(true)

    // Admin target setting modal
    const [showAdminModal, setShowAdminModal] = useState(false)
    const [selectedDate, setSelectedDate] = useState('')
    const [targetHours, setTargetHours] = useState(2)

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
        
        for (const kid of kidsList) {
            const stamps = await api.getStamps(kid.id)
            stampsData[kid.id] = stamps
            
            // fetch targets for the week
            const targets = await api.getTargets(kid.id, weekDates[0].dateStr, weekDates[6].dateStr)
            targetsData[kid.id] = {}
            targets.forEach(t => { targetsData[kid.id][t.date_str] = t.target_count })
        }
        
        setAllStamps(stampsData)
        setAllTargets(targetsData)

        if (userId !== 'admin') {
            const stats = await api.getStats(userId)
            setMyStats(stats)
        }
        setLoading(false)
    }

    useEffect(() => { loadData() }, [startDate, userId])

    const handleStampClick = async (kidId, dateStr, stampIndex) => {
        if (userId !== 'admin' && userId !== kidId) return; // Cannot click others
        // Admin also shouldn't stamp for kids directly based on prompt, but we can allow it or block it. 
        // Prompt says "자기 이름으로 들어간 것만 자기가 체크 가능". 
        if (userId === 'admin') return; 

        await api.toggleStamp(kidId, dateStr, stampIndex);
        loadData();
    }

    const handleDayClick = (dateStr) => {
        if (userId !== 'admin') return;
        setSelectedDate(dateStr)
        setShowAdminModal(true)
    }

    const handleSaveTarget = async () => {
        // Apply target to all kids
        const userIds = kidsList.map(k => k.id)
        await api.setTargetAll(userIds, selectedDate, targetHours)
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
        setStartDate(new Date())
    }

    return (
        <div className="container">
            {showAdminModal && (
                <div className="modal">
                    <div className="modal-content">
                        <h2>목표 시간 설정 ⏰</h2>
                        <p style={{marginBottom:'1.5rem'}}>{selectedDate} 일괄 배정</p>
                        <div className="input-group">
                            <label>목표 시간 (도장 개수)</label>
                            <input type="number" min="0" max="10" value={targetHours} onChange={e => setTargetHours(Number(e.target.value))} />
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
                                                    const isFilled = stampsForDay.some(s => s.stamp_index === idx)
                                                    const isTarget = idx < targetCount
                                                    const isMine = userId === kid.id
                                                    const boxClass = `stamp-box ${!isMine ? 'readonly' : ''} ${isTarget && !isFilled ? 'target' : ''} ${isFilled ? 'filled' : ''}`
                                                    
                                                    return (
                                                        <div 
                                                            key={idx} 
                                                            className={boxClass}
                                                            onClick={() => handleStampClick(kid.id, d.dateStr, idx)}
                                                        >
                                                            {isFilled && '⭕'}
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
            
            {userId === 'admin' && (
                <div style={{marginTop: '2rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                    날짜 칸을 클릭하면 해당 날짜의 목표 도장 개수를 설정할 수 있습니다.
                </div>
            )}
        </div>
    )
}
