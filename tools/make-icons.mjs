// 앱 아이콘(PNG)을 만듭니다. 외부 라이브러리 없이 Node 내장 zlib 만 씁니다.
//   npm run make:icons
// 결과: public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public')

// ---------- PNG 인코더 ----------
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // color type: RGBA
  ihdr[10] = 0     // deflate
  ihdr[11] = 0     // filter
  ihdr[12] = 0     // no interlace

  // 각 줄 앞에 필터 바이트(0) 을 붙입니다
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 그리기 ----------
const SS = 4 // 4배로 그린 뒤 줄여서 계단현상을 없앱니다

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

// padding: 0~0.5, 마스커블 아이콘은 잘려도 되도록 여백을 크게 줍니다
function drawIcon(size, padding = 0) {
  const S = size * SS
  const big = Buffer.alloc(S * S * 4)

  const cx = S / 2
  const cy = S / 2
  const inner = S * (1 - padding * 2)      // 실제 그림이 들어갈 영역
  const radius = inner * 0.22              // 둥근 모서리
  const left = (S - inner) / 2

  const c1 = [102, 126, 234]   // #667eea
  const c2 = [118, 75, 162]    // #764ba2
  const white = [255, 255, 255]
  const red = [255, 94, 98]    // #ff5e62

  const ringOuter = inner * 0.34
  const ringInner = inner * 0.26
  const dot = inner * 0.185

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4

      // 둥근 사각형 안쪽인지
      const rx = Math.max(left - x, x - (left + inner), 0)
      const ry = Math.max(left - y, y - (left + inner), 0)
      let insideBg = rx === 0 && ry === 0
      if (insideBg) {
        // 모서리 둥글리기
        const dxc = Math.max(left + radius - x, x - (left + inner - radius), 0)
        const dyc = Math.max(left + radius - y, y - (left + inner - radius), 0)
        if (dxc > 0 && dyc > 0 && Math.hypot(dxc, dyc) > radius) insideBg = false
      }

      if (!insideBg) {
        big[i] = big[i + 1] = big[i + 2] = big[i + 3] = 0
        continue
      }

      // 대각선 그라데이션 배경
      const t = ((x - left) / inner + (y - left) / inner) / 2
      let [r, g, b] = mix(c1, c2, Math.min(1, Math.max(0, t)))

      // 흰 링 (도장 테두리)
      const d = Math.hypot(x - cx, y - cy)
      if (d <= ringOuter && d >= ringInner) [r, g, b] = white
      // 가운데 빨간 도장
      if (d <= dot) [r, g, b] = red

      big[i] = r
      big[i + 1] = g
      big[i + 2] = b
      big[i + 3] = 255
    }
  }

  // 축소 (평균)
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const j = ((y * SS + sy) * S + (x * SS + sx)) * 4
          const al = big[j + 3] / 255
          r += big[j] * al; g += big[j + 1] * al; b += big[j + 2] * al; a += big[j + 3]
        }
      }
      const n = SS * SS
      const alpha = a / n
      const k = alpha > 0 ? 255 / alpha : 0
      const i = (y * size + x) * 4
      out[i] = Math.round((r / n) * k)
      out[i + 1] = Math.round((g / n) * k)
      out[i + 2] = Math.round((b / n) * k)
      out[i + 3] = Math.round(alpha)
    }
  }
  return encodePng(size, size, out)
}

mkdirSync(OUT, { recursive: true })

const files = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  // 마스커블: 안드로이드가 원형 등으로 잘라내므로 여백을 크게
  ['icon-maskable-512.png', 512, 0.14],
  // iOS 홈 화면 아이콘은 투명/둥근모서리를 직접 처리하므로 꽉 채웁니다
  ['apple-touch-icon.png', 180, 0],
]

for (const [name, size, pad] of files) {
  const png = drawIcon(size, pad)
  writeFileSync(resolve(OUT, name), png)
  console.log(`  ${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)}KB`)
}
console.log('아이콘 생성 완료:', OUT)
