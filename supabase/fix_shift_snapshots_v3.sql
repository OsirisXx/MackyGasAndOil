-- ============================================================================
-- Fix v3: Properly update shift snapshots for Premium pump
-- ============================================================================

-- Step 1: Check what pumps exist and their IDs
SELECT id, pump_name, fuel_type, category, initial_reading, current_reading, branch_id
FROM pumps WHERE fuel_type = 'Premium' AND is_active = true;

-- Step 2: Check current snapshots
SELECT 
  sps.id,
  sps.pump_id,
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.status,
  p.pump_name,
  p.fuel_type,
  p.category
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE
ORDER BY p.fuel_type, sps.shift_number;

-- Step 3: Update Premium pump snapshots (without category filter)
-- 1st shift: 364,381.34 to 364,495.57 (~114 liters)
UPDATE shift_pump_snapshots sps
SET 
  beginning_reading = 364381.34,
  ending_reading = 364495.57,
  price_per_liter = 68.75
FROM pumps p
WHERE sps.pump_id = p.id
  AND p.fuel_type = 'Premium'
  AND sps.shift_date = CURRENT_DATE
  AND sps.shift_number = 1;

-- 2nd shift: 364,495.57 to 364,571.73 (~76 liters)
UPDATE shift_pump_snapshots sps
SET 
  beginning_reading = 364495.57,
  ending_reading = 364571.73,
  price_per_liter = 68.75
FROM pumps p
WHERE sps.pump_id = p.id
  AND p.fuel_type = 'Premium'
  AND sps.shift_date = CURRENT_DATE
  AND sps.shift_number = 2;

-- Step 4: Verify the updates
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
