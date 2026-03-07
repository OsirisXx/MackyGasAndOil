-- ============================================================================
-- CLEAN DATABASE & SETUP PUMP SYSTEM
-- Run this to reset and properly configure the pump-centric system
-- ============================================================================

-- ============================================================================
-- 1. CLEAN UP OLD PUMP DATA
-- ============================================================================
-- Delete all existing pump-related data
DELETE FROM public.shift_pump_readings;
DELETE FROM public.pumps;

-- ============================================================================
-- 2. DROP AND RECREATE PUMPS TABLE WITH ALL COLUMNS
-- ============================================================================
DROP TABLE IF EXISTS public.pumps CASCADE;

CREATE TABLE public.pumps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Branch association
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  
  -- Pump identification
  pump_number INT NOT NULL,
  pump_name TEXT NOT NULL,
  
  -- Fuel configuration (custom per pump)
  fuel_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'regular' CHECK (category IN ('regular', 'discounted')),
  price_per_liter NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Tank linkage (for reconciliation)
  tank_id UUID REFERENCES public.fuel_tanks(id),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  
  -- No unique constraint on pump_number to allow P1, P2, D1, D2, D3 naming system
  -- Multiple pumps can have the same number as long as they're different fuel types
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pumps_branch ON public.pumps(branch_id);
CREATE INDEX IF NOT EXISTS idx_pumps_category ON public.pumps(category);
CREATE INDEX IF NOT EXISTS idx_pumps_active ON public.pumps(is_active);

-- ============================================================================
-- 3. RECREATE SHIFT_PUMP_READINGS TABLE
-- ============================================================================
DROP TABLE IF EXISTS public.shift_pump_readings CASCADE;

CREATE TABLE public.shift_pump_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Shift context
  branch_id UUID REFERENCES public.branches(id),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  
  -- Cashier who recorded this
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Pump being tracked
  pump_id UUID NOT NULL REFERENCES public.pumps(id),
  
  -- Meter readings
  beginning_reading NUMERIC(12,3) NOT NULL DEFAULT 0,
  ending_reading NUMERIC(12,3),
  
  -- Computed values
  liters_dispensed NUMERIC(12,3) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL THEN ending_reading - beginning_reading ELSE 0 END
  ) STORED,
  
  -- Price at time of reading
  price_per_liter NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Calculated total value
  total_value NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL 
      THEN (ending_reading - beginning_reading) * price_per_liter 
      ELSE 0 
    END
  ) STORED,
  
  -- Adjustments (calibration, testing, etc.)
  adjustment_liters NUMERIC(12,3) DEFAULT 0,
  adjustment_reason TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  
  -- Ensure one reading per pump per shift
  UNIQUE(branch_id, shift_date, shift_number, pump_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_shift_pump_readings_pump ON public.shift_pump_readings(pump_id);
CREATE INDEX IF NOT EXISTS idx_shift_pump_readings_shift ON public.shift_pump_readings(shift_date, shift_number);
CREATE INDEX IF NOT EXISTS idx_shift_pump_readings_status ON public.shift_pump_readings(status);

-- ============================================================================
-- 4. ADD PUMP_ID TO CASH_SALES AND PURCHASE_ORDERS
-- ============================================================================
-- Add pump_id column if it doesn't exist
ALTER TABLE public.cash_sales
ADD COLUMN IF NOT EXISTS pump_id UUID REFERENCES public.pumps(id);

ALTER TABLE public.purchase_orders
ADD COLUMN IF NOT EXISTS pump_id UUID REFERENCES public.pumps(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cash_sales_pump ON public.cash_sales(pump_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_pump ON public.purchase_orders(pump_id);

-- ============================================================================
-- 5. ENABLE RLS POLICIES
-- ============================================================================
ALTER TABLE public.pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_pump_readings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON public.pumps;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.pumps;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.pumps;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.pumps;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.shift_pump_readings;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.shift_pump_readings;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.shift_pump_readings;

-- Create new policies
CREATE POLICY "Enable read access for all users" ON public.pumps FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.pumps FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.pumps FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users" ON public.pumps FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.shift_pump_readings FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.shift_pump_readings FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.shift_pump_readings FOR UPDATE USING (true);

-- ============================================================================
-- 6. CREATE HELPER FUNCTION FOR SHIFT HANDOVER
-- ============================================================================
-- Drop existing function first
DROP FUNCTION IF EXISTS get_previous_shift_readings(UUID, DATE, INT);

CREATE OR REPLACE FUNCTION get_previous_shift_readings(
  p_branch_id UUID,
  p_shift_date DATE,
  p_shift_number INT
)
RETURNS TABLE (
  pump_id UUID,
  pump_name TEXT,
  previous_ending_reading NUMERIC(12,3),
  previous_shift_number INT,
  previous_cashier_name TEXT
) AS $$
BEGIN
  -- Get the previous shift's ending readings
  RETURN QUERY
  SELECT 
    spr.pump_id,
    p.pump_name,
    spr.ending_reading,
    spr.shift_number,
    c.full_name
  FROM shift_pump_readings spr
  JOIN pumps p ON p.id = spr.pump_id
  LEFT JOIN cashiers c ON c.id = spr.cashier_id
  WHERE spr.branch_id = p_branch_id
    AND spr.status = 'closed'
    AND (
      -- Same day, previous shift
      (spr.shift_date = p_shift_date AND spr.shift_number = p_shift_number - 1)
      OR
      -- Previous day, last shift (if current is shift 1)
      (p_shift_number = 1 AND spr.shift_date = p_shift_date - INTERVAL '1 day' AND spr.shift_number = 3)
    )
  ORDER BY spr.shift_date DESC, spr.shift_number DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DONE!
-- ============================================================================
-- Your database is now clean and ready for the pump-centric system.
-- You can now add pumps via the Pump Management page.
