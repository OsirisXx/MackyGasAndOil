-- ============================================================================
-- Fix: Enable the disabled triggers for pump reading updates
-- ============================================================================

-- Enable trigger on cash_sales
ALTER TABLE public.cash_sales ENABLE TRIGGER trigger_update_pump_reading_on_cash_sale;

-- Enable trigger on purchase_orders
ALTER TABLE public.purchase_orders ENABLE TRIGGER trigger_update_pump_reading_on_po;

-- Enable trigger on pump_calibrations
ALTER TABLE public.pump_calibrations ENABLE TRIGGER trigger_update_pump_reading_on_calibration;

-- Verify triggers are now enabled (should show 'O' for origin/enabled)
SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname LIKE '%pump%' OR tgname LIKE '%sale%';

-- Now manually update the pump reading and snapshot to reflect actual sales
-- First, calculate what the current_reading should be based on actual sales
-- Then update both pump and snapshot
