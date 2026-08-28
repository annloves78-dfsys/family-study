// 빌드 결과(dist)에 PHP API를 합쳐서 그대로 FTP 업로드할 수 있게 만듭니다.
//   npm run deploy:build
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const api = resolve(root, 'api')

if (!existsSync(dist)) {
  console.error('dist 폴더가 없습니다. 먼저 npm run build 를 실행하세요.')
  process.exit(1)
}

mkdirSync(resolve(dist, 'api'), { recursive: true })
cpSync(api, resolve(dist, 'api'), { recursive: true })

console.log('준비 완료 → dist/ 폴더 전체를 가비아 웹루트에 올리세요.')
console.log('  (dist/api/config.php 가 들어있는지 꼭 확인하세요)')
if (!existsSync(resolve(api, 'config.php'))) {
  console.log('  ⚠ api/config.php 가 아직 없습니다. config.sample.php 를 복사해서 만들어 주세요.')
}
