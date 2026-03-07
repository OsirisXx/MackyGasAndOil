-- Check all calibrations for today
SELECT 
  id,
  shift_date,
  shift_number,
  liters,
  amount,
  created_at,
  pump_id
FROM pump_calibrations
WHERE shift_date = CURRENT_DATE
ORDER BY created_at;

-- Fix: Update calibrations done after 12:00 PM Philippine time to shift_number = 2
-- (Manolo branch: 2nd shift starts at 12:00 PM PH time = 4:00 AM UTC)
-- Philippine timezone is UTC+8
UPDATE pump_calibrations
SET shift_number = 2
WHERE shift_date = CURRENT_DATE
  AND shift_number = 1
  AND (created_at AT TIME ZONE 'Asia/Manila')::time >= TIME '12:00:00';

-- Verify the fix
SELECT 
  id,
  shift_date,
  shift_number,
  liters,
  amount,
  created_at
FROM pump_calibrations
WHERE shift_date = CURRENT_DATE
ORDER BY created_at;
