import { useState } from 'react'
import { getProfile, checkPassword, setPassword } from '../db'

const USERS = [
  { id: 'yoonseo', name: '윤서', icon: '👧' },
  { id: 'yeonwoo', name: '연우', icon: '👦' },
  { id: 'yeontaek', name: '연택', icon: '🧒' },
  { id: 'admin', name: '관리자', icon: '👩' },
]

export default function Login({ onLogin }) {
  const [selected, setSelected] = useState(null)
  const [pw, setPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [isChanging, setIsChanging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSelect = (user) => {
    setSelected(user)
    setPw('')
    setNewPw('')
    setConfirmPw('')
    setError('')
    setIsChanging(false)
  }

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const ok = await checkPassword(selected.id, pw)
      if (ok) {
        onLogin(selected.id)
      } else {
        setError('비밀번호가 틀렸습니다.')
      }
    } catch (e) {
      console.error('로그인 오류:', e)
      setError('오류: ' + (e?.message || e?.code || JSON.stringify(e)))
    }
    setLoading(false)
  }

  const handleChangePassword = async () => {
    setLoading(true)
    setError('')
    try {
      const ok = await checkPassword(selected.id, pw)
      if (!ok) { setError('현재 비밀번호가 틀렸습니다.'); setLoading(false); return }
      if (!newPw) { setError('새 비밀번호를 입력해주세요.'); setLoading(false); return }
      if (newPw !== confirmPw) { setError('새 비밀번호가 일치하지 않습니다.'); setLoading(false); return }
      await setPassword(selected.id, newPw)
      onLogin(selected.id)
    } catch (e) {
      setError('서버 오류가 발생했습니다.')
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-header">
        <h1>📚 도장판 공부 기록장</h1>
        <p>누구로 로그인할까요?</p>
      </div>

      <div className="user-grid">
        {USERS.map(u => (
          <button key={u.id} className="user-card" onClick={() => handleSelect(u)}>
            <span className="user-icon">{u.icon}</span>
            <span className="user-name">{u.name}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>{selected.name} {isChanging ? '비밀번호 변경' : '로그인'}</h2>

            {!isChanging ? (
              <>
                <p className="modal-hint">비밀번호를 입력하세요</p>
                <input
                  type="password"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="비밀번호"
                  autoFocus
                  className="pw-input"
                />
                {error && <p className="error-msg">{error}</p>}
                <div className="modal-btns">
                  <button className="btn-primary" onClick={handleLogin} disabled={loading}>
                    {loading ? '...' : '로그인'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setIsChanging(true); setPw(''); setError('') }}>
                    비밀번호 변경
                  </button>
                  <button className="btn-ghost" onClick={() => setSelected(null)}>취소</button>
                </div>
              </>
            ) : (
              <>
                <p className="modal-hint">현재 비밀번호와 새 비밀번호를 입력하세요</p>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="현재 비밀번호" className="pw-input" autoFocus />
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="새 비밀번호" className="pw-input" />
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangePassword()} placeholder="새 비밀번호 확인" className="pw-input" />
                {error && <p className="error-msg">{error}</p>}
                <div className="modal-btns">
                  <button className="btn-primary" onClick={handleChangePassword} disabled={loading}>
                    {loading ? '...' : '변경 후 로그인'}
                  </button>
                  <button className="btn-ghost" onClick={() => { setIsChanging(false); setPw(''); setError('') }}>뒤로</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
