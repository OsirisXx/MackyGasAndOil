-- ============================================================================
-- MACKY OIL & GAS POS SYSTEM - INITIAL DATABASE SCHEMA
-- ============================================================================
-- REMINDER: After importing this file into Supabase, create separate SQL files
-- for each modification (e.g., 01_alter_add_column.sql, 02_alter_table.sql).
-- Never modify this file after initial import. Use ALTER TABLE statements only
-- in new migration files.
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'cashier');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. FUEL TYPES
-- ============================================================================
CREATE TABLE public.fuel_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL UNIQUE,
  current_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_discounted BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default PH fuel types
INSERT INTO public.fuel_types (name, short_code, current_price, is_discounted) VALUES
  ('Diesel', 'DSL', 64.50, false),
  ('Premium', 'PRM', 68.75, false),
  ('Unleaded', 'UNL', 67.09, false),
  ('Premium (Discounted)', 'PRM-D', 66.75, true),
  ('Unleaded (Discounted)', 'UNL-D', 65.96, true),
  ('Diesel 3 (Discounted)', 'DSL3-D', 64.50, true);

-- ============================================================================
-- 3. PUMPS
-- ============================================================================
CREATE TABLE public.pumps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pump_number INT NOT NULL UNIQUE,
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. SHIFTS
-- ============================================================================
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  shift_date DATE NOT NULL,
  cashier_id UUID REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shift_date, shift_number)
);

-- ============================================================================
-- 5. DAILY ACCOUNTABILITY REPORT (DAR) - Main header
-- ============================================================================
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_date DATE NOT NULL,
  shift_id UUID NOT NULL REFERENCES public.shifts(id),
  cashier_id UUID REFERENCES public.profiles(id),

  -- Totals (computed but cached for performance)
  total_fuel_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_oil_lubes NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_accessories NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_services NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ar_collections NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_miscellaneous NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_other_income NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_accountability NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Cash summary
  total_cash_deposit NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cash_register NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_checks NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_charge_invoices NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_purchases_disbursements NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Final
  total_remittance NUMERIC(12,2) NOT NULL DEFAULT 0,
  short_over NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(report_date, shift_id)
);

-- ============================================================================
-- 6. FUEL SALES READINGS (per fuel type per report)
-- ============================================================================
CREATE TABLE public.fuel_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  beginning_reading NUMERIC(12,2) NOT NULL DEFAULT 0,
  ending_reading NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross NUMERIC(12,2) GENERATED ALWAYS AS (ending_reading - beginning_reading) STORED,
  less_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_reading NUMERIC(12,2) GENERATED ALWAYS AS (ending_reading - beginning_reading - less_adjustment) STORED,
  price_per_liter NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(daily_report_id, fuel_type_id)
);

-- ============================================================================
-- 7. CUSTOMERS
-- ============================================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company TEXT,
  contact_number TEXT,
  address TEXT,
  credit_limit NUMERIC(12,2) DEFAULT 0,
  current_balance NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. CHARGE INVOICES (A/R - credit sales)
-- ============================================================================
CREATE TABLE public.charge_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  ci_number TEXT,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  fuel_type_id UUID REFERENCES public.fuel_types(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 9. DEPOSITS
-- ============================================================================
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  deposit_number INT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'gcash', 'bank_transfer', 'check', 'other')),
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. CHECKS
-- ============================================================================
CREATE TABLE public.checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  bank TEXT NOT NULL,
  check_date DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_name TEXT,
  check_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. EXPENSES
-- ============================================================================
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  nature TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  receipt_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. PURCHASES / DISBURSEMENTS
-- ============================================================================
CREATE TABLE public.purchases_disbursements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  particulars TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  receipt_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13. OIL/LUBES & ACCESSORIES INVENTORY
-- ============================================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('oil_lubes', 'accessories', 'services', 'miscellaneous')),
  sku TEXT UNIQUE,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_quantity INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 14. PRODUCT SALES (non-fuel sales line items)
-- ============================================================================
CREATE TABLE public.product_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 15. FUEL PRICE HISTORY
-- ============================================================================
CREATE TABLE public.fuel_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  old_price NUMERIC(10,2) NOT NULL,
  new_price NUMERIC(10,2) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  changed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write all tables (internal POS system)
CREATE POLICY "Authenticated users full access" ON public.profiles
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.fuel_types
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.pumps
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.shifts
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.daily_reports
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.fuel_readings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.customers
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.charge_invoices
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.deposits
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.checks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.expenses
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.purchases_disbursements
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.products
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.product_sales
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.fuel_price_history
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_fuel_types_updated_at
  BEFORE UPDATE ON public.fuel_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
