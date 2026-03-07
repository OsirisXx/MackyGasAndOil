-- ============================================================================
-- Fix: Reset shift snapshots with proper data
-- Run this to properly initialize snapshots for testing
-- ============================================================================

-- First, check current state
SELECT 
  sps.shift_date, 
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading, 
  sps.status,
  p.pump_name,
  p.fuel_type
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
ORDER BY sps.shift_date, sps.shift_number;

-- Delete existing snapshots for today to reset
DELETE FROM shift_pump_snapshots WHERE shift_date = CURRENT_DATE;

-- For the 1st shift (already passed), create a snapshot with:
-- beginning_reading = initial_reading from pumps table
-- ending_reading = some value representing end of 1st shift
-- For simulation, let's say 1st shift sold 100 liters of Premium

-- Get the Premium pump ID and create proper snapshots
DO $$
DECLARE
  v_pump RECORD;
  v_branch_id UUID;
  v_initial NUMERIC;
  v_current NUMERIC;
  v_shift1_end NUMERIC;
BEGIN
  -- Get the Premium pump
  SELECT id, branch_id, initial_reading, current_reading, price_per_liter
  INTO v_pump
  FROM pumps
  WHERE fuel_type = 'Premium' AND is_active = true
  LIMIT 1;

  IF v_pump.id IS NOT NULL THEN
    v_initial := v_pump.initial_reading;
    v_current := v_pump.current_reading;
    
    -- Calculate 1st shift end (let's say 60% of total sales happened in 1st shift)
    -- Total liters = current - initial = 190.39
    -- 1st shift = 60% = ~114 liters
    v_shift1_end := v_initial + ((v_current - v_initial) * 0.6);

    -- Create 1st shift snapshot (CLOSED - shift already ended)
    INSERT INTO shift_pump_snapshots (
      branch_id, pump_id, shift_date, shift_number,
      beginning_reading, ending_reading, price_per_liter, status, closed_at
    ) VALUES (
      v_pump.branch_id, v_pump.id, CURRENT_DATE, 1,
      v_initial, v_shift1_end, v_pump.price_per_liter, 'closed', now()
    );

    -- Create 2nd shift snapshot (OPEN - current shift)
    INSERT INTO shift_pump_snapshots (
      branch_id, pump_id, shift_date, shift_number,
      beginning_reading, ending_reading, price_per_liter, status
    ) VALUES (
      v_pump.branch_id, v_pump.id, CURRENT_DATE, 2,
      v_shift1_end, v_current, v_pump.price_per_liter, 'open'
    );

    RAISE NOTICE 'Created snapshots for Premium pump:';
    RAISE NOTICE '1st shift: % to % (% liters)', v_initial, v_shift1_end, v_shift1_end - v_initial;
    RAISE NOTICE '2nd shift: % to % (% liters)', v_shift1_end, v_current, v_current - v_shift1_end;
  END IF;
END $$;

-- Also create snapshots for other pumps (with 0 sales)
INSERT INTO shift_pump_snapshots (branch_id, pump_id, shift_date, shift_number, beginning_reading, ending_reading, price_per_liter, status, closed_at)
SELECT 
  branch_id, id, CURRENT_DATE, 1,
  initial_reading, initial_reading, price_per_liter, 'closed', now()
FROM pumps
WHERE fuel_type != 'Premium' AND is_active = true
AND id NOT IN (SELECT pump_id FROM shift_pump_snapshots WHERE shift_date = CURRENT_DATE AND shift_number = 1);

INSERT INTO shift_pump_snapshots (branch_id, pump_id, shift_date, shift_number, beginning_reading, ending_reading, price_per_liter, status)
SELECT 
  branch_id, id, CURRENT_DATE, 2,
  initial_reading, initial_reading, price_per_liter, 'open'
FROM pumps
WHERE fuel_type != 'Premium' AND is_active = true
AND id NOT IN (SELECT pump_id FROM shift_pump_snapshots WHERE shift_date = CURRENT_DATE AND shift_number = 2);

-- Verify the fix
SELECT 
  sps.shift_date, 
  sps.shift_number, 
  sps.beginning_reading, 
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters_sold,
  sps.status,
  p.pump_name,
  p.fuel_type
FROM shift_pump_snapshots sps
JOIN pumps p ON sps.pump_id = p.id
ORDER BY p.fuel_type, sps.shift_number;
