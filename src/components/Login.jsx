export default function Login({ onSelectUser }) {
  return (
    <div>
      <header>
        <h1>우리가족 공부 기록장 ✨</h1>
        <p>프로필을 선택해주세요. (클라우드 동기화됨)</p>
      </header>
      <div className="profile-grid">
        <div className="profile-card glass-card" onClick={() => onSelectUser('yoonseo')}>
          <div className="avatar bg-purple">👩</div>
          <h3>윤서</h3>
          <p>고등학교 2학년</p>
        </div>
        <div className="profile-card glass-card" onClick={() => onSelectUser('yeonwoo')}>
          <div className="avatar bg-blue">👦</div>
          <h3>연우</h3>
          <p>중학교 1학년</p>
        </div>
        <div className="profile-card glass-card" onClick={() => onSelectUser('yeontaek')}>
          <div className="avatar bg-green">🧒</div>
          <h3>연택</h3>
          <p>초등학교 4학년</p>
        </div>
        <div className="profile-card glass-card admin-card" onClick={() => onSelectUser('admin')}>
          <div className="avatar bg-pink">👑</div>
          <h3>관리자</h3>
          <p>부모님 모드</p>
        </div>
      </div>
    </div>
  )
}
