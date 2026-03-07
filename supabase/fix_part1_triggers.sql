-- ============================================================================
-- PART 1: Drop and recreate triggers
-- Run this first
-- ============================================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_cash_sale ON public.cash_sales;
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_po ON public.purchase_orders;
DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_calibration ON public.pump_calibrations;

-- Recreate the trigger function
CREATE OR REPLACE FUNCTION public.update_pump_reading_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pumps
  SET 
    current_reading = current_reading + COALESCE(NEW.liters, 0),
    updated_at = now()
  WHERE id = NEW.pump_id;
  
  UPDATE public.shift_pump_snapshots
  SET ending_reading = (SELECT current_reading FROM public.pumps WHERE id = NEW.pump_id)
  WHERE pump_id = NEW.pump_id
    AND shift_date = CURRENT_DATE
    AND status = 'open';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate triggers
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
