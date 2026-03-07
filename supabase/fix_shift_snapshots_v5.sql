-- ============================================================================
-- Fix v5: Create proper shift snapshots for 1st and 2nd shifts
-- 1st shift: 364,381.34 → 364,571.73 = 190.39L (closed)
-- 2nd shift: 364,571.73 → 364,601.73 = 30L (open, current)
-- ============================================================================

-- Step 1: Check current pump readings
SELECT id, pump_name, fuel_type, initial_reading, current_reading, branch_id
FROM pumps WHERE fuel_type = 'Premium' AND is_active = true;

-- Step 2: Delete existing snapshots for today
DELETE FROM shift_pump_snapshots WHERE shift_date = CURRENT_DATE;

-- Step 3: Create 1st shift snapshot (CLOSED - already ended at 12:00 PM)
-- Beginning: initial_reading, Ending: 364,571.73 (end of 1st shift)
INSERT INTO shift_pump_snapshots (
  branch_id, pump_id, shift_date, shift_number,
  beginning_reading, ending_reading, price_per_liter, status, closed_at
)
SELECT 
  branch_id, 
  id, 
  CURRENT_DATE, 
  1,  -- 1st shift
  initial_reading,
  CASE 
    WHEN fuel_type = 'Premium' THEN 364571.73  -- End of 1st shift
    ELSE initial_reading  -- No sales for other fuel types
  END,
  price_per_liter,
  'closed',
  (CURRENT_DATE + TIME '12:00:00')::timestamp
FROM pumps
WHERE is_active = true;

-- Step 4: Create 2nd shift snapshot (OPEN - current shift)
-- Beginning: 364,571.73 (where 1st shift ended), Ending: current_reading
INSERT INTO shift_pump_snapshots (
  branch_id, pump_id, shift_date, shift_number,
  beginning_reading, ending_reading, price_per_liter, status
)
SELECT 
  branch_id, 
  id, 
  CURRENT_DATE, 
  2,  -- 2nd shift
  CASE 
    WHEN fuel_type = 'Premium' THEN 364571.73  -- Start where 1st shift ended
    ELSE initial_reading  -- No sales for other fuel types
  END,
  current_reading,
  price_per_liter,
  'open'
FROM pumps
WHERE is_active = true;

-- Step 5: Verify the fix
SELECT 
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters_sold,
  (sps.ending_reading - sps.beginning_reading) * sps.price_per_liter as amount,
  sps.status,
  p.pump_name,
  p.fuel_type
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE AND p.fuel_type = 'Premium'
ORDER BY sps.shift_number;

-- Expected output:
-- Shift 1: 364,381.34 → 364,571.73 = 190.39L = ₱13,089.31 (closed)
-- Shift 2: 364,571.73 → 364,601.73 = 30.00L = ₱2,062.50 (open)
