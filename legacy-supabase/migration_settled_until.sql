-- =========================================================
-- "며칠까지 지급했는지" 표시용 컬럼 추가
-- Supabase > SQL Editor 에 붙여넣고 RUN 을 한 번만 실행하세요.
-- 기존 데이터는 그대로 유지됩니다.
-- =========================================================

ALTER TABLE custom_events
  ADD COLUMN IF NOT EXISTS settled_until TEXT;

-- 기존 지급 기록에도 기준일을 채워 넣습니다.
-- (각 지급이 이뤄진 날짜 이전에 찍혀 있던 도장 중 가장 늦은 날짜)
UPDATE custom_events ce
SET settled_until = sub.last_date
FROM (
  SELECT
    c.id,
    MAX(s.date_str) AS last_date
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

-- 확인용
-- SELECT user_id, created_at, amount, coupon_amount, settled_until
-- FROM custom_events WHERE event_type = 'payout' ORDER BY created_at DESC;
