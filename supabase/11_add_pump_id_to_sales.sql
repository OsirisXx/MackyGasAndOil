-- ============================================================================
-- Migration: 11_add_pump_id_to_sales.sql
-- Date: 2026-02-27
-- Description: Add pump_id column to cash_sales and purchase_orders tables
--              to support pump-based sales tracking instead of fuel_type_id
-- ============================================================================

-- ============================================================================
-- 1. ADD PUMP_ID TO CASH_SALES TABLE
-- ============================================================================
ALTER TABLE public.cash_sales
ADD COLUMN IF NOT EXISTS pump_id UUID REFERENCES public.pumps(id);

-- Create index for pump_id lookups
CREATE INDEX IF NOT EXISTS idx_cash_sales_pump ON public.cash_sales(pump_id);

-- ============================================================================
-- 2. ADD PUMP_ID TO PURCHASE_ORDERS TABLE
-- ============================================================================
ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS pump_id UUID REFERENCES public.pumps(id);

-- Create index for pump_id lookups
CREATE INDEX IF NOT EXISTS idx_purchase_orders_pump ON public.purchase_orders(pump_id);

-- ============================================================================
-- 3. OPTIONAL: MIGRATE EXISTING DATA (if preserving history)
-- ============================================================================
-- If you want to migrate existing fuel_type_id data to pump_id:
-- This assumes you've created pumps that match your fuel types
-- Uncomment and adjust as needed:

/*
-- Example migration for cash_sales:
UPDATE public.cash_sales cs
SET pump_id = (
  SELECT p.id 
  FROM public.pumps p
  WHERE p.fuel_type_id = cs.fuel_type_id 
    AND p.branch_id = cs.branch_id
  LIMIT 1
)
WHERE cs.pump_id IS NULL AND cs.fuel_type_id IS NOT NULL;

-- Example migration for purchase_orders:
UPDATE public.purchase_orders po
SET pump_id = (
  SELECT p.id 
  FROM public.pumps p
  WHERE p.fuel_type_id = po.fuel_type_id 
    AND p.branch_id = po.branch_id
  LIMIT 1
)
WHERE po.pump_id IS NULL AND po.fuel_type_id IS NOT NULL;
*/

-- ============================================================================
-- 4. NOTES
-- ============================================================================
-- After this migration:
-- - New sales will use pump_id instead of fuel_type_id
-- - Old sales will still have fuel_type_id for historical reference
-- - You can keep both columns or eventually deprecate fuel_type_id
-- - The POS system will now record which specific pump dispensed fuel
