# 가비아 웹호스팅 배포 가이드

Supabase → 가비아 웹호스팅(PHP) + MySQL 로 완전히 옮기는 순서입니다.
순서대로 따라오시면 됩니다. 10~20분 정도 걸립니다.

---

## 0. 준비물

- 가비아 **리눅스 웹호스팅** 계정 (PHP + MySQL 제공)
- My가비아 > 서비스관리 에서 확인할 것 4가지
  - **FTP 주소 / 아이디 / 비밀번호**
  - **MySQL DB 이름 / 아이디 / 비밀번호**
- FTP 프로그램 (알FTP, FileZilla 등)

---

## 1. DB 만들기 (phpMyAdmin)

My가비아 > 웹호스팅 > **DB 관리(phpMyAdmin)** 접속 후, SQL 탭에서 아래 파일들을
**순서대로** 붙여넣고 실행합니다.

| 순서 | 파일 | 하는 일 |
|---|---|---|
| 1 | `migration/gabia_schema.sql` | 테이블 5개 생성 |
| 2 | `migration/gabia_data.sql` | Supabase에서 뽑아온 실제 데이터 넣기 |
| 3 | `migration/gabia_backfill_settled_until.sql` | 예전 지급 기록에 "며칠분까지 지급" 채우기 |

> `gabia_data.sql` 은 이미 만들어져 있습니다.
> (윤서/연우/연택 도장 712개, 목표 210개, 지급기록 23개, 비밀번호 포함)
>
> 옮기기 직전에 최신 데이터로 다시 뽑고 싶으면:
> ```bash
> npm run export:supabase
> ```

파일 크기가 커서 붙여넣기가 안 되면 phpMyAdmin의 **가져오기(Import)** 탭에서
파일을 그대로 업로드하시면 됩니다.

---

## 2. API 설정 파일 만들기

`api/config.sample.php` 를 복사해서 **`api/config.php`** 로 만들고,
1단계에서 확인한 DB 정보를 채웁니다.

```php
define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', '가비아_DB이름');
define('DB_USER', '가비아_DB아이디');
define('DB_PASS', '가비아_DB비밀번호');
```

> `api/config.php` 는 `.gitignore` 에 등록되어 있어서 깃에 올라가지 않습니다.

---

## 3. 빌드

```bash
npm install
npm run deploy:build
```

`dist/` 폴더 안에 이런 구조가 만들어집니다.

```
dist/
├── index.html
├── assets/
│   ├── index-xxxx.js
│   └── index-xxxx.css
└── api/
    ├── index.php
    ├── config.php      ← 2단계에서 만든 파일
    └── .htaccess
```

---

## 4. FTP 업로드

`dist/` **안의 내용물 전부**를 가비아 웹 루트에 올립니다.

- 웹 루트는 보통 `/public_html` 또는 `/html` 입니다
- `dist` 폴더째로 올리는 게 아니라, **dist 안의 파일들**을 웹 루트에 올립니다

올린 뒤 구조:

```
public_html/
├── index.html
├── assets/
└── api/
    ├── index.php
    ├── config.php
    └── .htaccess
```

---

## 5. 확인

1. 브라우저에서 `https://내도메인/` 접속 → 로그인 화면이 뜨는지
2. 관리자로 로그인 → 도장판이 뜨는지
3. 새로고침 → **로그인 화면 없이 바로 들어가지는지** (로그인 유지 확인)
4. 탭을 눌러 윤서 / 연우 / 연택 전환되는지
5. 도장 하나 찍었다 지워보기

### 안 될 때

| 증상 | 원인 / 해결 |
|---|---|
| `config.php 가 없습니다` | 2단계 파일을 안 올렸습니다. `api/config.php` 업로드 확인 |
| `DB 연결 실패` | `config.php` 의 DB 정보 오타. 가비아는 보통 DB_HOST가 `localhost` |
| 화면은 뜨는데 `⚠ 서버 응답 오류` | `api/index.php` 가 웹 루트의 `api/` 안에 있는지 확인 |
| 500 에러 | `api/.htaccess` 를 지우고 다시 시도 (구버전 아파치일 수 있음) |
| 화면이 하얗게 나옴 | `assets/` 폴더를 같이 안 올렸습니다 |

가비아 호스팅의 **에러로그**(My가비아 > 웹호스팅 > 로그관리)에
`[stamp-api]` 로 시작하는 줄이 있으면 원인이 적혀 있습니다.

---

## 6. 도메인 연결

My가비아 > 웹호스팅 > **도메인 연결** 에서 쓰실 도메인을 이 호스팅에 연결하면 끝입니다.
빌드가 `base: './'` 로 되어 있어서 루트(`/`)든 하위 폴더(`/stamp`)든 그대로 동작합니다.

---

## 7. 다 되면

- Vercel 프로젝트는 삭제하거나 배포를 꺼두세요 (둘 다 살아있으면 데이터가 갈립니다)
- Supabase 프로젝트는 **1~2주 정도 그대로 두었다가** 문제 없으면 삭제하세요 (되돌릴 여지)
- 예전 Supabase용 SQL은 `legacy-supabase/` 폴더에 참고용으로 남겨뒀습니다

---

## 참고: 로컬에서 개발할 때

가비아 서버의 API에 붙여서 로컬 화면만 고치고 싶다면 `.env.local` 파일을 만들고:

```
VITE_API_BASE=https://내도메인/api/
```

그 다음 `npm run dev` 하시면 됩니다.

---

## 참고: API 구조

`POST /api/?action=<액션>`, 본문은 JSON입니다.

| 액션 | 설명 | 권한 |
|---|---|---|
| `login` | 로그인, 토큰 발급 (60일 유효) | - |
| `me` | 저장된 토큰 확인 (자동 로그인) | - |
| `logout` | 토큰 삭제 | - |
| `change_password` | 비밀번호 변경 | 현재 비밀번호 필요 |
| `board` | 주간 도장 + 목표 + 전체 통계 | 로그인 |
| `stamp_add` / `stamp_remove` | 도장 찍기/지우기 | 본인 또는 관리자 |
| `target_set` | 목표 시간 설정 | 관리자 |
| `payout_add` | 용돈 지급 | 관리자 |

Supabase 때와 달리 **비밀번호가 브라우저로 내려오지 않고**, 다른 아이의 도장을
바꾸는 요청은 서버에서 거부합니다.
