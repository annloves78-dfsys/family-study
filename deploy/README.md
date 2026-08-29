# 가비아 서버 이전 안내 (도장판)

Supabase → **가비아 서버(1.201.117.244)** 로 옮기는 절차입니다.
**사람이 직접 해야 하는 일**만 여기 적혀 있습니다.

---

## 1. 학원앱과 어떻게 나뉘어 있나

같은 서버에 이미 두 개가 돌고 있습니다. 도장판은 **세 번째 칸**을 새로 만들어 들어갑니다.
기존 두 개의 설정 파일은 **하나도 건드리지 않습니다.**

| | 학원앱 (annest) | 아들 게임앱 (boss-raid) | **도장판 (stamp)** |
|---|---|---|---|
| 리눅스 계정 | `annest` | `ubuntu` | **`stamp`** |
| 파일 위치 | `/home/annest` | `/home/ubuntu/miftgotothetop` | **`/home/stamp`** |
| 프로세스 | systemd `annest-api`, `annest-postgrest` | pm2 `boss-raid` | **systemd `stamp-api`** |
| **포트** | **3001, 3002** | **8080** | **3010** |
| nginx | `sites-available/annest` | `.../mift` | **`.../stamp`** |
| 데이터베이스 | PostgreSQL `annest` DB | Supabase (이전 중) | **PostgreSQL `stamp` DB** |
| 도메인 | `anne.ai.kr` | `mift.anne.ai.kr` | **`family.anne.ai.kr`** (확인용: `stamp.anne.ai.kr`) |

세 앱의 포트가 서로 겹치지 않는 것을 확인했습니다 (3001 / 3002 / 8080 / 3010).

- `stamp` 롤은 **`stamp` DB 에만 접속할 수 있습니다.** `pg_hba.conf` 에 stamp 전용 규칙을
  넣어 막습니다 (`01_setup_server.sh` 가 백업 → 문법검증 → reload 순으로 처리).
  학원앱·게임앱의 기존 규칙은 한 줄도 건드리지 않습니다.

  > **왜 GRANT/REVOKE 로는 안 되나**: PostgreSQL 은 모든 DB 의 CONNECT 권한을
  > 기본적으로 `PUBLIC` 에 줍니다. 그래서 `REVOKE ... FROM stamp` 를 해도
  > stamp 가 PUBLIC 을 통해 그대로 들어갑니다. 남의 DB 에서 `REVOKE ... FROM PUBLIC`
  > 을 하면 막히긴 하지만 학원앱이 깨질 수 있어서, pg_hba 로 stamp 만 콕 집었습니다.

- 반대로 `stamp` DB 는 PUBLIC 권한을 회수해 두어서, 다른 앱 롤이 들어올 수 없습니다.
- `stamp` 계정은 로그인이 안 되는 계정이고, 다른 사람 폴더를 읽을 권한이 없습니다.
- `/home/stamp` 는 `751` — nginx 가 화면 파일은 읽지만 폴더 목록은 못 보고,
  `/home/stamp/api` 는 `750` 이라 API 코드에는 아예 못 들어갑니다.
- DB 는 `127.0.0.1` 만 듣습니다. 인터넷에서 직접 접속할 수 없습니다.
- API 는 `127.0.0.1:3010` 만 듣습니다. 바깥에서는 nginx 를 통해서만 닿습니다.

확인 방법 (셋 다 이렇게 나와야 정상):

```
stamp -> annest    막힘
stamp -> postgres  막힘
stamp -> stamp     됨
```

### 램 (2026-08-29 실측)

**1코어 / 1.9GB 로 증설된 상태**에서 세 개가 같이 돕니다. 여유롭습니다.

| | 실측 |
|---|---|
| boss-raid (게임) | 79.6MB |
| **stamp-api (도장판)** | **17.3MB** |
| 전체 사용량 | **488MB / 1.9GB** (여유 1.4GB) |

`stamp-api` 는 systemd 에서 **최대 200MB** 로 묶어 뒀습니다 (`MemoryMax=200M`).
도장판이 폭주해도 학원앱·게임앱을 밀어내지는 않습니다.

---

## 2. 순서

### ① 서버 초기 설정 (한 번만)

`deploy/` 폴더를 서버에 올린 뒤:

```bash
sudo bash deploy/scripts/01_setup_server.sh
```

계정 `stamp`, DB `stamp`, `/etc/stamp/stamp-api.env`, 폴더가 만들어집니다.

### ② 자료 옮기기 (한 번만)

```bash
sudo -u postgres psql -d stamp -f deploy/sql/01_schema.sql
sudo -u postgres psql -d stamp -f deploy/sql/02_data.sql
sudo -u postgres psql -d stamp -f deploy/sql/03_backfill_settled_until.sql
sudo -u postgres psql -d stamp -f deploy/sql/04_push_notifications.sql
sudo -u postgres psql -d stamp -f deploy/sql/05_push_evening_reminder.sql
```

세 파일 모두 맨 위에서 **"지금 stamp DB 가 맞는지" 확인하고, 아니면 즉시 멈춥니다.**
실수로 학원앱 DB 에 실행할 수 없습니다.

`02_data.sql` 은 내 PC 에서 만듭니다 (비밀번호가 들어있어 깃에 올라가지 않습니다):

```bash
npm run export:supabase
```

> 현재 뽑아둔 양: 도장 712개, 목표 210개, 지급기록 23개, 사용자 4명.
> 옮기기 **직전에** 다시 뽑으면 그 사이 찍은 도장까지 따라옵니다.

### ③ 코드 올리기

내 PC 에서:

```bash
npm install
npm run deploy:build     # upload/ 폴더가 만들어집니다
scp -r upload deploy 서버주소:~/
```

서버에서:

```bash
sudo cp ~/deploy/systemd/stamp-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stamp-api
sudo bash ~/deploy/scripts/02_deploy.sh ~/upload
```

`02_deploy.sh` 는 파일 복사 → `npm install` → 서비스 재시작 → **헬스체크**까지 합니다.
앞으로 코드를 고칠 때도 이 명령 하나만 다시 돌리면 됩니다.

### ④ 도메인 연결 + HTTPS

먼저 가비아 DNS 에서 `stamp.anne.ai.kr` 을 이 서버 IP 로 연결한 뒤:

```bash
sudo bash ~/deploy/scripts/03_go_live.sh
```

nginx 설정을 넣고 certbot 으로 인증서까지 받습니다.
(`anne.ai.kr`, `mift.anne.ai.kr` 설정은 건드리지 않습니다.)

---

## 3. 확인

1. `https://stamp.anne.ai.kr` 접속 → 로그인 화면
2. 관리자 로그인 → 도장판
3. **새로고침 → 로그인 화면 없이 바로 들어가지는지** (로그인 유지)
4. 탭으로 윤서 / 연우 / 연택 전환
5. 도장 하나 찍었다 지우기
6. 학원앱(`anne.ai.kr`)이 그대로 잘 도는지도 같이 확인

### 안 될 때

| 증상 | 확인 |
|---|---|
| 502 Bad Gateway | `sudo systemctl status stamp-api` / `sudo journalctl -u stamp-api -n 50` |
| `DATABASE_URL 환경변수가 없습니다` | `/etc/stamp/stamp-api.env` 가 있는지, systemd 유닛의 `EnvironmentFile` 경로 |
| `⚠ 서버에 연결할 수 없습니다` | nginx 의 `/api/` 프록시가 3010 을 가리키는지 |
| 로그인은 되는데 화면이 빈 채로 | `sudo journalctl -u stamp-api -f` 켜두고 새로고침 |
| 서버가 느려짐 | `free -h` 로 램 확인. 학원앱 안내대로 **2GB 증설**을 먼저 하세요 |

---

## 4. family.anne.ai.kr 로 최종 전환

아이들은 `family.anne.ai.kr` 을 **홈 화면에 설치**해서 쓰고 있습니다.
그래서 최종 주소는 반드시 `family.anne.ai.kr` 이어야 합니다.
`stamp.anne.ai.kr` 은 옮기는 동안 확인용으로만 씁니다.

nginx 는 **두 주소를 이미 다 받도록** 설정돼 있어서, 전환할 때 서버 설정을
고칠 필요가 없습니다. DNS 만 바꾸고 인증서만 추가하면 됩니다.

> **서비스워커·manifest 가 없는 것을 확인했습니다.** 아이들이 설치한 것은
> 홈 화면 바로가기(북마크)라서, 주소를 옮겨도 옛 화면이 캐시에 눌러붙지 않습니다.

### ⚠ 순서를 지켜주세요 — 안 그러면 그 사이 찍은 도장이 사라집니다

확인하는 동안 아이들은 여전히 `family.anne.ai.kr`(=Vercel+Supabase)을 씁니다.
거기서 찍은 도장은 **가비아 서버에 없습니다.** 그래서 전환 직전에 자료를 한 번 더 가져와야 합니다.

1. **아이들에게 잠깐 쓰지 말라고 합니다** (10분이면 충분)
2. 내 PC 에서 최신 자료 다시 추출
   ```bash
   npm run export:supabase
   ```
3. 서버에 올려서 다시 넣기 (기존 내용을 지우고 새로 채웁니다)
   ```bash
   scp deploy/sql/02_data.sql 서버:~/stamp-deploy/sql/
   sudo -u postgres psql -v ON_ERROR_STOP=1 -d stamp -f ~/stamp-deploy/sql/02_data.sql
   sudo -u postgres psql -v ON_ERROR_STOP=1 -d stamp -f ~/stamp-deploy/sql/03_backfill_settled_until.sql
   ```
4. 가비아 DNS 에서 `family` 레코드 교체
   - `CNAME family → ...vercel-dns...` **삭제**
   - `A family → 1.201.117.244` **추가**
5. 바로 이어서 인증서 추가
   ```bash
   sudo bash ~/stamp-deploy/scripts/04_switch_to_family.sh
   ```

4번과 5번 사이 몇 분간 `https://family.anne.ai.kr` 에 인증서 경고가 뜹니다. 정상입니다.
(HTTPS 인증서는 그 주소가 이 서버를 가리켜야만 발급받을 수 있어서 순서를 바꿀 수 없습니다.)

## 5. 그다음

- Vercel 프로젝트는 배포를 꺼두세요 (둘 다 살아있으면 자료가 갈립니다)
- Supabase 프로젝트는 **1~2주 그대로 두었다가** 문제 없으면 삭제하세요 (되돌릴 여지)
- 예전 Supabase 용 SQL 은 `legacy-supabase/` 에 참고용으로 남아 있습니다

---

## 6. API 구조 (참고)

`POST /api/?action=<액션>`, 본문은 JSON. 로그인하면 받은 토큰을 본문에 같이 보냅니다.

| 액션 | 하는 일 | 권한 |
|---|---|---|
| `health` | 서버·DB 살아있는지 | - |
| `login` | 로그인, 토큰 발급 (60일) | - |
| `me` | 저장된 토큰 확인 (자동 로그인) | - |
| `logout` | 토큰 삭제 | - |
| `change_password` | 비밀번호 변경 (기존 토큰 전부 만료) | 현재 비밀번호 |
| `board` | 주간 도장 + 목표 + 전체 통계 | 로그인 |
| `stamp_add` / `stamp_remove` | 도장 찍기 / 지우기 | 본인 또는 관리자 |
| `stamp_next` / `stamp_undo` | 오늘 도장 하나 추가 / 마지막 하나 취소 (위젯용) | 본인 또는 관리자 |
| `target_set` | 목표 시간 설정 | 관리자 |
| `payout_add` | 용돈 지급 | 관리자 |
| `widget_token` | 홈 화면 위젯용 장기 토큰 발급 (10년) | 관리자 |
| `push_config` | 알림 공개키와 발송 시각 확인 | 아이 |
| `push_subscribe` / `push_unsubscribe` | 아이 기기의 Web Push 구독 등록/해제 | 아이 |

홈 화면 위젯 설정은 [위젯-안드로이드.md](위젯-안드로이드.md) 를 보세요.

Supabase 때와 달라진 점:

- **비밀번호가 브라우저로 내려오지 않습니다.** 서버에서만 대조합니다.
- 다른 아이의 도장을 바꾸는 요청은 **서버가 거부**합니다 (화면만 막는 게 아닙니다).
- 전체 통계를 서버에서 계산해 내려줍니다. 예전엔 도장 전체를 브라우저로 내려받아
  계산했습니다 (도장 하나 찍을 때마다 수천 줄). 지금은 세 줄만 옵니다.

## 7. 아이 미기록 푸시 알림

아이 계정으로 앱을 연 뒤 `알림 켜기`를 한 번 눌러야 해당 기기가 등록됩니다.
등록된 아이 기기에만 매일 한국시간 오후 1시, 전날 도장이 0개일 때 알림을 보냅니다.
오후 9시에도 여전히 도장이 0개이면 한 번 더 알림을 보냅니다.
같은 아이에게 같은 날짜·시간대 알림은 한 번만 발송합니다.

`/etc/stamp/stamp-api.env`에는 서버에서 생성해 보관한 아래 값이 필요합니다.
비공개키는 저장소나 클라이언트 코드에 넣지 않습니다.

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@family.anne.ai.kr
REMINDER_HOURS_KST=13,21
```
