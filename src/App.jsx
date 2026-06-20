import { useState } from 'react'
import Login from './components/Login'
import ChildDashboard from './components/ChildDashboard'
import AdminDashboard from './components/AdminDashboard'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null) // 'yoonseo', 'yeonwoo', 'yeontaek', 'admin'

  const handleLogout = () => setCurrentUser(null)

  return (
    <>
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>
      <div className="container">
        {!currentUser && <Login onSelectUser={setCurrentUser} />}
        {currentUser === 'admin' && <AdminDashboard onLogout={handleLogout} />}
        {currentUser && currentUser !== 'admin' && <ChildDashboard userId={currentUser} onLogout={handleLogout} />}
      </div>
    </>
  )
}
