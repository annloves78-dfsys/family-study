import { useState } from 'react'
import Login from './components/Login'
import WeeklyBoard from './components/WeeklyBoard'

export default function App() {
  const [userId, setUserId] = useState(null)

  if (!userId) {
    return <Login onLogin={setUserId} />
  }

  return <WeeklyBoard userId={userId} onLogout={() => setUserId(null)} />
}
