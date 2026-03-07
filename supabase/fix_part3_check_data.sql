-- ============================================================================
-- PART 3: Check current data state
-- Run this to see the current pump reading vs actual sales
-- ============================================================================

-- Current pump state
SELECT 
  pump_name,
  initial_reading,
  current_reading,
  current_reading - initial_reading as pump_liters
FROM pumps
WHERE fuel_type = 'Premium' AND (category IS NULL OR category = 'regular');

-- Total sales liters for Premium today
SELECT 
  SUM(cs.liters) as total_sales_liters,
  SUM(cs.amount) as total_sales_amount
FROM cash_sales cs
JOIN pumps p ON cs.pump_id = p.id
WHERE p.fuel_type = 'Premium' 
  AND (p.category IS NULL OR p.category = 'regular')
  AND DATE(cs.created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE;

-- Total calibration liters for Premium today
SELECT SUM(liters) as total_calibration_liters
FROM pump_calibrations
WHERE shift_date = CURRENT_DATE;

-- Current snapshot state
SELECT 
  shift_number,
  beginning_reading,
  ending_reading,
  ending_reading - beginning_reading as snapshot_liters,
  status
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE 
  AND p.fuel_type = 'Premium' 
  AND (p.category IS NULL OR p.category = 'regular')
ORDER BY shift_number;
