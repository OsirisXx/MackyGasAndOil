-- ============================================================================
-- STEP 1: Add anon access to PRODUCTS table (so POS can read products)
-- Run this FIRST
-- ============================================================================
CREATE POLICY "products_anon_select" ON products
  FOR SELECT TO anon USING (true);

-- ============================================================================
-- STEP 2: Create product_sales table
-- ============================================================================
DROP TABLE IF EXISTS product_sales CASCADE;

CREATE TABLE product_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID,
  branch_id UUID,
  product_id UUID,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_sales_auth_all" ON product_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "product_sales_anon_insert" ON product_sales
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "product_sales_anon_select" ON product_sales
  FOR SELECT TO anon USING (true);
