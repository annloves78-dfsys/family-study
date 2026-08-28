-- =========================================================
-- 가비아 웹호스팅 MySQL 스키마
-- My가비아 > 웹호스팅 > DB관리(phpMyAdmin) 에서 실행하세요.
-- =========================================================

SET NAMES utf8mb4;

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS custom_events;
DROP TABLE IF EXISTS study_stamps;
DROP TABLE IF EXISTS daily_targets;
DROP TABLE IF EXISTS profiles;

-- 1. 사용자
CREATE TABLE profiles (
  id              VARCHAR(32)  NOT NULL,
  name            VARCHAR(50)  NOT NULL,
  password        VARCHAR(255) NOT NULL DEFAULT '0000',
  is_password_set TINYINT(1)   NOT NULL DEFAULT 0,
  role            VARCHAR(20)  NOT NULL DEFAULT 'child',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO profiles (id, name, password, is_password_set, role) VALUES
  ('yoonseo',  '윤서',   '0000', 0, 'child'),
  ('yeonwoo',  '연우',   '0000', 0, 'child'),
  ('yeontaek', '연택',   '0000', 0, 'child'),
  ('admin',    '관리자', '1234', 0, 'admin');

-- 2. 하루 목표 시간
CREATE TABLE daily_targets (
  id           BIGINT      NOT NULL AUTO_INCREMENT,
  user_id      VARCHAR(32) NOT NULL,
  date_str     CHAR(10)    NOT NULL,
  target_count INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_target (user_id, date_str),
  CONSTRAINT fk_target_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 도장
CREATE TABLE study_stamps (
  id             BIGINT      NOT NULL AUTO_INCREMENT,
  user_id        VARCHAR(32) NOT NULL,
  date_str       CHAR(10)    NOT NULL,
  stamp_index    INT         NOT NULL,
  is_coupon_used TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stamp (user_id, date_str, stamp_index),
  KEY idx_stamp_date (date_str),
  CONSTRAINT fk_stamp_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 용돈/쿠폰 지급 기록
--    settled_until = 이 지급이 "며칠분까지" 정산한 것인지
CREATE TABLE custom_events (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  user_id       VARCHAR(32) NOT NULL,
  event_type    VARCHAR(30) NOT NULL,
  amount        INT         NOT NULL DEFAULT 0,
  coupon_amount INT         NOT NULL DEFAULT 0,
  settled_until CHAR(10)    NULL,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_user (user_id, event_type),
  CONSTRAINT fk_event_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 로그인 세션 (한 번 로그인하면 계속 유지되도록)
CREATE TABLE sessions (
  token      CHAR(64)    NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME    NOT NULL,
  PRIMARY KEY (token),
  KEY idx_session_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
