-- ============================================================================
-- Migration: 06_accountability_updates.sql
-- Date: 2026-02-16
-- Description: Update charge_invoices, deposits, checks, expenses, and 
--              purchases_disbursements to support branch/shift-based reporting
--              independent of daily_reports table
-- ============================================================================

-- ============================================================================
-- 1. ADD BRANCH AND SHIFT COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Charge Invoices
ALTER TABLE public.charge_invoices 
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES public.cashiers(id),
  ALTER COLUMN daily_report_id DROP NOT NULL;

-- Deposits
ALTER TABLE public.deposits 
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES public.cashiers(id),
  ALTER COLUMN daily_report_id DROP NOT NULL;

-- Checks
ALTER TABLE public.checks 
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES public.cashiers(id),
  ALTER COLUMN daily_report_id DROP NOT NULL;

-- Expenses
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES public.cashiers(id),
  ALTER COLUMN daily_report_id DROP NOT NULL;

-- Purchases/Disbursements
ALTER TABLE public.purchases_disbursements 
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS shift_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS shift_number INT CHECK (shift_number IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES public.cashiers(id),
  ALTER COLUMN daily_report_id DROP NOT NULL;

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_charge_invoices_branch ON public.charge_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_charge_invoices_shift_date ON public.charge_invoices(shift_date);
CREATE INDEX IF NOT EXISTS idx_deposits_branch ON public.deposits(branch_id);
CREATE INDEX IF NOT EXISTS idx_deposits_shift_date ON public.deposits(shift_date);
CREATE INDEX IF NOT EXISTS idx_checks_branch ON public.checks(branch_id);
CREATE INDEX IF NOT EXISTS idx_checks_shift_date ON public.checks(shift_date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift_date ON public.expenses(shift_date);
CREATE INDEX IF NOT EXISTS idx_purchases_branch ON public.purchases_disbursements(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_shift_date ON public.purchases_disbursements(shift_date);

-- ============================================================================
-- 3. SAMPLE INSERT STATEMENTS FOR CHARGE INVOICES
-- ============================================================================
-- Use these as templates to insert charge invoice data
-- Replace UUIDs with actual values from your database

/*
-- Example: Insert charge invoices for a specific date and shift
INSERT INTO public.charge_invoices (branch_id, shift_date, shift_number, ci_number, customer_name, amount, fuel_type_id, notes)
VALUES
  ('your-branch-uuid', '2026-01-31', 2, '1', 'TABIL ALBERT (PRM)', 200.00, NULL, 'Premium'),
  ('your-branch-uuid', '2026-01-31', 2, '2', 'KUOL OWONG L (PRM)', 150.00, NULL, 'Premium'),
  ('your-branch-uuid', '2026-01-31', 2, '20', 'BIS AUG 2404 (DSL)', 1290.00, NULL, 'Diesel'),
  ('your-branch-uuid', '2026-01-31', 2, '282', 'MACROCK ABEL 6624 (DSL)', 18189.00, NULL, 'Diesel'),
  ('your-branch-uuid', '2026-01-31', 2, '30', 'BISRLK 704 (DSL)', 1935.00, NULL, 'Diesel'),
  ('your-branch-uuid', '2026-01-31', 2, '180', 'MACROCK PRIM (DSL)', 11610.00, NULL, 'Diesel'),
  ('your-branch-uuid', '2026-01-31', 2, '310', 'MACROCK ALBA 742', 19905.00, NULL, NULL),
  ('your-branch-uuid', '2026-01-31', 2, '2473E', 'MACROCK NORS 465 BW', 10192.62, NULL, NULL),
  ('your-branch-uuid', '2026-01-31', 2, '151', 'MACROCK MAHOBIMBO', 9739.50, NULL, NULL),
  ('your-branch-uuid', '2026-01-31', 2, NULL, 'BIS MBIK (PRM)', 150.00, NULL, 'Premium');

-- Example: Insert deposits
INSERT INTO public.deposits (branch_id, shift_date, shift_number, deposit_number, amount, payment_method, notes)
VALUES
  ('your-branch-uuid', '2026-01-31', 2, 1, 500.00, 'gcash', 'G cash'),
  ('your-branch-uuid', '2026-01-31', 2, 2, 1500.00, 'gcash', 'G cash'),
  ('your-branch-uuid', '2026-01-31', 2, 3, 3600.00, 'cash', NULL),
  ('your-branch-uuid', '2026-01-31', 2, 4, 8000.00, 'gcash', 'G cash'),
  ('your-branch-uuid', '2026-01-31', 2, 5, 10600.00, 'cash', NULL),
  ('your-branch-uuid', '2026-01-31', 2, 6, 2700.00, 'cash', NULL);

-- Example: Insert expenses
INSERT INTO public.expenses (branch_id, shift_date, shift_number, nature, amount, notes)
VALUES
  ('your-branch-uuid', '2026-01-31', 2, 'Supplies', 500.00, NULL),
  ('your-branch-uuid', '2026-01-31', 2, 'Utilities', 1200.00, NULL);

-- Example: Insert purchases/disbursements
INSERT INTO public.purchases_disbursements (branch_id, shift_date, shift_number, particulars, amount, notes)
VALUES
  ('your-branch-uuid', '2026-01-31', 2, 'Office Supplies', 350.00, NULL),
  ('your-branch-uuid', '2026-01-31', 2, 'Maintenance', 800.00, NULL);
*/
