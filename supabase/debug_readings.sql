-- Debug: Compare pump current_reading vs snapshot ending_reading
SELECT 
  p.pump_name,
  p.fuel_type,
  p.initial_reading,
  p.current_reading as pump_current,
  sps.beginning_reading as snapshot_begin,
  sps.ending_reading as snapshot_ending,
  sps.ending_reading - sps.beginning_reading as snapshot_liters,
  sps.shift_number,
  sps.status
FROM pumps p
LEFT JOIN shift_pump_snapshots sps ON p.id = sps.pump_id 
  AND sps.shift_date = CURRENT_DATE
WHERE p.fuel_type = 'Premium' AND (p.category IS NULL OR p.category = 'regular')
ORDER BY sps.shift_number;

-- Also check total calibration liters for today
SELECT SUM(liters) as total_calibration_liters, SUM(amount) as total_calibration_amount
FROM pump_calibrations
WHERE shift_date = CURRENT_DATE;
