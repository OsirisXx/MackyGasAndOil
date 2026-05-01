-- ============================================================================
-- Migration: 25_vault_po_expansion.sql
-- Description: Add deposit_type and soft delete to cash_deposits,
--              add CI/PO reference fields to purchase_orders.
--              All columns nullable for backward compatibility.
-- ============================================================================

-- Add deposit_type to cash_deposits (vault_deposit, gcash, cash_register)
ALTER TABLE public.cash_deposits
  ADD COLUMN IF NOT EXISTS deposit_type TEXT
  CHECK (deposit_type IN ('vault_deposit', 'gcash', 'cash_register'));

-- Add soft delete column to cash_deposits
ALTER TABLE public.cash_deposits
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for efficient soft delete queries
CREATE INDEX IF NOT EXISTS idx_cash_deposits_deleted_at
  ON public.cash_deposits(deleted_at);

-- Index for deposit type filtering
CREATE INDEX IF NOT EXISTS idx_cash_deposits_type
  ON public.cash_deposits(deposit_type);

-- Add new PO/CI reference fields to purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS ci_number TEXT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_slip_number TEXT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS unit_type TEXT
  CHECK (unit_type IN ('liters', 'pcs'));
