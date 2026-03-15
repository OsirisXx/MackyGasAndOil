-- ============================================================================
-- Fix: March 15, 2026 Shift 2 Snapshots
-- Problem: Snapshots were created AFTER sales happened, so they captured
--          the already-updated pump readings as both beginning and ending.
-- Solution: Recalculate beginning_reading by subtracting today's sales liters
-- 
-- RUN THIS IN SUPABASE SQL EDITOR (Dashboard > SQL Editor)
-- ============================================================================

-- Step 1: Check current state BEFORE fix
SELECT 
  'BEFORE FIX' as status,
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters_shown,
  p.pump_name,
  p.fuel_type
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = '2026-03-15'
ORDER BY p.fuel_type, p.pump_name;

-- Step 2: Show what sales exist for March 15, 2026
SELECT 
  p.pump_name,
  p.fuel_type,
  SUM(cs.liters) as total_liters_sold
FROM cash_sales cs
JOIN pumps p ON cs.pump_id = p.id
WHERE cs.created_at >= '2026-03-15 00:00:00+08'
  AND cs.created_at < '2026-03-16 00:00:00+08'
  AND cs.liters IS NOT NULL
GROUP BY p.pump_name, p.fuel_type
ORDER BY p.fuel_type, p.pump_name;

-- Step 3: FIX THE SNAPSHOTS
-- This updates beginning_reading = current_reading - today's sales
-- So that ending - beginning = liters sold today
WITH daily_sales AS (
  SELECT 
    pump_id,
    SUM(liters) as total_liters
  FROM cash_sales
  WHERE created_at >= '2026-03-15 00:00:00+08'
    AND created_at < '2026-03-16 00:00:00+08'
    AND pump_id IS NOT NULL
    AND liters IS NOT NULL
  GROUP BY pump_id
  
  UNION ALL
  
  SELECT 
    pump_id,
    SUM(liters) as total_liters
  FROM purchase_orders
  WHERE created_at >= '2026-03-15 00:00:00+08'
    AND created_at < '2026-03-16 00:00:00+08'
    AND pump_id IS NOT NULL
    AND liters IS NOT NULL
  GROUP BY pump_id
),
pump_daily_totals AS (
  SELECT pump_id, SUM(total_liters) as total_liters
  FROM daily_sales
  GROUP BY pump_id
)
UPDATE shift_pump_snapshots sps
SET 
  ending_reading = p.current_reading,
  beginning_reading = p.current_reading - COALESCE(pdt.total_liters, 0)
FROM pumps p
LEFT JOIN pump_daily_totals pdt ON pdt.pump_id = p.id
WHERE sps.pump_id = p.id
  AND sps.shift_date = '2026-03-15'
  AND sps.shift_number = 2;

-- Step 4: Verify the fix AFTER
SELECT 
  'AFTER FIX' as status,
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters_shown,
  (sps.ending_reading - sps.beginning_reading) * sps.price_per_liter as amount,
  p.pump_name,
  p.fuel_type
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
WHERE sps.shift_date = '2026-03-15'
ORDER BY p.fuel_type, p.pump_name;
