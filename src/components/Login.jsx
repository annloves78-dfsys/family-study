import { useState } from 'react'
import { api } from '../db'

export default function Login({ onSelectUser }) {
    const [selectedUser, setSelectedUser] = useState(null)
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')

    const users = [
        { id: 'yoonseo', name: '윤서', icon: '👩' },
        { id: 'yeonwoo', name: '연우', icon: '👦' },
        { id: 'yeontaek', name: '연택', icon: '🧒' },
        { id: 'admin', name: '관리자', icon: '👑' }
    ]

    const handleSelect = (u) => {
        setSelectedUser(u)
        setPassword('')
        setError('')
    }

    const handleLogin = async () => {
        const isValid = await api.checkPassword(selectedUser.id, password)
        if (isValid) {
            onSelectUser(selectedUser.id)
        } else {
            setError('비밀번호가 틀렸습니다.')
        }
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

            {selectedUser && (
                <div className="modal">
                    <div className="modal-content">
                        <h2>{selectedUser.name} 로그인</h2>
                        <p style={{marginBottom:'1rem'}}>비밀번호를 입력해주세요.</p>
                        
                        <input 
                            type="password" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)} 
                            placeholder="비밀번호" 
                            onKeyDown={e => e.key === 'Enter' && handleLogin()}
                            autoFocus
                        />
                        {error && <p style={{color:'var(--danger-color)', marginTop:'0.5rem', fontSize:'0.9rem'}}>{error}</p>}
                        
                        <div className="modal-actions">
                            <button className="btn" onClick={handleLogin}>확인</button>
                            <button className="btn btn-outline" onClick={() => setSelectedUser(null)}>취소</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
