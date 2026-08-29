-- =========================================================
--  오후 9시 재알림을 위한 시간대별 발송 이력
--  실행: sudo -u postgres psql -v ON_ERROR_STOP=1 -d stamp -f 05_push_evening_reminder.sql
-- =========================================================

DO $$
BEGIN
  IF current_database() <> 'stamp' THEN
    RAISE EXCEPTION '이 스크립트는 stamp 데이터베이스에서만 실행할 수 있습니다 (현재: %)', current_database();
  END IF;
END $$;

ALTER TABLE push_delivery_log
  ADD COLUMN IF NOT EXISTS reminder_hour INTEGER NOT NULL DEFAULT 13;

ALTER TABLE push_delivery_log
  DROP CONSTRAINT IF EXISTS push_delivery_log_pkey;

ALTER TABLE push_delivery_log
  ADD PRIMARY KEY (user_id, date_str, reminder_hour);

ALTER TABLE push_delivery_log
  DROP CONSTRAINT IF EXISTS push_delivery_log_reminder_hour_check;

ALTER TABLE push_delivery_log
  ADD CONSTRAINT push_delivery_log_reminder_hour_check
  CHECK (reminder_hour BETWEEN 0 AND 23);

\echo '오후 9시 재알림 발송 이력 변경 완료'
