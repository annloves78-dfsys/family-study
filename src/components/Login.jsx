import { useState } from 'react'
import { login, changePassword } from '../api'

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

  const handleLogin = async (password = pw) => {
    setLoading(true)
    setError('')
    try {
      const res = await login(selected.id, password)
      onLogin(res.userId, res.token)
    } catch (e) {
      setError(e?.message || '로그인에 실패했습니다.')
    }
    setLoading(false)
  }

  const handleChangePassword = async ({
    currentPassword = pw,
    nextPassword = newPw,
    confirmation = confirmPw,
  } = {}) => {
    setError('')
    if (!nextPassword) { setError('새 비밀번호를 입력해주세요.'); return }
    if (nextPassword !== confirmation) { setError('새 비밀번호가 일치하지 않습니다.'); return }
    setLoading(true)
    try {
      const res = await changePassword(selected.id, currentPassword, nextPassword)
      onLogin(res.userId, res.token)
    } catch (e) {
      setError(e?.message || '비밀번호 변경에 실패했습니다.')
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

      <p className="login-note">한 번 로그인하면 다음부터는 바로 들어와요</p>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>{selected.name} {isChanging ? '비밀번호 변경' : '로그인'}</h2>

            {!isChanging ? (
              <form
                className="credential-form"
                onSubmit={e => {
                  e.preventDefault()
                  const data = new FormData(e.currentTarget)
                  handleLogin(String(data.get('password') || ''))
                }}
              >
                <p className="modal-hint">비밀번호를 입력하세요</p>
                <input
                  type="text"
                  name="username"
                  value={`family-${selected.id}`}
                  autoComplete="section-family username"
                  className="password-username-context"
                  tabIndex={-1}
                  readOnly
                  aria-hidden="true"
                />
                <input
                  type="password"
                  name="password"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="비밀번호"
                  autoComplete="section-family current-password"
                  autoFocus
                  className="pw-input"
                />
                {error && <p className="error-msg">{error}</p>}
                <div className="modal-btns">
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? '...' : '로그인'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => { setIsChanging(true); setPw(''); setError('') }}>
                    비밀번호 변경
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>취소</button>
                </div>
              </form>
            ) : (
              <form
                className="credential-form"
                onSubmit={e => {
                  e.preventDefault()
                  const data = new FormData(e.currentTarget)
                  handleChangePassword({
                    currentPassword: String(data.get('current-password') || ''),
                    nextPassword: String(data.get('new-password') || ''),
                    confirmation: String(data.get('new-password-confirmation') || ''),
                  })
                }}
              >
                <p className="modal-hint">현재 비밀번호와 새 비밀번호를 입력하세요</p>
                <input
                  type="text"
                  name="username"
                  value={`family-${selected.id}`}
                  autoComplete="section-family username"
                  className="password-username-context"
                  tabIndex={-1}
                  readOnly
                  aria-hidden="true"
                />
                <input type="password" name="current-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="현재 비밀번호" autoComplete="section-family current-password" className="pw-input" autoFocus />
                <input type="password" name="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="새 비밀번호" autoComplete="section-family new-password" className="pw-input" />
                <input type="password" name="new-password-confirmation" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="새 비밀번호 확인" autoComplete="section-family new-password" className="pw-input" />
                {error && <p className="error-msg">{error}</p>}
                <div className="modal-btns">
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? '...' : '변경 후 로그인'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => { setIsChanging(false); setPw(''); setError('') }}>뒤로</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
