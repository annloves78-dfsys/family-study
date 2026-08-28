// 로그인 세션 유지 (localStorage에 서버 토큰 저장)
const KEY = 'stamp_session'

let cache = undefined

function read() {
  if (cache !== undefined) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? JSON.parse(raw) : null
    if (cache && (!cache.token || !cache.userId)) cache = null
  } catch {
    cache = null
  }
  return cache
}

export function getToken() {
  return read()?.token || null
}

export function getUserId() {
  return read()?.userId || null
}

export function saveSession(userId, token) {
  cache = { userId, token }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // 저장에 실패해도 이번 세션에서는 정상 동작
  }
}

export function clearSession() {
  cache = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // noop
  }
}
