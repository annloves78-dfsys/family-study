// 도장판 서비스워커
//
// 원칙 (아이들 앱이 캐시 때문에 눌러붙지 않도록 보수적으로 갑니다)
//  - /api/ 는 절대 캐시하지 않습니다. 항상 서버로 갑니다.
//  - /assets/ 의 파일들은 이름에 해시가 붙어 절대 안 바뀌므로 캐시 우선.
//  - 그 외(index.html 등)는 네트워크 우선, 실패하면 캐시.
//    -> 새로 배포하면 다음에 열 때 바로 새 화면이 뜹니다.
//  - GET 이 아닌 요청은 손대지 않습니다.

const VERSION = 'v1'
const CACHE = `stamp-${VERSION}`

self.addEventListener('install', (event) => {
  // 새 서비스워커를 바로 활성화
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html']).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // 다른 도메인(구글 폰트 등)은 브라우저에 맡깁니다
  if (url.origin !== self.location.origin) return

  // API 는 절대 캐시하지 않습니다
  if (url.pathname.includes('/api/')) return

  // 해시가 붙은 정적 파일: 캐시 우선
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
    return
  }

  // 나머지: 네트워크 우선, 안 되면 캐시
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  )
})
