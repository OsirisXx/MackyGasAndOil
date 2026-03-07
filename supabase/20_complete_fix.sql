-- ============================================================================
-- COMPLETE FIX: Triggers, Pump Readings, and Snapshots
-- Run this entire script in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: Drop and recreate triggers (since ENABLE isn't working)
-- ============================================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_cash_sale ON public.cash_sales;
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_po ON public.purchase_orders;
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_calibration ON public.pump_calibrations;

-- Recreate the trigger function (fixed - no updated_at on shift_pump_snapshots)
CREATE OR REPLACE FUNCTION public.update_pump_reading_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the pump's current reading by adding liters sold
  UPDATE public.pumps
  SET 
    current_reading = current_reading + COALESCE(NEW.liters, 0),
    updated_at = now()
  WHERE id = NEW.pump_id;
  
  -- Update the current shift's ending reading in shift_pump_snapshots
  UPDATE public.shift_pump_snapshots
  SET ending_reading = (SELECT current_reading FROM public.pumps WHERE id = NEW.pump_id)
  WHERE pump_id = NEW.pump_id
    AND shift_date = CURRENT_DATE
    AND status = 'open';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers (they will be enabled by default)
CREATE TRIGGER trigger_update_pump_reading_on_cash_sale
  AFTER INSERT ON public.cash_sales
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_sale();

CREATE TRIGGER trigger_update_pump_reading_on_po
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_sale();

CREATE TRIGGER trigger_update_pump_reading_on_calibration
  AFTER INSERT ON public.pump_calibrations
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_calibration();

-- ============================================================================
-- PART 2: Verify triggers are now enabled
-- ============================================================================
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname LIKE '%pump%' OR tgname LIKE '%sale%';

-- ============================================================================
-- PART 3: Calculate and sync pump reading based on actual sales
-- ============================================================================

-- First, check current state
SELECT 
  'PUMP STATE' as info,
  p.pump_name,
  p.initial_reading,
  p.current_reading,
  p.current_reading - p.initial_reading as pump_liters
FROM pumps p
WHERE p.fuel_type = 'Premium' AND (p.category IS NULL OR p.category = 'regular');

-- Calculate total liters from cash_sales for Premium pump today
SELECT 
  'SALES LITERS' as info,
  SUM(cs.liters) as total_sales_liters,
  SUM(cs.amount) as total_sales_amount
FROM cash_sales cs
JOIN pumps p ON cs.pump_id = p.id
WHERE p.fuel_type = 'Premium' 
  AND (p.category IS NULL OR p.category = 'regular')
  AND DATE(cs.created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE;

-- Calculate total calibration liters for Premium pump today
SELECT 
  'CALIBRATION LITERS' as info,
  SUM(pc.liters) as total_calibration_liters
FROM pump_calibrations pc
JOIN pumps p ON pc.pump_id = p.id
WHERE p.fuel_type = 'Premium' 
  AND (p.category IS NULL OR p.category = 'regular')
  AND pc.shift_date = CURRENT_DATE;

-- ============================================================================
-- PART 4: Manually update pump current_reading based on actual data
-- (Uncomment and modify the values after checking the above queries)
-- ============================================================================

-- Get the Premium pump ID and update its current_reading
-- Based on: initial_reading + total_sales_liters + total_calibration_liters
/*
UPDATE pumps
SET current_reading = initial_reading + (
  SELECT COALESCE(SUM(cs.liters), 0)
  FROM cash_sales cs
  WHERE cs.pump_id = pumps.id
    AND DATE(cs.created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
) + (
  SELECT COALESCE(SUM(pc.liters), 0)
  FROM pump_calibrations pc
  WHERE pc.pump_id = pumps.id
    AND pc.shift_date = CURRENT_DATE
)
WHERE fuel_type = 'Premium' AND (category IS NULL OR category = 'regular');
*/

-- ============================================================================
-- PART 5: Update snapshot ending_reading to match pump current_reading
-- ============================================================================
/*
UPDATE shift_pump_snapshots sps
SET ending_reading = p.current_reading
FROM pumps p
WHERE sps.pump_id = p.id
  AND sps.shift_date = CURRENT_DATE
  AND sps.status = 'open';
*/
