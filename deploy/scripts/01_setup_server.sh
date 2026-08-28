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

# stamp DB 는 stamp 롤만 들어올 수 있게
sudo -u postgres psql -c "REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC;"
sudo -u postgres psql -c "GRANT CONNECT ON DATABASE $DB_NAME TO $DB_USER;"

# 다른 앱 DB 에서 stamp 롤 권한 회수 (보조 수단)
#  ⚠ 이것만으로는 막히지 않습니다. PostgreSQL 은 모든 DB 의 CONNECT 를
#     기본적으로 PUBLIC 에 주기 때문에, stamp 가 그걸 물려받아 그냥 들어갑니다.
#     실제로 막는 것은 아래 "2-1. 접속 제한" 의 pg_hba 규칙입니다.
#  ⚠ 남의 DB 의 PUBLIC 권한은 건드리지 않습니다 (학원앱이 깨지지 않도록).
OTHER_DBS=$(sudo -u postgres psql -tAc \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> '$DB_NAME'")
for db in $OTHER_DBS; do
  sudo -u postgres psql -c "REVOKE ALL ON DATABASE \"$db\" FROM $DB_USER;" >/dev/null 2>&1 || true
done

echo "== 2-1. 접속 제한 (pg_hba) =="
#  stamp 롤이 stamp DB 에만 접속하도록 못 박습니다.
#  학원앱·게임앱의 기존 규칙은 한 줄도 건드리지 않고, 위에 stamp 전용 줄만 끼웁니다.
HBA=$(sudo -u postgres psql -tAc "SHOW hba_file")
if grep -q "도장판(stamp)" "$HBA"; then
  echo "   이미 규칙이 있습니다: $HBA"
else
  BAK="${HBA}.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$HBA" "$BAK"
  echo "   백업: $BAK"

  cat > /tmp/stamp-hba-block.txt <<'BLOCK'
# ==== 도장판(stamp) ====
# stamp 롤은 stamp DB 에만 접속할 수 있습니다.
# 아래 일반 규칙(host all all)보다 먼저 와야 효력이 있습니다.
local   all             stamp                                   reject
host    stamp           stamp           127.0.0.1/32            scram-sha-256
host    stamp           stamp           ::1/128                 scram-sha-256
host    all             stamp           0.0.0.0/0               reject
host    all             stamp           ::/0                    reject
# ==== 도장판 끝 ====

BLOCK
  cat /tmp/stamp-hba-block.txt "$HBA" > /tmp/pg_hba.new
  mv /tmp/pg_hba.new "$HBA"
  chown --reference="$BAK" "$HBA"
  chmod --reference="$BAK" "$HBA"
  rm -f /tmp/stamp-hba-block.txt

  # pg_hba_file_rules 는 조회할 때 파일을 다시 읽습니다 — reload 전에 오류를 볼 수 있습니다
  ERRS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL")
  if [[ "$ERRS" != "0" ]]; then
    echo "   !! pg_hba 문법 오류 $ERRS 줄 — 되돌립니다"
    sudo -u postgres psql -c "SELECT line_number, error FROM pg_hba_file_rules WHERE error IS NOT NULL"
    cp -p "$BAK" "$HBA"
    exit 1
  fi

  sudo -u postgres psql -tAc "SELECT pg_reload_conf()" >/dev/null
  echo "   적용했습니다 (reload, 재시작 아님)"
fi

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
# 751 = nginx(www-data) 가 통과(x)는 하되 목록(r)은 못 봅니다.
# 750 으로 잠그면 화면 파일이 404 가 납니다.
chmod 751 /home/$LINUX_USER
chmod 750 /home/$LINUX_USER/api    # API 코드는 www-data 가 못 읽게
chmod 755 /home/$LINUX_USER/www    # 화면 파일은 nginx 가 읽어야 함
echo "   /home/$LINUX_USER/api (750), /home/$LINUX_USER/www (755)"

echo
echo "끝났습니다. 다음은 deploy/sql/ 의 SQL 3개를 순서대로 실행하세요:"
echo "  sudo -u postgres psql -d stamp -f 01_schema.sql"
echo "  sudo -u postgres psql -d stamp -f 02_data.sql"
echo "  sudo -u postgres psql -d stamp -f 03_backfill_settled_until.sql"
