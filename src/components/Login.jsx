import { useState } from 'react'
import { api } from '../db'

export default function Login({ onSelectUser }) {
    const [selectedUser, setSelectedUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [password, setPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [isSettingPassword, setIsSettingPassword] = useState(false)

    const users = [
        { id: 'yoonseo', name: '윤서', icon: '👩' },
        { id: 'yeonwoo', name: '연우', icon: '👦' },
        { id: 'yeontaek', name: '연택', icon: '🧒' },
        { id: 'admin', name: '관리자', icon: '👑' }
    ]

    const handleSelect = async (u) => {
        setSelectedUser(u)
        const p = await api.getProfile(u.id)
        setProfile(p)
        setPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
        setIsSettingPassword(false)
    }

    const handleLogin = async () => {
        const isValid = await api.checkPassword(selectedUser.id, password)
        if (isValid) {
            onSelectUser(selectedUser.id)
        } else {
            setError('비밀번호가 틀렸습니다.')
        }
    }

    const handleSetPassword = async () => {
        // 1. 기존(초기) 비밀번호가 맞는지 확인
        const isValid = await api.checkPassword(selectedUser.id, password)
        if (!isValid) {
            setError('기존 비밀번호(초기 비밀번호)가 틀렸습니다.')
            return
        }
        if (!newPassword) {
            setError('새 비밀번호를 입력해주세요.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('새 비밀번호가 일치하지 않습니다.')
            return
        }
        await api.setPassword(selectedUser.id, newPassword)
        onSelectUser(selectedUser.id)
    }

    return (
        <div className="container" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <header>
                <h1>도장판 공부 기록장 🎯</h1>
                <p>자신의 프로필을 선택하고 로그인하세요.</p>
            </header>

            <div className="profile-grid">
                {users.map(u => (
                    <div key={u.id} className="profile-card" onClick={() => handleSelect(u)}>
                        <div className="avatar">{u.icon}</div>
                        <h3>{u.name}</h3>
                    </div>
                ))}
            </div>

            {selectedUser && profile && (
                <div className="modal">
                    <div className="modal-content">
                        <h2>{selectedUser.name} {!isSettingPassword ? '로그인' : '비밀번호 변경'}</h2>
                        
                        {!isSettingPassword ? (
                            <>
                                <p style={{marginBottom:'1rem'}}>비밀번호를 입력해주세요. (초기 0000)</p>
                                <input 
                                    type="password" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    placeholder="비밀번호" 
                                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                    autoFocus
                                />
                                {error && <p style={{color:'var(--danger-color)', marginTop:'0.5rem', fontSize:'0.9rem'}}>{error}</p>}
                                <div className="modal-actions" style={{flexWrap: 'wrap', gap: '0.5rem'}}>
                                    <button className="btn" onClick={handleLogin}>로그인</button>
                                    <button className="btn btn-outline" onClick={() => {
                                        setIsSettingPassword(true);
                                        setError('');
                                        setPassword('');
                                    }}>비밀번호 변경</button>
                                    <button className="btn btn-outline" onClick={() => setSelectedUser(null)}>취소</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p style={{marginBottom:'1rem', color:'var(--primary-color)', fontWeight:'bold', fontSize:'0.9rem'}}>
                                    현재 비밀번호(초기 0000)를 입력한 뒤,<br/>새로운 비밀번호를 설정해주세요.
                                </p>
                                <div className="input-group">
                                    <input 
                                        type="password" 
                                        value={password} 
                                        onChange={e => setPassword(e.target.value)} 
                                        placeholder="현재 비밀번호 입력" 
                                        autoFocus
                                    />
                                </div>
                                <div className="input-group">
                                    <input 
                                        type="password" 
                                        value={newPassword} 
                                        onChange={e => setNewPassword(e.target.value)} 
                                        placeholder="새 비밀번호 입력" 
                                    />
                                </div>
                                <div className="input-group">
                                    <input 
                                        type="password" 
                                        value={confirmPassword} 
                                        onChange={e => setConfirmPassword(e.target.value)} 
                                        placeholder="새 비밀번호 확인" 
                                        onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                                    />
                                </div>
                                {error && <p style={{color:'var(--danger-color)', marginTop:'0.5rem', fontSize:'0.9rem'}}>{error}</p>}
                                <div className="modal-actions" style={{flexWrap: 'wrap', gap: '0.5rem'}}>
                                    <button className="btn" onClick={handleSetPassword}>설정 및 로그인</button>
                                    <button className="btn btn-outline" onClick={() => {
                                        setIsSettingPassword(false);
                                        setError('');
                                        setPassword('');
                                    }}>뒤로가기</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
