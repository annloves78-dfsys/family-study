-- =========================================================
-- 기존 지급 기록에 "며칠분까지 지급했는지"(settled_until) 채워넣기
-- gabia_schema.sql -> gabia_data.sql 실행 후 마지막에 한 번 실행하세요.
-- 각 지급이 이뤄진 날짜 이전에 찍혀 있던 도장 중 가장 늦은 날짜를 넣습니다.
-- =========================================================

UPDATE custom_events ce
JOIN (
  SELECT c.id, MAX(s.date_str) AS last_date
  FROM custom_events c
  JOIN study_stamps s
    ON s.user_id = c.user_id
   AND s.date_str <= DATE_FORMAT(c.created_at, '%Y-%m-%d')
  WHERE c.event_type = 'payout'
  GROUP BY c.id
) sub ON sub.id = ce.id
SET ce.settled_until = sub.last_date
WHERE ce.event_type = 'payout'
  AND ce.settled_until IS NULL;

-- 확인
-- SELECT user_id, created_at, amount, coupon_amount, settled_until
-- FROM custom_events WHERE event_type = 'payout' ORDER BY created_at DESC;
