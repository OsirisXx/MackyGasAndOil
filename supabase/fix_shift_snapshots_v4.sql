-- ============================================================================
-- Fix v4: Reset shift snapshots to show correct CURRENT SHIFT data
-- The current shift (1st) should show the FULL pump readings
-- ============================================================================

-- Step 1: Delete all snapshots for today to start fresh
DELETE FROM shift_pump_snapshots WHERE shift_date = CURRENT_DATE;

-- Step 2: Create snapshot for CURRENT SHIFT ONLY (1st shift)
-- This captures the full data: initial_reading to current_reading
INSERT INTO shift_pump_snapshots (
  branch_id, pump_id, shift_date, shift_number,
  beginning_reading, ending_reading, price_per_liter, status
)
SELECT 
  branch_id, 
  id, 
  CURRENT_DATE, 
  1,  -- 1st shift (current)
  initial_reading,
  current_reading,
  price_per_liter,
  'open'
FROM pumps
WHERE is_active = true;

-- Step 3: Verify - should show Premium with 190.39 liters = ₱13,089.31
SELECT 
  sps.shift_date, 
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters_sold,
  (sps.ending_reading - sps.beginning_reading) * sps.price_per_liter as amount,
  sps.price_per_liter,
  sps.status,
  p.pump_name,
  p.fuel_type
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE
ORDER BY p.fuel_type, sps.shift_number;
