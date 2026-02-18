-- ============================================================================
-- Migration: 02_qr_auth_attendance_pos.sql
-- Date: 2026-02-16
-- Description: Add cashiers (QR auth), attendance, cash_sales, purchase_orders
--              Rework auth flow: Admin (email/pass) + Cashier (QR/PIN)
-- ============================================================================
-- REMINDER: Update Supabase by running this in the SQL Editor after 00_initial_schema.sql

-- ============================================================================
-- 1. CASHIERS TABLE (replaces profiles for cashier role)
-- ============================================================================
CREATE TABLE public.cashiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  pin_code TEXT NOT NULL,
  qr_token UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. ATTENDANCE TABLE
-- ============================================================================
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cashier_id UUID NOT NULL REFERENCES public.cashiers(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT CHECK (shift_number IN (1, 2, 3)),
  check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. CASH SALES (walk-in fuel transactions)
-- ============================================================================
CREATE TABLE public.cash_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cashier_id UUID NOT NULL REFERENCES public.cashiers(id),
  daily_report_id UUID REFERENCES public.daily_reports(id) ON DELETE SET NULL,
  fuel_type_id UUID REFERENCES public.fuel_types(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  liters NUMERIC(10,3),
  price_per_liter NUMERIC(10,2),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'gcash', 'other')),
  customer_name TEXT,
  plate_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. PURCHASE ORDERS (gas taken but NOT yet paid — credit/charge)
-- ============================================================================
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number TEXT,
  cashier_id UUID NOT NULL REFERENCES public.cashiers(id),
  daily_report_id UUID REFERENCES public.daily_reports(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  fuel_type_id UUID REFERENCES public.fuel_types(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  liters NUMERIC(10,3),
  price_per_liter NUMERIC(10,2),
  plate_number TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled')),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. UPDATE shifts TABLE — link to cashiers instead of profiles
-- ============================================================================
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS cashier_ref UUID REFERENCES public.cashiers(id);

-- ============================================================================
-- 6. RLS POLICIES for new tables
-- ============================================================================
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- Authenticated (admin) full access
CREATE POLICY "Admin full access" ON public.cashiers
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access" ON public.attendance
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access" ON public.cash_sales
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin full access" ON public.purchase_orders
  FOR ALL USING (auth.role() = 'authenticated');

-- Anon read on cashiers (for QR token validation at login)
CREATE POLICY "Anon can validate QR tokens" ON public.cashiers
  FOR SELECT USING (true);

-- Anon insert on attendance (for cashier check-in)
CREATE POLICY "Anon can log attendance" ON public.attendance
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon can read attendance" ON public.attendance
  FOR SELECT USING (true);
CREATE POLICY "Anon can update attendance" ON public.attendance
  FOR UPDATE USING (true);

-- Anon access on cash_sales (cashier needs to insert)
CREATE POLICY "Anon can insert cash sales" ON public.cash_sales
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon can read cash sales" ON public.cash_sales
  FOR SELECT USING (true);

-- Anon access on purchase_orders (cashier needs to insert/read)
CREATE POLICY "Anon can insert purchase orders" ON public.purchase_orders
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon can read purchase orders" ON public.purchase_orders
  FOR SELECT USING (true);
CREATE POLICY "Anon can update purchase orders" ON public.purchase_orders
  FOR UPDATE USING (true);

-- Also allow anon read on fuel_types (cashier needs prices)
CREATE POLICY "Anon can read fuel types" ON public.fuel_types
  FOR SELECT USING (true);

-- Allow anon read on customers (for PO customer lookup)
CREATE POLICY "Anon can read customers" ON public.customers
  FOR SELECT USING (true);

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================
CREATE TRIGGER update_cashiers_updated_at
  BEFORE UPDATE ON public.cashiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 8. SEED ADMIN ACCOUNT
-- ============================================================================
-- NOTE: The admin account macky@admin.com / mackyadmin123 must be created
-- via Supabase Auth (Dashboard > Authentication > Users > Add User)
-- or via the app's sign-up flow. After creating, run:
--
-- UPDATE public.profiles SET role = 'admin' WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'macky@admin.com'
-- );
