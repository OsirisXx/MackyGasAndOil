-- Debug: Check cash_sales for today
SELECT 
  id,
  branch_id,
  amount,
  created_at AT TIME ZONE 'Asia/Manila' as created_ph,
  pump_id
FROM cash_sales
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;

-- Check what branch_id the cashier has
SELECT id, full_name, branch_id FROM cashiers WHERE is_active = true;
