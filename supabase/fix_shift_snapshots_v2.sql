-- ============================================================================
-- Fix: Update shift snapshots with correct Premium pump readings
-- Based on the simulation data: initial=364,381.34, current=364,571.73
-- ============================================================================

-- First, let's see the current pump data
SELECT id, pump_name, fuel_type, initial_reading, current_reading, branch_id
FROM pumps WHERE is_active = true;

-- Update the Premium Regular pump snapshots with correct readings
-- 1st shift: 364,381.34 to 364,495.57 (~114 liters, 60% of sales)
-- 2nd shift: 364,495.57 to 364,571.73 (~76 liters, 40% of sales)

UPDATE shift_pump_snapshots sps
SET 
  beginning_reading = 364381.34,
  ending_reading = 364495.57
FROM pumps p
WHERE sps.pump_id = p.id
  AND p.fuel_type = 'Premium'
  AND p.category = 'regular'
  AND sps.shift_date = CURRENT_DATE
  AND sps.shift_number = 1;

UPDATE shift_pump_snapshots sps
SET 
  beginning_reading = 364495.57,
  ending_reading = 364571.73
FROM pumps p
WHERE sps.pump_id = p.id
  AND p.fuel_type = 'Premium'
  AND p.category = 'regular'
  AND sps.shift_date = CURRENT_DATE
  AND sps.shift_number = 2;

-- Verify the fix
SELECT 
  sps.shift_date, 
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
WHERE p.fuel_type = 'Premium'
ORDER BY sps.shift_number;
