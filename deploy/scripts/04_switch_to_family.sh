#!/usr/bin/env bash
# =========================================================
#  도장판 — family.anne.ai.kr 로 최종 전환
#
#  ⚠ 가비아 DNS 에서 family 레코드를 이 서버로 바꾼 "직후" 실행하세요.
#     (CNAME ...vercel-dns... 삭제 → A 1.201.117.244 추가)
#
#  하는 일
#   1. family.anne.ai.kr 이 이 서버를 가리키는지 확인
#   2. 인증서에 family.anne.ai.kr 추가 (--expand)
#   3. 화면·API 응답 확인
#
#  DNS 를 바꾼 뒤 이 스크립트를 돌리기 전까지 몇 분간
#  https://family.anne.ai.kr 에 인증서 경고가 뜹니다. 정상입니다.
# =========================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "sudo 로 실행해 주세요."; exit 1; }

MAIN=stamp.anne.ai.kr
FAMILY=family.anne.ai.kr
MYIP=$(curl -s -4 ifconfig.me || echo "")

echo "== 1. DNS 확인 =="
RESOLVED=$(getent hosts "$FAMILY" | awk '{print $1}' | head -1)
echo "   $FAMILY -> ${RESOLVED:-(응답 없음)}"
echo "   이 서버   -> ${MYIP:-(확인 실패)}"
if [[ -z "$RESOLVED" ]]; then
  echo "   !! 아직 DNS 가 안 퍼졌습니다. 10분쯤 뒤 다시 실행하세요."
  exit 1
fi
if [[ -n "$MYIP" && "$RESOLVED" != "$MYIP" ]]; then
  echo "   !! 아직 이 서버를 가리키지 않습니다 (Vercel 일 수 있음)."
  echo "      DNS 가 퍼질 때까지 기다렸다가 다시 실행하세요."
  exit 1
fi
echo "   좋습니다."

echo "== 2. 인증서에 $FAMILY 추가 =="
certbot --nginx --expand -d "$MAIN" -d "$FAMILY" \
  --non-interactive --agree-tos --redirect \
  --register-unsafely-without-email

echo "== 3. 확인 =="
sleep 2
for h in "$MAIN" "$FAMILY"; do
  printf "   %-22s 화면 %s / API " "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h/")"
  curl -s -X POST -H 'Content-Type: application/json' -d '{}' "https://$h/api/?action=health"
  echo
done

echo
echo "   -- 다른 앱도 멀쩡한지 --"
printf "   %-22s %s\n" "anne.ai.kr" "$(curl -s -o /dev/null -w '%{http_code}' https://anne.ai.kr/)"
printf "   %-22s %s\n" "mift.anne.ai.kr" "$(curl -s -o /dev/null -w '%{http_code}' https://mift.anne.ai.kr/)"

echo
echo "끝났습니다. 아이들이 홈 화면에서 쓰던 아이콘이 그대로 새 서버로 붙습니다."
echo "이제 Vercel 프로젝트의 배포를 꺼도 됩니다."
