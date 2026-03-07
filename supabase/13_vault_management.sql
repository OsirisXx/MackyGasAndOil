-- =====================================================
-- VAULT MANAGEMENT: Cash Deposits & Withdrawals
-- =====================================================
-- This migration creates tables for tracking:
-- 1. Cash deposits (cashier puts money into vault)
-- 2. Cash withdrawals (cashier takes money from vault)
-- Both are visible to admins for accountability

-- =====================================================
-- CASH DEPOSITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cash_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cashier_id UUID NOT NULL REFERENCES public.cashiers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  deposit_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Indexes for cash_deposits
CREATE INDEX IF NOT EXISTS idx_cash_deposits_branch ON public.cash_deposits(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_cashier ON public.cash_deposits(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_date ON public.cash_deposits(deposit_date);

-- =====================================================
-- CASH WITHDRAWALS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cashier_id UUID NOT NULL REFERENCES public.cashiers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  withdrawal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL, -- Required: why is cash being withdrawn
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id), -- Optional: admin who approved
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Indexes for cash_withdrawals
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_branch ON public.cash_withdrawals(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_cashier ON public.cash_withdrawals(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_date ON public.cash_withdrawals(withdrawal_date);

-- =====================================================
-- RLS POLICIES - CASH DEPOSITS
-- =====================================================
ALTER TABLE public.cash_deposits ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "Admin full access" ON public.cash_deposits;
CREATE POLICY "Admin full access"
  ON public.cash_deposits
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Anon access for cashiers (QR/PIN auth)
DROP POLICY IF EXISTS "Anon can insert deposits" ON public.cash_deposits;
CREATE POLICY "Anon can insert deposits"
  ON public.cash_deposits
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can read deposits" ON public.cash_deposits;
CREATE POLICY "Anon can read deposits"
  ON public.cash_deposits
  FOR SELECT
  USING (true);

-- =====================================================
-- RLS POLICIES - CASH WITHDRAWALS
-- =====================================================
ALTER TABLE public.cash_withdrawals ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "Admin full access" ON public.cash_withdrawals;
CREATE POLICY "Admin full access"
  ON public.cash_withdrawals
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Anon access for cashiers (QR/PIN auth)
DROP POLICY IF EXISTS "Anon can insert withdrawals" ON public.cash_withdrawals;
CREATE POLICY "Anon can insert withdrawals"
  ON public.cash_withdrawals
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can read withdrawals" ON public.cash_withdrawals;
CREATE POLICY "Anon can read withdrawals"
  ON public.cash_withdrawals
  FOR SELECT
  USING (true);

-- =====================================================
-- TRIGGERS
-- =====================================================
DROP TRIGGER IF EXISTS update_cash_deposits_updated_at ON public.cash_deposits;
CREATE TRIGGER update_cash_deposits_updated_at
  BEFORE UPDATE ON public.cash_deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_cash_withdrawals_updated_at ON public.cash_withdrawals;
CREATE TRIGGER update_cash_withdrawals_updated_at
  BEFORE UPDATE ON public.cash_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.cash_deposits IS 'Tracks cash deposits made by cashiers to the vault';
COMMENT ON COLUMN public.cash_deposits.amount IS 'Amount deposited in PHP';
COMMENT ON COLUMN public.cash_deposits.deposit_date IS 'Date and time of the deposit';
COMMENT ON COLUMN public.cash_deposits.notes IS 'Optional notes about the deposit';

COMMENT ON TABLE public.cash_withdrawals IS 'Tracks cash withdrawals made by cashiers from the vault';
COMMENT ON COLUMN public.cash_withdrawals.amount IS 'Amount withdrawn in PHP';
COMMENT ON COLUMN public.cash_withdrawals.withdrawal_date IS 'Date and time of the withdrawal';
COMMENT ON COLUMN public.cash_withdrawals.reason IS 'Required reason for withdrawal (e.g., change, expenses, etc.)';
COMMENT ON COLUMN public.cash_withdrawals.approved_by IS 'User ID of admin who approved the withdrawal';
COMMENT ON COLUMN public.cash_withdrawals.notes IS 'Additional notes about the withdrawal';
