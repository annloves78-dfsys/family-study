import { getToken } from './session'

// 배포 시에는 index.html 과 같은 폴더의 api/ 를 바라봅니다.
// 로컬 개발 중 원격 서버를 쓰고 싶으면 .env.local 에
//   VITE_API_BASE=https://내도메인/api/
// 를 넣어주세요.
const API_BASE =
  import.meta.env.VITE_API_BASE || new URL('api/', document.baseURI).href

async function call(action, payload = {}) {
  const token = getToken()
  let res
  try {
    res = await fetch(`${API_BASE}?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token ? { token, ...payload } : payload),
    })
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.')
  }

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`서버 응답 오류 (${res.status}): ${text.slice(0, 150)}`)
  }
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`)
  return data
}

// ===== 인증 =====
export const login = (userId, password) => call('login', { userId, password })

export const changePassword = (userId, currentPassword, newPassword) =>
  call('change_password', { userId, currentPassword, newPassword })

export const me = () => call('me')

export const logout = () => call('logout')

// ===== 보드 =====
export const fetchBoard = (week) => call('board', { week })

// ===== 도장 =====
export const addStamp = (userId, dateStr, stampIndex, isCouponUsed = false) =>
  call('stamp_add', { userId, dateStr, stampIndex, isCouponUsed })

export const removeStamp = (userId, dateStr, stampIndex) =>
  call('stamp_remove', { userId, dateStr, stampIndex })

// ===== 목표 시간 =====
export const setTarget = (userId, dateStr, count) =>
  call('target_set', { userId, dateStr, count })

// ===== 용돈 지급 =====
export const addPayout = (userId, amount, couponAmount, settledUntil) =>
  call('payout_add', { userId, amount, couponAmount, settledUntil })

// ===== 위젯 =====
export const widgetToken = (userId) => call('widget_token', { userId })
