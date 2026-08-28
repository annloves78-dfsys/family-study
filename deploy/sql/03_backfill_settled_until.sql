-- =========================================================
--  기존 지급 기록에 "며칠분까지 지급했는지"(settled_until) 채워넣기
--  01_schema.sql -> 02_data.sql 실행 후 마지막에 한 번 실행하세요.
--    sudo -u postgres psql -d stamp -f 03_backfill_settled_until.sql
--
--  각 지급이 이뤄진 날짜(한국시간) 이전에 찍혀 있던 도장 중
--  가장 늦은 날짜를 정산 기준일로 넣습니다.
-- =========================================================

DO $$
BEGIN
  IF current_database() <> 'stamp' THEN
    RAISE EXCEPTION '이 스크립트는 stamp 데이터베이스에서만 실행할 수 있습니다 (현재: %)', current_database();
  END IF;
END $$;

UPDATE custom_events ce
SET settled_until = sub.last_date
FROM (
  SELECT c.id, MAX(s.date_str) AS last_date
  FROM custom_events c
  JOIN study_stamps s
    ON s.user_id = c.user_id
   AND s.date_str <= to_char(c.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
  WHERE c.event_type = 'payout'
  GROUP BY c.id
) sub
WHERE ce.id = sub.id
  AND ce.event_type = 'payout'
  AND ce.settled_until IS NULL;

-- 확인
SELECT user_id,
       to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS 지급일,
       amount AS 금액,
       coupon_amount AS 쿠폰,
       settled_until AS 정산기준일
FROM custom_events
WHERE event_type = 'payout'
ORDER BY created_at DESC;
