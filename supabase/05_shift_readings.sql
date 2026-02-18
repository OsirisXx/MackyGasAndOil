-- ============================================================================
-- Migration: 05_shift_readings.sql
-- Date: 2026-02-16
-- Description: Create shift_fuel_readings table to track beginning/end meter
--              readings per shift per pump/fuel type. This allows tracking
--              fuel dispensed across multiple shifts per day.
-- ============================================================================

-- ============================================================================
-- 1. SHIFT FUEL READINGS TABLE
-- ============================================================================
CREATE TABLE public.shift_fuel_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Shift context
  branch_id UUID REFERENCES public.branches(id),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  
  -- Cashier who recorded this
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Fuel type being tracked
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  
  -- Meter readings
  beginning_reading NUMERIC(12,3) NOT NULL DEFAULT 0,
  ending_reading NUMERIC(12,3),
  
  -- Computed values
  liters_dispensed NUMERIC(12,3) GENERATED ALWAYS AS (
    CASE WHEN ending_reading IS NOT NULL THEN ending_reading - beginning_reading ELSE 0 END
  ) STORED,
  
  -- Price at time of reading (for calculating sales value)
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
  
  -- Ensure one reading per fuel type per shift
  UNIQUE(branch_id, shift_date, shift_number, fuel_type_id)
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
CREATE INDEX idx_shift_readings_branch ON public.shift_fuel_readings(branch_id);
CREATE INDEX idx_shift_readings_date ON public.shift_fuel_readings(shift_date);
CREATE INDEX idx_shift_readings_shift ON public.shift_fuel_readings(shift_number);
CREATE INDEX idx_shift_readings_fuel ON public.shift_fuel_readings(fuel_type_id);
CREATE INDEX idx_shift_readings_status ON public.shift_fuel_readings(status);

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================
ALTER TABLE public.shift_fuel_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.shift_fuel_readings
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================================
CREATE TRIGGER update_shift_readings_updated_at
  BEFORE UPDATE ON public.shift_fuel_readings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
