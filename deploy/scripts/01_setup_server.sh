#!/usr/bin/env bash
# =========================================================
#  도장판 — 서버 초기 설정 (한 번만 실행)
#  실행: sudo bash 01_setup_server.sh
#
#  하는 일
#   1. 리눅스 계정 stamp 생성 (로그인 불가, 학원앱 폴더 접근 불가)
#   2. PostgreSQL 롤 stamp + 데이터베이스 stamp 생성
#   3. /etc/stamp/stamp-api.env 에 접속 정보 저장 (chmod 600)
#   4. /home/stamp/{api,www} 폴더 생성
#
#  학원앱(annest)·아들앱(mift)의 어떤 파일도 건드리지 않습니다.
# =========================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "sudo 로 실행해 주세요."; exit 1; }

DB_NAME=stamp
DB_USER=stamp
LINUX_USER=stamp

echo "== 1. 리눅스 계정 =="
if id "$LINUX_USER" &>/dev/null; then
  echo "   이미 있습니다: $LINUX_USER"
else
  adduser --system --group --home /home/$LINUX_USER --shell /usr/sbin/nologin "$LINUX_USER"
  echo "   만들었습니다: $LINUX_USER"
fi

echo "== 2. PostgreSQL 롤 / 데이터베이스 =="
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  echo "   롤이 이미 있습니다: $DB_USER (비밀번호는 그대로 둡니다)"
  DB_PASS=""
else
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  sudo -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';"
  echo "   롤을 만들었습니다: $DB_USER"
fi

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "   DB 가 이미 있습니다: $DB_NAME"
else
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  echo "   DB 를 만들었습니다: $DB_NAME"
fi

# 학원앱 DB 에 손대지 못하게 확실히 막습니다
sudo -u postgres psql -c "REVOKE ALL ON DATABASE annest FROM $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC;"
sudo -u postgres psql -c "GRANT CONNECT ON DATABASE $DB_NAME TO $DB_USER;"

echo "== 3. 환경설정 파일 =="
mkdir -p /etc/stamp
if [[ -n "$DB_PASS" ]]; then
  cat > /etc/stamp/stamp-api.env <<ENVEOF
DATABASE_URL=postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME
ENVEOF
  chmod 600 /etc/stamp/stamp-api.env
  chown root:root /etc/stamp/stamp-api.env
  echo "   만들었습니다: /etc/stamp/stamp-api.env"
else
  echo "   건너뜁니다 (이미 있는 롤). /etc/stamp/stamp-api.env 를 직접 확인하세요."
fi

echo "== 4. 폴더 =="
mkdir -p /home/$LINUX_USER/api /home/$LINUX_USER/www
chown -R $LINUX_USER:$LINUX_USER /home/$LINUX_USER
chmod 750 /home/$LINUX_USER
echo "   /home/$LINUX_USER/api, /home/$LINUX_USER/www"

echo
echo "끝났습니다. 다음은 deploy/sql/ 의 SQL 3개를 순서대로 실행하세요:"
echo "  sudo -u postgres psql -d stamp -f 01_schema.sql"
echo "  sudo -u postgres psql -d stamp -f 02_data.sql"
echo "  sudo -u postgres psql -d stamp -f 03_backfill_settled_until.sql"
