-- ============================================================================
-- Migration: 12_add_pump_category.sql
-- Date: 2026-02-27
-- Description: Add category field to pumps table to support regular vs discounted
--              pumps with same fuel type for accountability tracking
-- ============================================================================

-- ============================================================================
-- 1. ADD CATEGORY COLUMN TO PUMPS TABLE
-- ============================================================================
ALTER TABLE public.pumps
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'regular' CHECK (category IN ('regular', 'discounted'));

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_pumps_category ON public.pumps(category);

-- ============================================================================
-- 2. UPDATE EXISTING PUMPS TO HAVE CATEGORY
-- ============================================================================
-- Set all existing pumps to 'regular' by default
UPDATE public.pumps
SET category = 'regular'
WHERE category IS NULL;

-- ============================================================================
-- 3. NOTES
-- ============================================================================
-- After this migration:
-- - Pumps can be marked as 'regular' or 'discounted'
-- - Same fuel type can have both regular and discounted pumps
-- - Example:
--   Pump 1 - Diesel Regular (category: regular, price: 64.50)
--   Pump 2 - Diesel Discounted (category: discounted, price: 63.50)
--   Pump 3 - Diesel Regular (category: regular, price: 64.50)
--   Pump 4 - Diesel Regular (category: regular, price: 64.50)
-- - Accountability reports can group by fuel_type + category
-- - This allows tracking: "Diesel Regular" vs "Diesel Discounted" separately
