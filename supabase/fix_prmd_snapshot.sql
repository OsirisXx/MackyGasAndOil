-- ============================================================================
-- Fix: Check and fix PRM-D snapshot WITHOUT deleting anything
-- ============================================================================

-- Step 1: Check what's in the pumps table for Premium Discounted
SELECT id, pump_name, fuel_type, category, initial_reading, current_reading, price_per_liter
FROM pumps 
WHERE fuel_type = 'Premium' AND category = 'discounted';

-- Step 2: Check what's in shift_pump_snapshots for PRM-D
SELECT 
  sps.id,
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.status,
  p.pump_name,
  p.fuel_type,
  p.category
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE p.fuel_type = 'Premium' AND p.category = 'discounted'
  AND sps.shift_date = CURRENT_DATE;

-- Step 3: Fix PRM-D snapshots - set beginning = ending (no sales)
-- This makes the liters = 0 without deleting anything
UPDATE shift_pump_snapshots sps
SET beginning_reading = ending_reading
FROM pumps p
WHERE sps.pump_id = p.id
  AND p.fuel_type = 'Premium' 
  AND p.category = 'discounted'
  AND sps.shift_date = CURRENT_DATE;

-- Step 4: Verify the fix
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
