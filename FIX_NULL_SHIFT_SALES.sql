-- Fix sales that were recorded without shift_number/shift_date
-- This happens when the shift selection gate was bypassed

-- First, check how many sales have NULL shift info
SELECT 
  COUNT(*) as null_shift_sales,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM cash_sales
WHERE shift_number IS NULL OR shift_date IS NULL;

-- Update recent sales (today) with NULL shift to shift 1
-- Adjust the shift_number and date as needed
UPDATE cash_sales
SET 
  shift_number = 1,  -- Change this to the correct shift
  shift_date = CURRENT_DATE  -- Today's date
WHERE 
  shift_number IS NULL 
  AND created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day';

-- Verify the update
SELECT 
  id,
  created_at,
  shift_date,
  shift_number,
  amount,
  cashier_id
FROM cash_sales
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;

-- Do the same for purchase_orders
UPDATE purchase_orders
SET 
  shift_number = 1,
  shift_date = CURRENT_DATE
WHERE 
  shift_number IS NULL 
  AND created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day';

-- Verify purchase_orders
SELECT 
  id,
  created_at,
  shift_date,
  shift_number,
  amount,
  customer_name
FROM purchase_orders
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
