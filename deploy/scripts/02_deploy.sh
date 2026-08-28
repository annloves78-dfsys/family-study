#!/usr/bin/env bash
# =========================================================
#  도장판 — 코드 배포 (고칠 때마다 실행)
#  실행: sudo bash 02_deploy.sh /경로/업로드한폴더
#
#  업로드한 폴더 구조 (내 PC 에서 npm run deploy:build 하면 만들어집니다)
#    upload/
#    ├── api/          <- server/ 내용 (index.js, package.json)
#    └── www/          <- dist/ 내용 (index.html, assets/)
# =========================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "sudo 로 실행해 주세요."; exit 1; }
SRC="${1:-}"
[[ -n "$SRC" && -d "$SRC" ]] || { echo "사용법: sudo bash 02_deploy.sh /경로/업로드한폴더"; exit 1; }
[[ -f "$SRC/api/index.js" ]] || { echo "$SRC/api/index.js 가 없습니다."; exit 1; }
[[ -f "$SRC/www/index.html" ]] || { echo "$SRC/www/index.html 이 없습니다."; exit 1; }

LINUX_USER=stamp

echo "== 화면 파일 =="
rm -rf /home/$LINUX_USER/www.new
cp -r "$SRC/www" /home/$LINUX_USER/www.new
rm -rf /home/$LINUX_USER/www.old
[[ -d /home/$LINUX_USER/www ]] && mv /home/$LINUX_USER/www /home/$LINUX_USER/www.old
mv /home/$LINUX_USER/www.new /home/$LINUX_USER/www

echo "== API 파일 =="
cp "$SRC/api/index.js" "$SRC/api/package.json" /home/$LINUX_USER/api/
chown -R $LINUX_USER:$LINUX_USER /home/$LINUX_USER

# 권한 (nginx 가 화면은 읽고, API 코드는 못 읽게)
chmod 751 /home/$LINUX_USER
chmod -R a+rX /home/$LINUX_USER/www
chmod 750 /home/$LINUX_USER/api

echo "== 의존성 (pg) =="
cd /home/$LINUX_USER/api
sudo -u $LINUX_USER npm install --omit=dev --no-audit --no-fund

echo "== 서비스 재시작 =="
systemctl restart stamp-api
sleep 2
systemctl --no-pager --lines=5 status stamp-api || true

echo "== 헬스체크 =="
if curl -fsS -X POST 'http://127.0.0.1:3010/?action=health' -d '{}' -H 'Content-Type: application/json'; then
  echo
  echo "정상입니다."
else
  echo
  echo "실패했습니다. 로그를 확인하세요: sudo journalctl -u stamp-api -n 50"
  exit 1
fi
