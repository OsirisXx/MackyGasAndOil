-- ============================================================================
-- Migration: 09_fuel_deliveries_inventory.sql
-- Date: 2026-02-27
-- Description: Create tables for fuel deliveries, tank inventory tracking,
--              and reconciliation to manage tank refills and variance tracking
-- ============================================================================

-- ============================================================================
-- 1. FUEL TANKS TABLE
-- ============================================================================
CREATE TABLE public.fuel_tanks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Tank identification
  tank_number INT NOT NULL,
  tank_name TEXT NOT NULL,
  
  -- Fuel type stored in this tank
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  
  -- Tank specifications
  capacity_liters NUMERIC(12,2) NOT NULL,
  
  -- Branch association
  branch_id UUID REFERENCES public.branches(id),
  
  -- Variance thresholds for reconciliation
  allowable_variance_qty NUMERIC(12,2) DEFAULT 20,
  allowable_variance_percentage NUMERIC(5,2) DEFAULT 0.5,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure unique tank numbers per branch
  UNIQUE(branch_id, tank_number)
);

-- ============================================================================
-- 2. FUEL DELIVERIES TABLE
-- ============================================================================
CREATE TABLE public.fuel_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Delivery identification
  delivery_number TEXT,
  waybill_number TEXT,
  delivery_ticket_number TEXT,
  
  -- Tank and fuel type
  tank_id UUID NOT NULL REFERENCES public.fuel_tanks(id),
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  
  -- Branch
  branch_id UUID REFERENCES public.branches(id),
  
  -- Supplier information
  supplier_name TEXT NOT NULL,
  truck_number TEXT,
  driver_name TEXT,
  
  -- Delivery date and time
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_time TIME,
  
  -- Tank dip readings (in liters)
  opening_dip_reading NUMERIC(12,3) NOT NULL,
  closing_dip_reading NUMERIC(12,3) NOT NULL,
  
  -- Calculated actual received
  actual_received NUMERIC(12,3) GENERATED ALWAYS AS (closing_dip_reading - opening_dip_reading) STORED,
  
  -- Waybill/expected quantity
  waybill_quantity NUMERIC(12,3) NOT NULL,
  
  -- Variance
  variance_liters NUMERIC(12,3) GENERATED ALWAYS AS (
    (closing_dip_reading - opening_dip_reading) - waybill_quantity
  ) STORED,
  
  variance_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN waybill_quantity > 0 THEN 
        (((closing_dip_reading - opening_dip_reading) - waybill_quantity) / waybill_quantity) * 100
      ELSE 0
    END
  ) STORED,
  
  -- Temperature (affects volume)
  temperature_celsius NUMERIC(5,2),
  
  -- Cost information
  cost_per_liter NUMERIC(10,2),
  total_cost NUMERIC(12,2),
  
  -- Who recorded this
  recorded_by UUID REFERENCES public.profiles(id),
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Notes
  notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'flagged')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. DAILY TANK INVENTORY TABLE
-- ============================================================================
CREATE TABLE public.daily_tank_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Tank reference
  tank_id UUID NOT NULL REFERENCES public.fuel_tanks(id),
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  
  -- Branch
  branch_id UUID REFERENCES public.branches(id),
  
  -- Date
  inventory_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Opening and closing dip readings
  opening_dip NUMERIC(12,3) NOT NULL,
  closing_dip NUMERIC(12,3) NOT NULL,
  
  -- Deliveries received during the day
  total_deliveries NUMERIC(12,3) DEFAULT 0,
  
  -- Expected inventory
  expected_closing_inventory NUMERIC(12,3) GENERATED ALWAYS AS (
    opening_dip + total_deliveries
  ) STORED,
  
  -- Who recorded this
  recorded_by UUID REFERENCES public.profiles(id),
  cashier_id UUID REFERENCES public.cashiers(id),
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One inventory record per tank per day
  UNIQUE(tank_id, inventory_date)
);

-- ============================================================================
-- 4. FUEL RECONCILIATION TABLE
-- ============================================================================
CREATE TABLE public.fuel_reconciliation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Reconciliation period
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Tank and fuel type
  tank_id UUID NOT NULL REFERENCES public.fuel_tanks(id),
  fuel_type_id UUID NOT NULL REFERENCES public.fuel_types(id),
  
  -- Branch
  branch_id UUID REFERENCES public.branches(id),
  
  -- Tank-based calculation (wet stock)
  opening_tank_inventory NUMERIC(12,3) NOT NULL,
  total_deliveries NUMERIC(12,3) DEFAULT 0,
  closing_tank_inventory NUMERIC(12,3) NOT NULL,
  
  -- Expected fuel sold (from tank perspective)
  expected_fuel_sold NUMERIC(12,3) GENERATED ALWAYS AS (
    opening_tank_inventory + total_deliveries - closing_tank_inventory
  ) STORED,
  
  -- Pump-based calculation
  total_pump_sales NUMERIC(12,3) DEFAULT 0,
  total_adjustments NUMERIC(12,3) DEFAULT 0,
  
  -- Net pump sales
  net_pump_sales NUMERIC(12,3) GENERATED ALWAYS AS (
    total_pump_sales - total_adjustments
  ) STORED,
  
  -- Variance (difference between tank and pump)
  variance_liters NUMERIC(12,3) GENERATED ALWAYS AS (
    (opening_tank_inventory + total_deliveries - closing_tank_inventory) - (total_pump_sales - total_adjustments)
  ) STORED,
  
  variance_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN (total_pump_sales - total_adjustments) > 0 THEN
        (((opening_tank_inventory + total_deliveries - closing_tank_inventory) - (total_pump_sales - total_adjustments)) / (total_pump_sales - total_adjustments)) * 100
      ELSE 0
    END
  ) STORED,
  
  -- Variance status
  is_within_threshold BOOLEAN,
  
  -- Investigation notes
  investigation_notes TEXT,
  
  -- Who performed reconciliation
  reconciled_by UUID REFERENCES public.profiles(id),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One reconciliation per tank per day
  UNIQUE(tank_id, reconciliation_date)
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
CREATE INDEX idx_fuel_tanks_branch ON public.fuel_tanks(branch_id);
CREATE INDEX idx_fuel_tanks_fuel_type ON public.fuel_tanks(fuel_type_id);

CREATE INDEX idx_fuel_deliveries_branch ON public.fuel_deliveries(branch_id);
CREATE INDEX idx_fuel_deliveries_tank ON public.fuel_deliveries(tank_id);
CREATE INDEX idx_fuel_deliveries_date ON public.fuel_deliveries(delivery_date);
CREATE INDEX idx_fuel_deliveries_status ON public.fuel_deliveries(status);

CREATE INDEX idx_daily_tank_inventory_tank ON public.daily_tank_inventory(tank_id);
CREATE INDEX idx_daily_tank_inventory_date ON public.daily_tank_inventory(inventory_date);

CREATE INDEX idx_fuel_reconciliation_tank ON public.fuel_reconciliation(tank_id);
CREATE INDEX idx_fuel_reconciliation_date ON public.fuel_reconciliation(reconciliation_date);
CREATE INDEX idx_fuel_reconciliation_status ON public.fuel_reconciliation(status);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================
ALTER TABLE public.fuel_tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tank_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.fuel_tanks
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.fuel_deliveries
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.daily_tank_inventory
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON public.fuel_reconciliation
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_fuel_tanks_updated_at
  BEFORE UPDATE ON public.fuel_tanks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_fuel_deliveries_updated_at
  BEFORE UPDATE ON public.fuel_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_daily_tank_inventory_updated_at
  BEFORE UPDATE ON public.daily_tank_inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_fuel_reconciliation_updated_at
  BEFORE UPDATE ON public.fuel_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
