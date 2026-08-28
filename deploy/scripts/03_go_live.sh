#!/usr/bin/env bash
# =========================================================
#  도장판 — nginx 연결 + HTTPS 인증서
#  실행: sudo bash 03_go_live.sh
#
#  ⚠ 먼저 가비아 DNS 에서 stamp.anne.ai.kr 을 이 서버 IP 로
#     연결해 두어야 certbot 이 인증서를 받을 수 있습니다.
#
#  학원앱(annest)·아들앱(mift) 의 nginx 설정은 건드리지 않습니다.
# =========================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "sudo 로 실행해 주세요."; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN=stamp.anne.ai.kr

echo "== nginx 설정 설치 =="
cp "$HERE/../nginx/stamp.conf" /etc/nginx/sites-available/stamp
ln -sfn /etc/nginx/sites-available/stamp /etc/nginx/sites-enabled/stamp

echo "== 설정 검사 =="
nginx -t

echo "== 적용 =="
systemctl reload nginx

echo "== HTTPS 인증서 =="
if command -v certbot >/dev/null; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
    --register-unsafely-without-email || {
      echo "certbot 실패. DNS 가 이 서버를 가리키는지 확인한 뒤 다시 실행하세요:"
      echo "  sudo certbot --nginx -d $DOMAIN"
    }
else
  echo "certbot 이 없습니다. 설치 후 실행하세요: sudo certbot --nginx -d $DOMAIN"
fi

echo
echo "끝났습니다. https://$DOMAIN 으로 접속해 보세요."
