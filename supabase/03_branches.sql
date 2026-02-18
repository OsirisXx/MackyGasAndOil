-- ============================================================================
-- Migration: 03_branches.sql
-- Date: 2026-02-16
-- Description: Add multi-branch support. Creates branches table and adds
--              branch_id to cashiers, cash_sales, purchase_orders, attendance.
-- ============================================================================

-- ============================================================================
-- 1. BRANCHES TABLE
-- ============================================================================
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default branch (so existing data doesn't break)
INSERT INTO public.branches (name, address) VALUES
  ('Main Branch', 'Lower Sosohon, Manolo Fortich, Bukidnon');

-- ============================================================================
-- 2. ADD branch_id TO EXISTING TABLES
-- ============================================================================

-- Cashiers
ALTER TABLE public.cashiers
  ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Cash Sales
ALTER TABLE public.cash_sales
  ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Purchase Orders
ALTER TABLE public.purchase_orders
  ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Attendance
ALTER TABLE public.attendance
  ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- ============================================================================
-- 3. BACKFILL existing rows with the default branch
-- ============================================================================
UPDATE public.cashiers SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;
UPDATE public.cash_sales SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;
UPDATE public.purchase_orders SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;
UPDATE public.attendance SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access" ON public.branches
  FOR ALL USING (auth.role() = 'authenticated');

-- Anon can read branches (cashier login needs branch info)
CREATE POLICY "Anon can read branches" ON public.branches
  FOR SELECT USING (true);

-- ============================================================================
-- 5. INDEXES for branch_id filtering (performance)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_cashiers_branch ON public.cashiers(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sales_branch ON public.cash_sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sales_created ON public.cash_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON public.purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON public.purchase_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON public.attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_shift_date ON public.attendance(shift_date);

-- ============================================================================
-- 6. TRIGGER
-- ============================================================================
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
