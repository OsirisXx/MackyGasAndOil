-- Add shift tracking to product_sales table
-- This allows product sales to be included in shift-based accountability reports

ALTER TABLE product_sales
ADD COLUMN IF NOT EXISTS shift_date DATE,
ADD COLUMN IF NOT EXISTS shift_number INTEGER;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_product_sales_shift 
ON product_sales(shift_date, shift_number);

-- Update existing product sales to have shift info based on created_at timestamp
-- This is a best-effort migration for historical data
UPDATE product_sales
SET 
  shift_date = DATE(created_at),
  shift_number = 1  -- Default to shift 1 for existing records
WHERE shift_date IS NULL;

-- Verify the migration
SELECT 
  COUNT(*) as total_product_sales,
  COUNT(shift_date) as with_shift_date,
  COUNT(shift_number) as with_shift_number
FROM product_sales;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Product sales shift tracking columns added successfully';
  RAISE NOTICE 'All existing product sales have been assigned to shift 1';
END $$;
