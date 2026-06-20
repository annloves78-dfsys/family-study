import { useState, useEffect } from 'react'
import { api } from '../db'

export default function SchoolCalendar({ userId, schoolCode, yyyymm }) {
    const [events, setEvents] = useState([])
    const [customEvents, setCustomEvents] = useState([])
    const [loading, setLoading] = useState(true)

    // Modal state for adding custom event
    const [showModal, setShowModal] = useState(false)
    const [selectedDateStr, setSelectedDateStr] = useState('')
    const [newEventText, setNewEventText] = useState('')
    const [newEventTarget, setNewEventTarget] = useState('all') // 'all', 'yoonseo', 'yeonwoo', 'yeontaek'

    const year = parseInt(yyyymm.substring(0,4))
    const month = parseInt(yyyymm.substring(4,6))

    const fetchData = async () => {
        setLoading(true)
        if (schoolCode) {
            const evts = await api.getMonthSchedule(schoolCode, yyyymm)
            setEvents(evts)
        }
        const custom = await api.getCustomEvents(userId, yyyymm)
        setCustomEvents(custom)
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
    }, [userId, schoolCode, yyyymm])

    const getDaysInMonth = (y, m) => new Date(y, m, 0).getDate()
    const getFirstDay = (y, m) => new Date(y, m - 1, 1).getDay()

    const daysCount = getDaysInMonth(year, month)
    const firstDay = getFirstDay(year, month)

    const days = []
    for(let i=0; i<firstDay; i++) days.push(null)
    for(let i=1; i<=daysCount; i++) days.push(i)

    const handleDayClick = (day) => {
        if (!day) return
        const dateStr = `${year}${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}`
        setSelectedDateStr(dateStr)
        setNewEventText('')
        setNewEventTarget(userId === 'admin' ? 'all' : userId)
        setShowModal(true)
    }

    const handleAddEvent = async () => {
        if (!newEventText.trim()) return
        const targetUserId = newEventTarget === 'all' ? null : newEventTarget;
        await api.addCustomEvent(targetUserId, selectedDateStr, newEventText.trim())
        setShowModal(false)
        fetchData()
    }

    return (
        <div className="glass-card" style={{position: 'relative'}}>
            {showModal && (
                <div className="modal" style={{position:'absolute', borderRadius:'24px', zIndex:50}}>
                    <div className="modal-content glass-card" style={{padding:'1.5rem', width:'90%'}}>
                        <h3 style={{marginBottom:'1rem'}}>{selectedDateStr.substring(6,8)}일 일정 추가 📅</h3>
                        
                        {userId === 'admin' && (
                            <div className="input-group" style={{marginBottom:'1rem', textAlign:'left'}}>
                                <label>대상 선택</label>
                                <select value={newEventTarget} onChange={e=>setNewEventTarget(e.target.value)}>
                                    <option value="all">가족 전체</option>
                                    <option value="yoonseo">윤서</option>
                                    <option value="yeonwoo">연우</option>
                                    <option value="yeontaek">연택</option>
                                </select>
                            </div>
                        )}

                        <div className="input-group" style={{marginBottom:'1rem', textAlign:'left'}}>
                            <label>일정 내용</label>
                            <input type="text" value={newEventText} onChange={e=>setNewEventText(e.target.value)} placeholder="예: 가족 여행, 수학 학원 보충" />
                        </div>
                        <div style={{display:'flex', gap:'0.5rem'}}>
                            <button className="btn btn-primary" onClick={handleAddEvent}>추가</button>
                            <button className="btn btn-secondary" onClick={()=>setShowModal(false)}>취소</button>
                        </div>
                    </div>
                </div>
            )}

            <h2>{userId === 'admin' ? '가족 전체 달력 📅' : '우리 학교 학사일정 📅'}</h2>
            <p className="small-text">{year}년 {month}월 (날짜를 클릭해 일정을 추가하세요)</p>
            
            {loading ? <p style={{textAlign:'center', marginTop:'2rem'}}>달력을 불러오는 중...</p> : (
                <div className="calendar-grid">
                    <div className="cal-header" style={{color:'#fca5a5'}}>일</div>
                    <div className="cal-header">월</div>
                    <div className="cal-header">화</div>
                    <div className="cal-header">수</div>
                    <div className="cal-header">목</div>
                    <div className="cal-header">금</div>
                    <div className="cal-header" style={{color:'#93c5fd'}}>토</div>
                    
                    {days.map((day, idx) => {
                        if (!day) return <div key={idx} className="cal-day empty"></div>
                        
                        const dateStr = `${year}${String(month).padStart(2,'0')}${String(day).padStart(2,'0')}`
                        const dayEvents = events.filter(e => e.AA_YMD === dateStr)
                        const dayCustomEvents = customEvents.filter(e => e.date_str === dateStr)

                        const isSunday = idx % 7 === 0
                        const isSaturday = idx % 7 === 6
                        const hasHoliday = dayEvents.some(e => e.SBTR_DD_SC_NM === '휴업일' || e.SBTR_DD_SC_NM === '공휴일' || e.SBTR_DD_SC_NM === '방학')

                        return (
                            <div key={idx} className="cal-day" onClick={() => handleDayClick(day)}>
                                <div className="cal-date" style={{ color: isSunday||hasHoliday ? '#fca5a5' : isSaturday ? '#93c5fd' : 'inherit' }}>
                                    {day}
                                </div>
                                {dayEvents.map((e, i) => (
                                    <div key={`neis-${i}`} className={`cal-event ${hasHoliday ? 'cal-holiday' : ''}`}>
                                        {e.EVENT_NM}
                                    </div>
                                ))}
                                {dayCustomEvents.map((e, i) => (
                                    <div key={`custom-${i}`} className="cal-event cal-custom-event">
                                        ⭐ {e.event_text}
                                    </div>
                                ))}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
