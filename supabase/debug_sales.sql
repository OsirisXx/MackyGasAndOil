-- Debug: Check cash_sales for today with all relevant fields
SELECT 
  id,
  cashier_id,
  branch_id,
  amount,
  liters,
  pump_id,
  created_at AT TIME ZONE 'Asia/Manila' as created_ph
FROM cash_sales
WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 15;

-- Check cashier info
SELECT id, full_name, branch_id FROM cashiers WHERE is_active = true;
