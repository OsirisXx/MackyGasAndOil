-- Check cash_sales table schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cash_sales'
ORDER BY ordinal_position;

-- Check if there are any sales for today
SELECT id, cashier_id, amount, liters, pump_id, created_at
FROM cash_sales
WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;
