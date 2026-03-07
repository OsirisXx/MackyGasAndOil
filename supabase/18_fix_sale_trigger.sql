-- ============================================================================
-- Fix: Update the sale trigger to update shift_pump_snapshots (not shift_reading_snapshots)
-- ============================================================================

-- Update the trigger function to use the correct table
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
  SET 
    ending_reading = (SELECT current_reading FROM public.pumps WHERE id = NEW.pump_id)
  WHERE 
    pump_id = NEW.pump_id
    AND shift_date = CURRENT_DATE
    AND status = 'open';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Now enable the triggers
ALTER TABLE public.cash_sales ENABLE TRIGGER trigger_update_pump_reading_on_cash_sale;
ALTER TABLE public.purchase_orders ENABLE TRIGGER trigger_update_pump_reading_on_po;
ALTER TABLE public.pump_calibrations ENABLE TRIGGER trigger_update_pump_reading_on_calibration;

-- Verify triggers are now enabled (should show 'O' for origin/enabled)
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname LIKE '%pump%' OR tgname LIKE '%sale%';
