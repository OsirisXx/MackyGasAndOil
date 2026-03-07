-- ============================================================================
-- Migration: 14_continuous_pump_tracking.sql
-- Date: 2026-03-04
-- Description: Implement continuous pump reading tracking system.
--              - Add current_reading to pumps table
--              - Auto-update reading when sales are made
--              - Shift snapshots for accountability
--              - Admin-only reading management
-- ============================================================================

-- ============================================================================
-- 1. ADD CURRENT_READING TO PUMPS TABLE
-- ============================================================================
ALTER TABLE public.pumps
ADD COLUMN IF NOT EXISTS current_reading NUMERIC(12,3) DEFAULT 0;

ALTER TABLE public.pumps
ADD COLUMN IF NOT EXISTS initial_reading NUMERIC(12,3) DEFAULT 0;

ALTER TABLE public.pumps
ADD COLUMN IF NOT EXISTS reading_initialized_at TIMESTAMPTZ;

ALTER TABLE public.pumps
ADD COLUMN IF NOT EXISTS reading_initialized_by UUID REFERENCES auth.users(id);

-- Add index for quick reading lookups
CREATE INDEX IF NOT EXISTS idx_pumps_current_reading ON public.pumps(current_reading);

-- ============================================================================
-- 2. SHIFT READING SNAPSHOTS TABLE (for accountability tracking per shift)
-- ============================================================================
-- This captures the reading at the START and END of each shift
CREATE TABLE IF NOT EXISTS public.shift_reading_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Shift context
  branch_id UUID REFERENCES public.branches(id),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  
  -- Pump being tracked
  pump_id UUID NOT NULL REFERENCES public.pumps(id) ON DELETE CASCADE,
  
  -- Snapshot readings
  beginning_reading NUMERIC(12,3) NOT NULL,
  ending_reading NUMERIC(12,3),
  
  -- Price at time of snapshot (for accountability calculation)
  price_per_liter NUMERIC(10,2) NOT NULL,
  
  -- Computed values (auto-calculated)
  liters_sold NUMERIC(12,3) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL 
      THEN ending_reading - beginning_reading 
      ELSE 0 
    END
  ) STORED,
  
  total_value NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL 
      THEN (ending_reading - beginning_reading) * price_per_liter 
      ELSE 0 
    END
  ) STORED,
  
  -- Adjustments (calibration, testing, spillage, etc.)
  adjustment_liters NUMERIC(12,3) DEFAULT 0,
  adjustment_reason TEXT,
  
  -- Net after adjustments
  net_liters NUMERIC(12,3) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL 
      THEN (ending_reading - beginning_reading) - COALESCE(adjustment_liters, 0)
      ELSE 0 
    END
  ) STORED,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  
  -- Who started/closed the shift
  started_by UUID REFERENCES public.cashiers(id),
  closed_by UUID REFERENCES public.cashiers(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  
  -- Ensure one snapshot per pump per shift
  UNIQUE(branch_id, shift_date, shift_number, pump_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_branch ON public.shift_reading_snapshots(branch_id);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_date ON public.shift_reading_snapshots(shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_shift ON public.shift_reading_snapshots(shift_number);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_pump ON public.shift_reading_snapshots(pump_id);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_status ON public.shift_reading_snapshots(status);

-- ============================================================================
-- 3. TRIGGER: AUTO-UPDATE PUMP READING ON CASH SALE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_pump_reading_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the pump's current reading by adding liters sold
  UPDATE public.pumps
  SET 
    current_reading = current_reading + COALESCE(NEW.liters, 0),
    updated_at = now()
  WHERE id = NEW.pump_id;
  
  -- Also update the current shift's ending reading if exists
  UPDATE public.shift_reading_snapshots
  SET 
    ending_reading = (SELECT current_reading FROM public.pumps WHERE id = NEW.pump_id),
    updated_at = now()
  WHERE 
    pump_id = NEW.pump_id
    AND shift_date = CURRENT_DATE
    AND status = 'open';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_cash_sale ON public.cash_sales;

-- Create trigger on cash_sales
CREATE TRIGGER trigger_update_pump_reading_on_cash_sale
  AFTER INSERT ON public.cash_sales
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_sale();

-- ============================================================================
-- 4. TRIGGER: AUTO-UPDATE PUMP READING ON PURCHASE ORDER (PO/Charge)
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_po ON public.purchase_orders;

CREATE TRIGGER trigger_update_pump_reading_on_po
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_sale();

-- ============================================================================
-- 5. FUNCTION: Initialize Pump Reading (Admin only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.initialize_pump_reading(
  p_pump_id UUID,
  p_initial_reading NUMERIC(12,3),
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS public.pumps AS $$
DECLARE
  v_pump public.pumps;
BEGIN
  UPDATE public.pumps
  SET 
    initial_reading = p_initial_reading,
    current_reading = p_initial_reading,
    reading_initialized_at = now(),
    reading_initialized_by = p_admin_user_id,
    updated_at = now()
  WHERE id = p_pump_id
  RETURNING * INTO v_pump;
  
  RETURN v_pump;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNCTION: Start Shift (Create snapshot with current reading as beginning)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_shift_tracking(
  p_branch_id UUID,
  p_shift_date DATE,
  p_shift_number INT,
  p_cashier_id UUID DEFAULT NULL
)
RETURNS SETOF public.shift_reading_snapshots AS $$
DECLARE
  v_pump RECORD;
  v_snapshot public.shift_reading_snapshots;
BEGIN
  -- For each active pump in the branch, create a shift snapshot
  FOR v_pump IN 
    SELECT * FROM public.pumps 
    WHERE branch_id = p_branch_id 
      AND is_active = true
      AND current_reading > 0  -- Only pumps with initialized readings
    ORDER BY pump_number
  LOOP
    -- Insert or update snapshot
    INSERT INTO public.shift_reading_snapshots (
      branch_id,
      shift_date,
      shift_number,
      pump_id,
      beginning_reading,
      ending_reading,
      price_per_liter,
      started_by,
      status
    ) VALUES (
      p_branch_id,
      p_shift_date,
      p_shift_number,
      v_pump.id,
      v_pump.current_reading,
      v_pump.current_reading,  -- Start with same as beginning
      v_pump.price_per_liter,
      p_cashier_id,
      'open'
    )
    ON CONFLICT (branch_id, shift_date, shift_number, pump_id) 
    DO NOTHING  -- Don't overwrite if already exists
    RETURNING * INTO v_snapshot;
    
    IF v_snapshot IS NOT NULL THEN
      RETURN NEXT v_snapshot;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNCTION: Close Shift (Finalize snapshot with current reading as ending)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.close_shift_tracking(
  p_branch_id UUID,
  p_shift_date DATE,
  p_shift_number INT,
  p_cashier_id UUID DEFAULT NULL
)
RETURNS SETOF public.shift_reading_snapshots AS $$
DECLARE
  v_snapshot RECORD;
  v_updated public.shift_reading_snapshots;
BEGIN
  -- Update all open snapshots for this shift with current pump readings
  FOR v_snapshot IN 
    SELECT srs.*, p.current_reading as pump_current_reading
    FROM public.shift_reading_snapshots srs
    JOIN public.pumps p ON p.id = srs.pump_id
    WHERE srs.branch_id = p_branch_id
      AND srs.shift_date = p_shift_date
      AND srs.shift_number = p_shift_number
      AND srs.status = 'open'
  LOOP
    UPDATE public.shift_reading_snapshots
    SET 
      ending_reading = v_snapshot.pump_current_reading,
      closed_by = p_cashier_id,
      closed_at = now(),
      status = 'closed',
      updated_at = now()
    WHERE id = v_snapshot.id
    RETURNING * INTO v_updated;
    
    RETURN NEXT v_updated;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNCTION: Adjust Pump Reading (Admin only - for corrections)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.adjust_pump_reading(
  p_pump_id UUID,
  p_new_reading NUMERIC(12,3),
  p_reason TEXT DEFAULT NULL
)
RETURNS public.pumps AS $$
DECLARE
  v_pump public.pumps;
  v_old_reading NUMERIC(12,3);
BEGIN
  -- Get old reading for audit
  SELECT current_reading INTO v_old_reading FROM public.pumps WHERE id = p_pump_id;
  
  -- Update pump reading
  UPDATE public.pumps
  SET 
    current_reading = p_new_reading,
    updated_at = now()
  WHERE id = p_pump_id
  RETURNING * INTO v_pump;
  
  -- Also update any open shift snapshot
  UPDATE public.shift_reading_snapshots
  SET 
    ending_reading = p_new_reading,
    adjustment_liters = COALESCE(adjustment_liters, 0) + (p_new_reading - v_old_reading),
    adjustment_reason = COALESCE(adjustment_reason || '; ', '') || COALESCE(p_reason, 'Manual adjustment'),
    updated_at = now()
  WHERE 
    pump_id = p_pump_id
    AND shift_date = CURRENT_DATE
    AND status = 'open';
  
  RETURN v_pump;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================
ALTER TABLE public.shift_reading_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access snapshots" ON public.shift_reading_snapshots
  FOR ALL USING (auth.role() = 'authenticated');

-- Anon can read (for POS display)
CREATE POLICY "Anon can read snapshots" ON public.shift_reading_snapshots
  FOR SELECT USING (true);

-- ============================================================================
-- 10. UPDATE PUMPS RLS - Allow anon to read pumps
-- ============================================================================
DROP POLICY IF EXISTS "Anon can read pumps" ON public.pumps;
CREATE POLICY "Anon can read pumps" ON public.pumps
  FOR SELECT USING (true);

-- ============================================================================
-- 11. UPDATED_AT TRIGGER FOR SNAPSHOTS
-- ============================================================================
DROP TRIGGER IF EXISTS update_shift_snapshots_updated_at ON public.shift_reading_snapshots;
CREATE TRIGGER update_shift_snapshots_updated_at
  BEFORE UPDATE ON public.shift_reading_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 12. VIEW: Current Pump Status (for easy querying)
-- ============================================================================
CREATE OR REPLACE VIEW public.pump_status AS
SELECT 
  p.id,
  p.branch_id,
  b.name as branch_name,
  p.pump_number,
  p.pump_name,
  p.fuel_type,
  p.category,
  p.price_per_liter,
  p.initial_reading,
  p.current_reading,
  p.current_reading - p.initial_reading as total_liters_sold,
  (p.current_reading - p.initial_reading) * p.price_per_liter as total_value,
  p.reading_initialized_at,
  p.is_active,
  -- Current shift info
  srs.shift_date as current_shift_date,
  srs.shift_number as current_shift_number,
  srs.beginning_reading as shift_beginning,
  srs.ending_reading as shift_ending,
  srs.liters_sold as shift_liters,
  srs.total_value as shift_value,
  srs.status as shift_status
FROM public.pumps p
LEFT JOIN public.branches b ON b.id = p.branch_id
LEFT JOIN public.shift_reading_snapshots srs ON srs.pump_id = p.id 
  AND srs.shift_date = CURRENT_DATE 
  AND srs.status = 'open'
WHERE p.is_active = true;

-- Grant access to view
GRANT SELECT ON public.pump_status TO anon;
GRANT SELECT ON public.pump_status TO authenticated;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- After running this migration:
-- 
-- 1. ADMIN: Initialize pump readings
--    SELECT * FROM initialize_pump_reading('pump-uuid', 12345.678);
--
-- 2. CASHIER: Start shift (auto-creates snapshots)
--    SELECT * FROM start_shift_tracking('branch-uuid', '2026-03-04', 1, 'cashier-uuid');
--
-- 3. SALES: Automatically update readings via triggers
--    INSERT INTO cash_sales (...) -- triggers update_pump_reading_on_sale()
--
-- 4. CASHIER: Close shift (finalizes snapshots)
--    SELECT * FROM close_shift_tracking('branch-uuid', '2026-03-04', 1, 'cashier-uuid');
--
-- 5. ADMIN: Adjust reading if needed
--    SELECT * FROM adjust_pump_reading('pump-uuid', 12400.000, 'Meter calibration');
--
-- 6. ACCOUNTABILITY: Query shift_reading_snapshots for reports
--    SELECT * FROM shift_reading_snapshots WHERE shift_date = '2026-03-04' AND shift_number = 1;
