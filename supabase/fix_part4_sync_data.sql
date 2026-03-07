-- ============================================================================
-- PART 4: Sync pump reading and snapshot with actual sales
-- Run this AFTER checking Part 3 results
-- ============================================================================

-- Update pump current_reading based on actual sales + calibrations
UPDATE pumps
SET current_reading = initial_reading + COALESCE((
  SELECT SUM(cs.liters)
  FROM cash_sales cs
  WHERE cs.pump_id = pumps.id
    AND DATE(cs.created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
), 0) + COALESCE((
  SELECT SUM(pc.liters)
  FROM pump_calibrations pc
  WHERE pc.pump_id = pumps.id
    AND pc.shift_date = CURRENT_DATE
), 0)
WHERE fuel_type = 'Premium' AND (category IS NULL OR category = 'regular');

-- Update snapshot ending_reading to match pump current_reading
UPDATE shift_pump_snapshots sps
SET ending_reading = p.current_reading
FROM pumps p
WHERE sps.pump_id = p.id
  AND sps.shift_date = CURRENT_DATE
  AND sps.status = 'open';

-- Verify the fix
SELECT 
  p.pump_name,
  p.current_reading as pump_current,
  sps.ending_reading as snapshot_ending,
  sps.ending_reading - sps.beginning_reading as snapshot_liters
FROM pumps p
JOIN shift_pump_snapshots sps ON p.id = sps.pump_id
WHERE p.fuel_type = 'Premium' 
  AND (p.category IS NULL OR p.category = 'regular')
  AND sps.shift_date = CURRENT_DATE
  AND sps.status = 'open';
