-- Debug: Check if pump current_reading matches expected value
-- 2nd shift sales: ₱2,062.50 + ₱50 + ₱50 + ₱500 = ₱2,662.50
-- Liters: ₱2,662.50 / ₱68.75 = 38.73L
-- Expected current_reading: 364,571.73 + 38.73 = 364,610.46

SELECT 
  pump_name,
  fuel_type,
  initial_reading,
  current_reading,
  current_reading - initial_reading as total_liters_dispensed
FROM pumps 
WHERE fuel_type = 'Premium' AND (category IS NULL OR category = 'regular');

-- Check the snapshot ending_reading
SELECT 
  sps.shift_number,
  sps.beginning_reading,
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as snapshot_liters,
  sps.status,
  p.current_reading as pump_current
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE 
  AND p.fuel_type = 'Premium' 
  AND (p.category IS NULL OR p.category = 'regular')
ORDER BY sps.shift_number;

-- Check if trigger exists
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname LIKE '%pump%' OR tgname LIKE '%sale%';
