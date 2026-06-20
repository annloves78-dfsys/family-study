import { useState, useEffect } from 'react'
import { api } from '../db'
import Planner from './Planner'
import SchoolCalendar from './SchoolCalendar'

export default function ChildDashboard({ userId, onLogout }) {
    const [user, setUser] = useState(null)
    const [txs, setTxs] = useState([])
    const [dayInfo, setDayInfo] = useState({ isHoliday: false, isVacation: false })
    
    const [hours, setHours] = useState('')
    const [minutes, setMinutes] = useState('0')
    const [toast, setToast] = useState('')

    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const dateString = `${yyyy}-${mm}-${dd}`
    const neisDateString = `${yyyy}${mm}${dd}`
    const isWeekend = today.getDay() === 0 || today.getDay() === 6

    const loadData = async () => {
        let u = await api.getProfile(userId)
        if (u.lastStudyDate !== dateString) {
            u.lastStudyDate = dateString
            u.todayStudiedMinutes = 0
            await api.updateProfile(userId, u)
        }
        setUser(u)
        setTxs(await api.getTransactions(userId))
        setDayInfo(await api.getHolidayInfo(u.schoolCode, neisDateString, isWeekend))
    }

    useEffect(() => { loadData() }, [userId])

    const showToast = (msg) => {
        setToast(msg)
        setTimeout(() => setToast(''), 3000)
    }

    const handleAdd = async () => {
        const addedMins = (Number(hours) * 60) + Number(minutes)
        if (addedMins === 0) { showToast('⚠️ 시간을 입력해주세요!'); return; }

        let finalTarget = user.targetWeekday;
        if (dayInfo.isVacation) finalTarget = user.targetVacation;
        else if (dayInfo.isHoliday) finalTarget = user.targetWeekend;

        const earnedMoney = Math.floor(addedMins / 30) * 250;
        const oldTotal = user.todayStudiedMinutes;
        const newTotal = oldTotal + addedMins;
        const extraBefore = Math.max(0, oldTotal - finalTarget);
        const extraAfter = Math.max(0, newTotal - finalTarget);
        const newlyAddedExtra = extraAfter - extraBefore;

        let accExtra = user.accumulatedExtraMinutes + newlyAddedExtra;
        let earnedCoupons = 0;
        if (accExtra >= 60) {
            earnedCoupons = Math.floor(accExtra / 60);
            accExtra = accExtra % 60;
        }

        const updatedUser = {
            ...user,
            accumulatedExtraMinutes: accExtra,
            todayStudiedMinutes: newTotal,
            money: user.money + earnedMoney,
            coupons: user.coupons + earnedCoupons
        }
        await api.updateProfile(userId, updatedUser)
        
        const titleStr = `${hours>0 ? hours+'시간 ' : ''}${minutes>0 ? minutes+'분 ' : ''}공부 완료`;
        await api.addTransaction({ userId, title: titleStr, amount: earnedMoney, coupons: earnedCoupons, isDeduct: false })

        setHours('')
        setMinutes('0')
        showToast(`🎉 용돈 ${earnedMoney}원 획득! ${earnedCoupons>0 ? '(🎟️ 쿠폰발급!)' : ''}`)
        loadData()
    }

    if (!user) return <div className="loading-overlay"><div className="spinner"></div></div>

    let finalTarget = user.targetWeekday;
    if (dayInfo.isVacation) finalTarget = user.targetVacation;
    else if (dayInfo.isHoliday) finalTarget = user.targetWeekend;

    let pct = finalTarget === 0 ? 100 : (user.todayStudiedMinutes / finalTarget) * 100;

    return (
        <div>
            {toast && <div className="toast show">{toast}</div>}
            <header>
                <div className="header-top">
                    <button className="btn-icon" onClick={onLogout}>⬅️ 뒤로</button>
                    <h1>{user.name}, 반가워요! 👋</h1>
                </div>
                <p>{yyyy}년 {mm}월 {dd}일</p>
                {dayInfo.isHoliday && <div className="badge">{dayInfo.isVacation ? '야호! 방학이다! 🌴' : '오늘은 쉬는 날! 🎉'}</div>}
                <p className="target-info">오늘 목표: {finalTarget}분</p>
            </header>

            <div className="grid-2">
                <div className="glass-card">
                    <h2>내 지갑 💰</h2>
                    <div className="balance-display">
                        <span className="amount">{user.money.toLocaleString()}</span>
                        <span className="currency">원</span>
                    </div>
                </div>
                <div className="glass-card">
                    <h2>보너스 쿠폰 🎟️</h2>
                    <div className="balance-display">
                        <span className="amount">{user.coupons}</span>
                        <span className="currency">장</span>
                    </div>
                    <p className="small-text">다음 쿠폰까지: {user.accumulatedExtraMinutes}/60분 초과 달성 중</p>
                </div>
            </div>

            <div className="glass-card">
                <h2>오늘 공부 추가하기 ✍️ (30분 단위)</h2>
                <div className="progress-info">
                    <span>현재 달성: {user.todayStudiedMinutes} / {finalTarget} 분</span>
                </div>
                <div className="progress-bar-container" style={{marginBottom:'1.5rem'}}>
                    <div className="progress-bar" style={{width: `${Math.min(100, pct)}%`}}></div>
                </div>
                <div className="input-group-row">
                    <div className="input-group">
                        <label>시간</label>
                        <input type="number" min="0" value={hours} onChange={e=>setHours(e.target.value)} placeholder="0" />
                    </div>
                    <div className="input-group">
                        <label>분</label>
                        <select value={minutes} onChange={e=>setMinutes(e.target.value)}>
                            <option value="0">0분</option>
                            <option value="30">30분</option>
                        </select>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={handleAdd}>공부 완료!</button>
            </div>

            <div className="grid-2">
                <Planner userId={userId} dateString={dateString} />
                <SchoolCalendar schoolCode={user.schoolCode} yyyymm={`${yyyy}${mm}`} />
            </div>

            <div className="glass-card">
                <h2>내역 (최근 6개월) 📜</h2>
                <div className="history-list">
                    {txs.length === 0 ? <p style={{color:'#94a3b8', textAlign:'center'}}>내역이 없습니다.</p> : null}
                    {txs.map(tx => (
                        <div key={tx.id} className={`history-item ${tx.isDeduct ? 'deduct' : ''}`}>
                            <div>
                                <span className="history-title">{tx.title}</span>
                                <span className="history-date">{tx.date}</span>
                            </div>
                            <div className="history-amount">
                                {tx.isDeduct ? '-' : '+'}{tx.amount.toLocaleString()}원
                                {tx.coupons > 0 ? ` / ${tx.isDeduct ? '-' : '+'}${tx.coupons}장` : ''}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
