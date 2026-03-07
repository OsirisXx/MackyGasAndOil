-- ============================================================================
-- Migration: 10_pump_management.sql
-- Date: 2026-02-27
-- Description: Redesign pump system to be pump-centric instead of fuel-type-centric.
--              Each pump has custom name, fuel type, and price per branch.
--              Shift readings track individual pumps, not fuel types.
-- ============================================================================

-- ============================================================================
-- 1. DROP OLD TABLES (if starting fresh)
-- ============================================================================
-- Uncomment these if you want to completely rebuild:
-- DROP TABLE IF EXISTS public.shift_fuel_readings CASCADE;
-- DROP TABLE IF EXISTS public.pumps CASCADE;
-- Note: Keep fuel_types table as it may be referenced elsewhere

-- ============================================================================
-- 2. NEW PUMPS TABLE (Branch-specific, customizable)
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
  price_per_liter NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Tank linkage (for reconciliation)
  tank_id UUID REFERENCES public.fuel_tanks(id),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique pump number per branch
  UNIQUE(branch_id, pump_number)
);

-- ============================================================================
-- 3. NEW SHIFT PUMP READINGS TABLE (Pump-based tracking)
-- ============================================================================
DROP TABLE IF EXISTS public.shift_pump_readings CASCADE;

CREATE TABLE public.shift_pump_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Shift context
  branch_id UUID REFERENCES public.branches(id),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  
  -- Pump being tracked (instead of fuel_type_id)
  pump_id UUID NOT NULL REFERENCES public.pumps(id) ON DELETE CASCADE,
  
  -- Cashier who recorded this
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Meter readings
  beginning_reading NUMERIC(12,3) NOT NULL DEFAULT 0,
  ending_reading NUMERIC(12,3),
  
  -- Computed values
  liters_dispensed NUMERIC(12,3) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL THEN ending_reading - beginning_reading ELSE 0 END
  ) STORED,
  
  -- Price at time of reading (copied from pump config)
  price_per_liter NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Calculated total value
  total_value NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL 
      THEN (ending_reading - beginning_reading) * price_per_liter 
      ELSE 0 
    END
  ) STORED,
  
  -- Net sales (after adjustments)
  net_liters NUMERIC(12,3) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL 
      THEN (ending_reading - beginning_reading) - COALESCE(adjustment_liters, 0)
      ELSE 0 
    END
  ) STORED,
  
  -- Adjustments (calibration, testing, etc.)
  adjustment_liters NUMERIC(12,3) DEFAULT 0,
  adjustment_reason TEXT,
  
  -- Shift handover tracking
  is_handover BOOLEAN DEFAULT false,
  handover_from_shift_number INT,
  handover_variance NUMERIC(12,3) DEFAULT 0,
  handover_notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  
  -- Ensure one reading per pump per shift
  UNIQUE(branch_id, shift_date, shift_number, pump_id)
);

-- ============================================================================
-- 4. FUEL SALES TABLE (Track which pump dispensed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fuel_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Branch and shift context
  branch_id UUID REFERENCES public.branches(id),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT NOT NULL,
  
  -- Pump that dispensed this sale
  pump_id UUID NOT NULL REFERENCES public.pumps(id),
  
  -- Cashier who recorded
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Sale details
  amount NUMERIC(12,2) NOT NULL,
  liters NUMERIC(12,3) NOT NULL,
  price_per_liter NUMERIC(10,2) NOT NULL,
  
  -- Payment
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'gcash', 'credit_card')),
  
  -- Customer info (optional)
  customer_name TEXT,
  plate_number TEXT,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Link to shift reading
  shift_reading_id UUID REFERENCES public.shift_pump_readings(id)
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
-- Pumps indexes
CREATE INDEX idx_pumps_branch ON public.pumps(branch_id);
CREATE INDEX idx_pumps_active ON public.pumps(is_active);
CREATE INDEX idx_pumps_tank ON public.pumps(tank_id);

-- Shift pump readings indexes
CREATE INDEX idx_shift_pump_readings_branch ON public.shift_pump_readings(branch_id);
CREATE INDEX idx_shift_pump_readings_date ON public.shift_pump_readings(shift_date);
CREATE INDEX idx_shift_pump_readings_shift ON public.shift_pump_readings(shift_number);
CREATE INDEX idx_shift_pump_readings_pump ON public.shift_pump_readings(pump_id);
CREATE INDEX idx_shift_pump_readings_status ON public.shift_pump_readings(status);
CREATE INDEX idx_shift_pump_readings_cashier ON public.shift_pump_readings(cashier_id);

-- Fuel sales indexes
CREATE INDEX idx_fuel_sales_branch ON public.fuel_sales(branch_id);
CREATE INDEX idx_fuel_sales_date ON public.fuel_sales(shift_date);
CREATE INDEX idx_fuel_sales_pump ON public.fuel_sales(pump_id);
CREATE INDEX idx_fuel_sales_cashier ON public.fuel_sales(cashier_id);
CREATE INDEX idx_fuel_sales_shift_reading ON public.fuel_sales(shift_reading_id);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================
ALTER TABLE public.pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_pump_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.pumps
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.shift_pump_readings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.fuel_sales
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_pumps_updated_at
  BEFORE UPDATE ON public.pumps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_shift_pump_readings_updated_at
  BEFORE UPDATE ON public.shift_pump_readings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 8. HELPER FUNCTION: Get Previous Shift Readings for Handover
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_previous_shift_readings(
  p_branch_id UUID,
  p_shift_date DATE,
  p_shift_number INT
)
RETURNS TABLE (
  pump_id UUID,
  pump_name TEXT,
  pump_number INT,
  fuel_type TEXT,
  ending_reading NUMERIC(12,3),
  cashier_name TEXT,
  closed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_previous_shift_number INT;
  v_previous_date DATE;
BEGIN
  -- Determine previous shift
  IF p_shift_number = 1 THEN
    -- Shift 1: Get Shift 3 from previous day
    v_previous_shift_number := 3;
    v_previous_date := p_shift_date - INTERVAL '1 day';
  ELSE
    -- Shift 2 or 3: Get previous shift same day
    v_previous_shift_number := p_shift_number - 1;
    v_previous_date := p_shift_date;
  END IF;
  
  -- Return previous shift's ending readings
  RETURN QUERY
  SELECT 
    spr.pump_id,
    p.pump_name,
    p.pump_number,
    p.fuel_type,
    spr.ending_reading,
    c.full_name as cashier_name,
    spr.closed_at
  FROM public.shift_pump_readings spr
  JOIN public.pumps p ON p.id = spr.pump_id
  LEFT JOIN public.cashiers c ON c.id = spr.cashier_id
  WHERE 
    spr.branch_id = p_branch_id
    AND spr.shift_date = v_previous_date
    AND spr.shift_number = v_previous_shift_number
    AND spr.status = 'closed'
    AND p.is_active = true
  ORDER BY p.pump_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. HELPER FUNCTION: Auto-create Shift Readings with Handover
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_shift_readings_with_handover(
  p_branch_id UUID,
  p_shift_date DATE,
  p_shift_number INT,
  p_cashier_id UUID
)
RETURNS SETOF public.shift_pump_readings AS $$
DECLARE
  v_pump RECORD;
  v_previous_reading RECORD;
  v_new_reading public.shift_pump_readings;
BEGIN
  -- Get all active pumps for the branch
  FOR v_pump IN 
    SELECT * FROM public.pumps 
    WHERE branch_id = p_branch_id AND is_active = true
    ORDER BY pump_number
  LOOP
    -- Try to get previous shift's ending reading
    SELECT * INTO v_previous_reading
    FROM public.get_previous_shift_readings(p_branch_id, p_shift_date, p_shift_number)
    WHERE pump_id = v_pump.id;
    
    -- Insert new shift reading
    INSERT INTO public.shift_pump_readings (
      branch_id,
      shift_date,
      shift_number,
      pump_id,
      cashier_id,
      beginning_reading,
      price_per_liter,
      is_handover,
      handover_from_shift_number,
      status
    ) VALUES (
      p_branch_id,
      p_shift_date,
      p_shift_number,
      v_pump.id,
      p_cashier_id,
      COALESCE(v_previous_reading.ending_reading, 0),
      v_pump.price_per_liter,
      v_previous_reading.ending_reading IS NOT NULL,
      CASE WHEN v_previous_reading.ending_reading IS NOT NULL 
        THEN (CASE WHEN p_shift_number = 1 THEN 3 ELSE p_shift_number - 1 END)
        ELSE NULL 
      END,
      'open'
    )
    RETURNING * INTO v_new_reading;
    
    RETURN NEXT v_new_reading;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. SAMPLE DATA (Optional - for testing)
-- ============================================================================
-- Uncomment to insert sample pumps for testing

/*
-- Get first branch ID
DO $$
DECLARE
  v_branch_id UUID;
  v_tank_diesel UUID;
  v_tank_premium UUID;
  v_tank_unleaded UUID;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches LIMIT 1;
  
  -- Get tank IDs (if fuel_tanks table exists)
  SELECT id INTO v_tank_diesel FROM public.fuel_tanks WHERE fuel_type_id IN (SELECT id FROM public.fuel_types WHERE short_code = 'DSL') LIMIT 1;
  SELECT id INTO v_tank_premium FROM public.fuel_tanks WHERE fuel_type_id IN (SELECT id FROM public.fuel_types WHERE short_code = 'PRM') LIMIT 1;
  SELECT id INTO v_tank_unleaded FROM public.fuel_tanks WHERE fuel_type_id IN (SELECT id FROM public.fuel_types WHERE short_code = 'UNL') LIMIT 1;
  
  -- Insert sample pumps
  INSERT INTO public.pumps (branch_id, pump_number, pump_name, fuel_type, price_per_liter, tank_id) VALUES
    (v_branch_id, 1, 'Pump 1 - Diesel Regular', 'Diesel', 64.50, v_tank_diesel),
    (v_branch_id, 2, 'Pump 2 - Diesel Regular', 'Diesel', 64.50, v_tank_diesel),
    (v_branch_id, 3, 'Pump 3 - Premium 95', 'Premium', 68.75, v_tank_premium),
    (v_branch_id, 4, 'Pump 4 - Premium 95', 'Premium', 68.75, v_tank_premium),
    (v_branch_id, 5, 'Pump 5 - Unleaded 91', 'Unleaded', 67.09, v_tank_unleaded),
    (v_branch_id, 6, 'Pump 6 - Unleaded 91', 'Unleaded', 67.09, v_tank_unleaded);
END $$;
*/
