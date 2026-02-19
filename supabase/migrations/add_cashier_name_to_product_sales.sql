-- Add cashier_name column to product_sales table
-- This allows displaying cashier name without needing a join to cashiers table

ALTER TABLE product_sales 
ADD COLUMN IF NOT EXISTS cashier_name TEXT;

-- Backfill existing records with cashier names
UPDATE product_sales ps
SET cashier_name = c.full_name
FROM cashiers c
WHERE ps.cashier_id = c.id
AND ps.cashier_name IS NULL;
