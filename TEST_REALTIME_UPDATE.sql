-- ============================================================================
-- Test Realtime Pump Price Update
-- Description: Manually update a pump price to test if POS receives realtime event
-- ============================================================================

-- INSTRUCTIONS:
-- 1. Open POS terminal in browser
-- 2. Open browser console (F12)
-- 3. Run this SQL in Supabase SQL Editor
-- 4. Check browser console for "[Realtime] Pump price updated:" log
-- 5. Check if toast notification appears in POS
-- 6. Check if pump price updates in UI

-- Get current pump prices for Balingasag branch
SELECT 
  pumps.id,
  pumps.pump_name,
  pumps.price_per_liter,
  pumps.branch_id,
  branches.name as branch_name
FROM pumps
JOIN branches ON pumps.branch_id = branches.id
WHERE branches.name = 'Balingasag'
ORDER BY pumps.pump_name;

-- Update Pump #1 Diesel price (add 1 peso)
-- Replace the pump_name if needed based on results above
UPDATE pumps
SET price_per_liter = price_per_liter + 1.00,
    updated_at = now()
WHERE pump_name = '#1 Diesel'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Balingasag')
RETURNING 
  id,
  pump_name,
  price_per_liter as new_price,
  updated_at;

-- ============================================================================
-- Expected Results in POS:
-- 1. Browser console shows: "[Realtime] Pump price updated: {payload}"
-- 2. Toast notification appears: "Pump prices updated 💰"
-- 3. Pump #1 Diesel price increases by ₱1.00 in the UI
-- 4. No page refresh needed
-- ============================================================================

-- To revert the test change:
-- UPDATE pumps
-- SET price_per_liter = price_per_liter - 1.00
-- WHERE pump_name = '#1 Diesel'
--   AND branch_id = (SELECT id FROM branches WHERE name = 'Balingasag');
