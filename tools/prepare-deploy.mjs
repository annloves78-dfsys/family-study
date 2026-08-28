// 서버에 올릴 폴더(upload/)를 만듭니다.
//   npm run deploy:build
//
// upload/
// ├── api/   <- server/ (index.js, package.json)
// └── www/   <- dist/   (index.html, assets/)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const server = resolve(root, 'server')
const upload = resolve(root, 'upload')

if (!existsSync(dist)) {
  console.error('dist 폴더가 없습니다. 먼저 npm run build 를 실행하세요.')
  process.exit(1)
}

rmSync(upload, { recursive: true, force: true })
mkdirSync(upload, { recursive: true })

cpSync(dist, resolve(upload, 'www'), { recursive: true })
mkdirSync(resolve(upload, 'api'), { recursive: true })
for (const f of ['index.js', 'package.json']) {
  cpSync(resolve(server, f), resolve(upload, 'api', f))
}

console.log('준비 완료 → upload/ 폴더를 서버로 올리세요.')
console.log('  scp -r upload stamp-server:~/stamp-upload')
console.log('  ssh stamp-server "sudo bash ~/deploy/scripts/02_deploy.sh ~/stamp-upload"')
