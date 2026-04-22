-- ============================================================================
-- Migration: 23_shift_tracking_deposits_po.sql
-- Description: Add shift tracking to purchase_orders, cash_deposits,
--              cash_withdrawals, and cash_sales tables.
--              Backfill existing records using timestamp-based shift detection.
-- ============================================================================

-- ============================================================================
-- STEP 1: Add shift columns to purchase_orders
-- ============================================================================
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS shift_date DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_shift
  ON public.purchase_orders(shift_date, shift_number);

-- ============================================================================
-- STEP 2: Add shift columns to cash_deposits
-- ============================================================================
ALTER TABLE public.cash_deposits
  ADD COLUMN IF NOT EXISTS shift_date DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3));

CREATE INDEX IF NOT EXISTS idx_cash_deposits_shift
  ON public.cash_deposits(shift_date, shift_number);

-- ============================================================================
-- STEP 3: Add shift columns to cash_withdrawals
-- ============================================================================
ALTER TABLE public.cash_withdrawals
  ADD COLUMN IF NOT EXISTS shift_date DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3));

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_shift
  ON public.cash_withdrawals(shift_date, shift_number);

-- ============================================================================
-- STEP 4: Add shift columns to cash_sales (if not already present)
-- ============================================================================
ALTER TABLE public.cash_sales
  ADD COLUMN IF NOT EXISTS shift_date DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3));

CREATE INDEX IF NOT EXISTS idx_cash_sales_shift
  ON public.cash_sales(shift_date, shift_number);


-- ============================================================================
-- STEP 5: Backfill existing records using get_shift_for_timestamp
-- (requires the function from migration 22)
-- ============================================================================

-- Backfill purchase_orders
UPDATE public.purchase_orders po
SET shift_date = shift_info.shift_date,
    shift_number = shift_info.shift_number
FROM (
  SELECT po2.id,
         (public.get_shift_for_timestamp(po2.created_at, COALESCE(b.name, 'Manolo'))).shift_date as shift_date,
         (public.get_shift_for_timestamp(po2.created_at, COALESCE(b.name, 'Manolo'))).shift_number as shift_number
  FROM public.purchase_orders po2
  LEFT JOIN public.branches b ON b.id = po2.branch_id
  WHERE po2.shift_date IS NULL
) shift_info
WHERE po.id = shift_info.id;

-- Backfill cash_deposits
UPDATE public.cash_deposits cd
SET shift_date = shift_info.shift_date,
    shift_number = shift_info.shift_number
FROM (
  SELECT cd2.id,
         (public.get_shift_for_timestamp(cd2.created_at, COALESCE(b.name, 'Manolo'))).shift_date as shift_date,
         (public.get_shift_for_timestamp(cd2.created_at, COALESCE(b.name, 'Manolo'))).shift_number as shift_number
  FROM public.cash_deposits cd2
  LEFT JOIN public.branches b ON b.id = cd2.branch_id
  WHERE cd2.shift_date IS NULL
) shift_info
WHERE cd.id = shift_info.id;

-- Backfill cash_withdrawals
UPDATE public.cash_withdrawals cw
SET shift_date = shift_info.shift_date,
    shift_number = shift_info.shift_number
FROM (
  SELECT cw2.id,
         (public.get_shift_for_timestamp(cw2.created_at, COALESCE(b.name, 'Manolo'))).shift_date as shift_date,
         (public.get_shift_for_timestamp(cw2.created_at, COALESCE(b.name, 'Manolo'))).shift_number as shift_number
  FROM public.cash_withdrawals cw2
  LEFT JOIN public.branches b ON b.id = cw2.branch_id
  WHERE cw2.shift_date IS NULL
) shift_info
WHERE cw.id = shift_info.id;

-- Backfill cash_sales
UPDATE public.cash_sales cs
SET shift_date = shift_info.shift_date,
    shift_number = shift_info.shift_number
FROM (
  SELECT cs2.id,
         (public.get_shift_for_timestamp(cs2.created_at, COALESCE(b.name, 'Manolo'))).shift_date as shift_date,
         (public.get_shift_for_timestamp(cs2.created_at, COALESCE(b.name, 'Manolo'))).shift_number as shift_number
  FROM public.cash_sales cs2
  LEFT JOIN public.branches b ON b.id = cs2.branch_id
  WHERE cs2.shift_date IS NULL
) shift_info
WHERE cs.id = shift_info.id;

-- Verify backfill
SELECT 'purchase_orders' as tbl, COUNT(*) as total, COUNT(shift_date) as with_shift FROM public.purchase_orders
UNION ALL
SELECT 'cash_deposits', COUNT(*), COUNT(shift_date) FROM public.cash_deposits
UNION ALL
SELECT 'cash_withdrawals', COUNT(*), COUNT(shift_date) FROM public.cash_withdrawals
UNION ALL
SELECT 'cash_sales', COUNT(*), COUNT(shift_date) FROM public.cash_sales;
