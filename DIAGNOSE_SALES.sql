-- Diagnostic query to check why sales aren't showing in accountability report

-- Check recent cash sales
SELECT 
  id,
  created_at,
  shift_date,
  shift_number,
  amount,
  cashier_id,
  branch_id
FROM cash_sales
WHERE created_at >= NOW() - INTERVAL '1 day'
ORDER BY created_at DESC
LIMIT 10;

-- Check if shift_date and shift_number columns exist and have data
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'cash_sales'
  AND column_name IN ('shift_date', 'shift_number');

-- Check for sales with NULL shift_date or shift_number
SELECT COUNT(*) as sales_with_null_shift
FROM cash_sales
WHERE shift_date IS NULL OR shift_number IS NULL;

-- Check today's sales grouped by shift
SELECT 
  shift_date,
  shift_number,
  COUNT(*) as sale_count,
  SUM(amount) as total_amount
FROM cash_sales
WHERE shift_date = CURRENT_DATE
GROUP BY shift_date, shift_number
ORDER BY shift_number;
