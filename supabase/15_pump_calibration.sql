-- ============================================================================
-- Migration: 15_pump_calibration.sql
-- Description: Add pump calibration tracking
--              Calibration = fuel dispensed for testing (not a sale)
--              - Adds to pump reading (like a sale)
--              - Deducted from accountability (not paid)
-- ============================================================================

-- ============================================================================
-- 1. PUMP CALIBRATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pump_calibrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Context
  branch_id UUID REFERENCES public.branches(id),
  pump_id UUID NOT NULL REFERENCES public.pumps(id) ON DELETE CASCADE,
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Shift info
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  
  -- Calibration details
  liters NUMERIC(10,3) NOT NULL,
  price_per_liter NUMERIC(10,2) NOT NULL,
  amount NUMERIC(12,2) GENERATED ALWAYS AS (liters * price_per_liter) STORED,
  
  -- Reason/notes
  reason TEXT DEFAULT 'Calibration',
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT positive_liters CHECK (liters > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calibrations_branch ON public.pump_calibrations(branch_id);
CREATE INDEX IF NOT EXISTS idx_calibrations_pump ON public.pump_calibrations(pump_id);
CREATE INDEX IF NOT EXISTS idx_calibrations_date ON public.pump_calibrations(shift_date);
CREATE INDEX IF NOT EXISTS idx_calibrations_shift ON public.pump_calibrations(shift_number);
CREATE INDEX IF NOT EXISTS idx_calibrations_created ON public.pump_calibrations(created_at);

-- ============================================================================
-- 2. TRIGGER: Update pump reading on calibration (same as sale)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_pump_reading_on_calibration()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the pump's current reading by adding liters (same as a sale)
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
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_calibration ON public.pump_calibrations;

-- Create trigger
CREATE TRIGGER trigger_update_pump_reading_on_calibration
  AFTER INSERT ON public.pump_calibrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pump_reading_on_calibration();

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================
ALTER TABLE public.pump_calibrations ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access calibrations" ON public.pump_calibrations
  FOR ALL USING (auth.role() = 'authenticated');

-- Anon can insert (cashier records calibration)
CREATE POLICY "Anon can insert calibrations" ON public.pump_calibrations
  FOR INSERT WITH CHECK (true);

-- Anon can read
CREATE POLICY "Anon can read calibrations" ON public.pump_calibrations
  FOR SELECT USING (true);

-- ============================================================================
-- NOTES:
-- ============================================================================
-- Calibration flow:
-- 1. Cashier records calibration (e.g., 10 liters for testing)
-- 2. Trigger adds 10 liters to pump's current_reading
-- 3. Accountability shows:
--    - Pump reading increased by 10 liters (correct)
--    - Calibration deduction of 10 liters × price (no cash received)
--    - Net effect: reading matches physical pump, cash matches actual sales
