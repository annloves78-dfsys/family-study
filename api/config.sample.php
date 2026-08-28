<?php
// =========================================================
// 이 파일을 config.php 로 복사한 뒤 가비아 DB 정보로 채워주세요.
// (My가비아 > 웹호스팅 > 관리 > DB정보 에서 확인 가능)
// config.php 는 절대 깃에 올리지 마세요 (.gitignore 에 이미 등록돼 있습니다)
// =========================================================

define('DB_HOST', 'localhost');   // 가비아 웹호스팅은 보통 localhost
define('DB_PORT', 3306);
define('DB_NAME', '여기에_DB이름');
define('DB_USER', '여기에_DB아이디');
define('DB_PASS', '여기에_DB비밀번호');

// 도장 1개당 지급 금액 (원)
define('RATE', 500);

// 로그인 유지 기간 (일)
define('SESSION_DAYS', 60);

// 한국 시간 기준
date_default_timezone_set('Asia/Seoul');
