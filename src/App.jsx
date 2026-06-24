import { useState } from 'react'
import Login from './components/Login'
import WeeklyBoard from './components/WeeklyBoard'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)

  const handleLogout = () => setCurrentUser(null)

  return (
    <>
      {!currentUser ? (
        <Login onSelectUser={setCurrentUser} />
      ) : (
        <WeeklyBoard userId={currentUser} onLogout={handleLogout} />
      )}
    </>
  )
}
