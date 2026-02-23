-- Cash Deposits Table
-- Tracks cash deposits made by cashiers to the vault

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cash_deposits_branch ON public.cash_deposits(branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_cashier ON public.cash_deposits(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_date ON public.cash_deposits(deposit_date);

-- RLS Policies
ALTER TABLE public.cash_deposits ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view cash deposits
CREATE POLICY "Users can view cash deposits"
  ON public.cash_deposits
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow cashiers to insert their own deposits
CREATE POLICY "Cashiers can insert deposits"
  ON public.cash_deposits
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admins can update or delete deposits
CREATE POLICY "Admins can update deposits"
  ON public.cash_deposits
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete deposits"
  ON public.cash_deposits
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_cash_deposits_updated_at
  BEFORE UPDATE ON public.cash_deposits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.cash_deposits IS 'Tracks cash deposits made by cashiers to the vault';
COMMENT ON COLUMN public.cash_deposits.amount IS 'Amount deposited in PHP';
COMMENT ON COLUMN public.cash_deposits.deposit_date IS 'Date and time of the deposit';
COMMENT ON COLUMN public.cash_deposits.notes IS 'Optional notes about the deposit';
