-- Update shift_fuel_readings to always use current fuel price instead of storing it
-- This ensures shift readings always reflect the latest price from fuel management

-- Drop the generated columns first
ALTER TABLE shift_fuel_readings 
DROP COLUMN IF EXISTS liters_dispensed,
DROP COLUMN IF EXISTS total_value,
DROP COLUMN IF EXISTS price_per_liter;

-- Recreate liters_dispensed as a generated column (this stays the same)
ALTER TABLE shift_fuel_readings
ADD COLUMN liters_dispensed NUMERIC(12,3) GENERATED ALWAYS AS (
  CASE WHEN ending_reading IS NOT NULL 
    THEN ending_reading - beginning_reading 
    ELSE 0 
  END
) STORED;

-- Note: total_value will now be calculated in the application using current fuel price
-- This ensures it always uses the price set in Fuel Management
