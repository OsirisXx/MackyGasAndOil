-- ============================================================================
-- Fix v6: Clean up shift snapshots - only Premium Regular had sales
-- All other pumps should have beginning = ending (no sales)
-- ============================================================================

-- Step 1: Check current state
SELECT 
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters,
  sps.status,
  p.pump_name,
  p.fuel_type,
  p.category
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE
ORDER BY p.fuel_type, p.category, sps.shift_number;

-- Step 2: Delete all snapshots for today and recreate properly
DELETE FROM shift_pump_snapshots WHERE shift_date = CURRENT_DATE;

-- Step 3: Create 1st shift snapshots
-- Only Premium Regular pump had sales: 364,381.34 → 364,571.73
-- All other pumps: beginning = ending = initial_reading (no sales)
INSERT INTO shift_pump_snapshots (
  branch_id, pump_id, shift_date, shift_number,
  beginning_reading, ending_reading, price_per_liter, status, closed_at
)
SELECT 
  branch_id, 
  id, 
  CURRENT_DATE, 
  1,  -- 1st shift
  initial_reading,  -- beginning = initial for all
  CASE 
    WHEN fuel_type = 'Premium' AND (category IS NULL OR category = 'regular') 
    THEN 364571.73  -- Premium Regular had sales, ended at this reading
    ELSE initial_reading  -- All others: no sales, ending = beginning
  END,
  price_per_liter,
  'closed',
  (CURRENT_DATE + TIME '12:00:00')::timestamp
FROM pumps
WHERE is_active = true;

-- Step 4: Create 2nd shift snapshots
-- Premium Regular: beginning = 364,571.73 (where 1st shift ended)
-- All others: beginning = initial_reading (no sales yet)
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
    WHEN fuel_type = 'Premium' AND (category IS NULL OR category = 'regular') 
    THEN 364571.73  -- Start where 1st shift ended
    ELSE initial_reading  -- Others start at initial
  END,
  current_reading,  -- Current reading for all
  price_per_liter,
  'open'
FROM pumps
WHERE is_active = true;

-- Step 5: Verify - should show correct data
SELECT 
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters,
  (sps.ending_reading - sps.beginning_reading) * sps.price_per_liter as amount,
  sps.status,
  p.pump_name,
  p.fuel_type,
  p.category
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = CURRENT_DATE
ORDER BY p.fuel_type, p.category, sps.shift_number;

-- Expected:
-- 1st shift Premium Regular: 364,381.34 → 364,571.73 = 190.39L = ₱13,089.31
-- 1st shift all others: 0 liters
-- 2nd shift Premium Regular: 364,571.73 → 364,601.73 = 30L = ₱2,062.50
-- 2nd shift all others: 0 liters (or whatever current sales are)
