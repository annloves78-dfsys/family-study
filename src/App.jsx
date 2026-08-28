import { useState, useEffect } from 'react'
import Login from './components/Login'
import WeeklyBoard from './components/WeeklyBoard'
import { getToken, getUserId, saveSession, clearSession } from './session'
import { me, logout as apiLogout } from './api'

export default function App() {
  // 저장된 토큰이 있으면 서버에 확인 후 자동 로그인
  const [userId, setUserId] = useState(null)
  const [checking, setChecking] = useState(() => Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return
    let alive = true
    me()
      .then(res => {
        if (!alive) return
        if (res.userId) setUserId(res.userId)
        else clearSession()
      })
      .catch(() => {
        // 서버에 못 붙었을 때는 토큰을 지우지 않고 로그인 화면만 보여줍니다
        if (alive && getUserId()) setUserId(null)
      })
      .finally(() => alive && setChecking(false))
    return () => { alive = false }
  }, [])

  const handleLogin = (id, token) => {
    saveSession(id, token)
    setUserId(id)
  }

  const handleLogout = async () => {
    try { await apiLogout() } catch { /* 서버가 안 되어도 로컬은 지웁니다 */ }
    clearSession()
    setUserId(null)
  }

  if (checking) {
    return <div className="app-splash">불러오는 중...</div>
  }

  if (!userId) {
    return <Login onLogin={handleLogin} />
  }

  return <WeeklyBoard userId={userId} onLogout={handleLogout} />
}
