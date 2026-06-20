import { useState, useEffect } from 'react'
import { api } from '../db'
import SchoolCalendar from './SchoolCalendar'

export default function AdminDashboard({ onLogout }) {
    const [kids, setKids] = useState([])
    const [txs, setTxs] = useState([])
    const [toast, setToast] = useState('')

    const [selectedKid, setSelectedKid] = useState('yoonseo')
    const [settings, setSettings] = useState({ targetWeekday: 120, targetWeekend: 60, targetVacation: 120 })

    const [showModal, setShowModal] = useState(false)
    const [transferKid, setTransferKid] = useState(null)
    const [transferReason, setTransferReason] = useState('')
    const [transferAmt, setTransferAmt] = useState(0)
    const [transferCps, setTransferCps] = useState(0)

    const today = new Date()
    const yyyymm = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`

    const loadData = async () => {
        const users = ['yoonseo', 'yeonwoo', 'yeontaek']
        const loadedKids = []
        for (const k of users) {
            loadedKids.push({ id: k, ...await api.getProfile(k) })
        }
        setKids(loadedKids)
        setTxs(await api.getTransactions())
    }

    useEffect(() => { loadData() }, [])

    useEffect(() => {
        const loadSettings = async () => {
            const u = await api.getProfile(selectedKid)
            setSettings({ targetWeekday: u.targetWeekday, targetWeekend: u.targetWeekend, targetVacation: u.targetVacation })
        }
        loadSettings()
    }, [selectedKid])

    const showToast = (msg) => {
        setToast(msg)
        setTimeout(() => setToast(''), 3000)
    }

    const handleSaveSettings = async () => {
        const u = await api.getProfile(selectedKid)
        u.targetWeekday = Number(settings.targetWeekday)
        u.targetWeekend = Number(settings.targetWeekend)
        u.targetVacation = Number(settings.targetVacation)
        await api.updateProfile(selectedKid, u)
        showToast('✅ 설정이 저장되었습니다.')
    }

    const handleOpenTransfer = (kidId) => {
        setTransferKid(kids.find(k => k.id === kidId))
        setTransferReason('')
        setTransferAmt(0)
        setTransferCps(0)
        setShowModal(true)
    }

    const handleDeduct = async () => {
        const amt = Number(transferAmt)
        const cps = Number(transferCps)
        if (amt === 0 && cps === 0) { showToast('⚠️ 금액이나 쿠폰을 입력하세요.'); return; }

        const kid = await api.getProfile(transferKid.id)
        kid.money = Math.max(0, kid.money - amt)
        kid.coupons = Math.max(0, kid.coupons - cps)
        
        await api.updateProfile(transferKid.id, kid)
        await api.addTransaction({
            userId: transferKid.id,
            title: `${kid.name}: ${transferReason || '수동 차감'}`,
            amount: amt,
            coupons: cps,
            isDeduct: true
        })

        setShowModal(false)
        showToast('✅ 정상적으로 차감되었습니다.')
        loadData()
    }

    return (
        <div>
            {toast && <div className="toast show">{toast}</div>}
            
            {showModal && transferKid && (
                <div className="modal">
                    <div className="modal-content glass-card">
                        <h2>금액/쿠폰 차감하기 💸</h2>
                        <p style={{marginBottom:'1.5rem'}}>{transferKid.name}의 잔액을 차감하고 내역을 남깁니다.</p>
                        <div className="input-group" style={{marginBottom:'1rem', textAlign:'left'}}>
                            <label>차감 사유 (예: 편의점 간식)</label>
                            <input type="text" value={transferReason} onChange={e=>setTransferReason(e.target.value)} placeholder="사유를 입력하세요" />
                        </div>
                        <div className="input-group-row">
                            <div className="input-group" style={{textAlign:'left'}}>
                                <label>차감 금액 (원)</label>
                                <input type="number" step="500" min="0" value={transferAmt} onChange={e=>setTransferAmt(e.target.value)} />
                            </div>
                            <div className="input-group" style={{textAlign:'left'}}>
                                <label>차감 쿠폰 (장)</label>
                                <input type="number" step="1" min="0" value={transferCps} onChange={e=>setTransferCps(e.target.value)} />
                            </div>
                        </div>
                        <div style={{marginTop:'1.5rem', display:'flex', flexDirection:'column', gap:'0.5rem'}}>
                            <button className="btn btn-primary" onClick={handleDeduct}>적용하기</button>
                            <button className="btn btn-secondary" onClick={()=>setShowModal(false)}>취소</button>
                        </div>
                    </div>
                </div>
            )}

            <header>
                <div className="header-top">
                    <button className="btn-icon" onClick={onLogout}>⬅️ 뒤로</button>
                    <h1>관리자 대시보드 👑</h1>
                </div>
            </header>

            <div className="admin-grid">
                {kids.map(k => (
                    <div key={k.id} className="admin-kid-card">
                        <div className="admin-kid-info">
                            <h3>{k.name} ({k.grade})</h3>
                            <p style={{color:'#c7d2fe', fontSize:'0.9rem'}}>잔액: {k.money.toLocaleString()}원 | 쿠폰: {k.coupons}장</p>
                        </div>
                        <button className="btn btn-primary btn-small" onClick={() => handleOpenTransfer(k.id)}>수동 차감</button>
                    </div>
                ))}
            </div>

            <div className="glass-card" style={{marginTop:'2rem'}}>
                <SchoolCalendar userId="admin" schoolCode={null} yyyymm={yyyymm} />
            </div>

            <div className="glass-card" style={{marginTop:'2rem'}}>
                <h2>기본 목표 설정 ⚙️</h2>
                <select className="custom-select" style={{marginBottom:'1rem', width:'100%'}} value={selectedKid} onChange={e=>setSelectedKid(e.target.value)}>
                    <option value="yoonseo">윤서</option>
                    <option value="yeonwoo">연우</option>
                    <option value="yeontaek">연택</option>
                </select>

                <div className="grid-3">
                    <div className="input-group">
                        <label>평일 (분)</label>
                        <input type="number" step="30" value={settings.targetWeekday} onChange={e=>setSettings({...settings, targetWeekday: e.target.value})} />
                    </div>
                    <div className="input-group">
                        <label>주말/휴일 (분)</label>
                        <input type="number" step="30" value={settings.targetWeekend} onChange={e=>setSettings({...settings, targetWeekend: e.target.value})} />
                    </div>
                    <div className="input-group">
                        <label>방학 (분)</label>
                        <input type="number" step="30" value={settings.targetVacation} onChange={e=>setSettings({...settings, targetVacation: e.target.value})} />
                    </div>
                </div>
                <button className="btn btn-outline" style={{marginTop:'1.5rem'}} onClick={handleSaveSettings}>설정 저장</button>
            </div>

            <div className="glass-card" style={{marginTop:'2rem'}}>
                <h2>전체 내역 모아보기 📜</h2>
                <div className="history-list" style={{maxHeight:'400px'}}>
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
