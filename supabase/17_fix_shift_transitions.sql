-- ============================================================================
-- Fix: Proper shift transition logic
-- This ensures ending_reading is updated BEFORE closing, and new shift
-- uses that ending_reading as its beginning_reading
-- ============================================================================

-- Drop and recreate the create_shift_snapshots function with proper logic
CREATE OR REPLACE FUNCTION public.create_shift_snapshots(
  p_branch_id UUID,
  p_shift_date DATE,
  p_shift_number INT
)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_pump RECORD;
  v_prev_ending NUMERIC;
BEGIN
  -- Step 1: Update ending_reading for all open snapshots BEFORE closing them
  UPDATE public.shift_pump_snapshots ss
  SET ending_reading = p.current_reading
  FROM public.pumps p
  WHERE ss.pump_id = p.id
    AND ss.branch_id = p_branch_id
    AND ss.status = 'open';

  -- Step 2: Close any open snapshots for previous shifts
  UPDATE public.shift_pump_snapshots
  SET 
    status = 'closed',
    closed_at = now()
  WHERE 
    branch_id = p_branch_id
    AND status = 'open'
    AND NOT (shift_date = p_shift_date AND shift_number = p_shift_number);

  -- Step 3: Create snapshots for each active pump
  FOR v_pump IN 
    SELECT id, current_reading, price_per_liter
    FROM public.pumps
    WHERE branch_id = p_branch_id AND is_active = true
  LOOP
    -- Check if snapshot already exists for this shift
    IF NOT EXISTS (
      SELECT 1 FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id 
        AND shift_date = p_shift_date 
        AND shift_number = p_shift_number
    ) THEN
      -- Get the most recent closed snapshot's ending_reading
      -- This becomes the new shift's beginning_reading
      SELECT ending_reading INTO v_prev_ending
      FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id
        AND status = 'closed'
      ORDER BY shift_date DESC, shift_number DESC
      LIMIT 1;

      -- Insert new snapshot
      -- beginning_reading = previous shift's ending_reading (or current_reading if first snapshot)
      -- ending_reading = current_reading (will be updated as sales happen)
      INSERT INTO public.shift_pump_snapshots (
        branch_id,
        pump_id,
        shift_date,
        shift_number,
        beginning_reading,
        ending_reading,
        price_per_liter,
        status
      ) VALUES (
        p_branch_id,
        v_pump.id,
        p_shift_date,
        p_shift_number,
        COALESCE(v_prev_ending, v_pump.current_reading),
        v_pump.current_reading,
        v_pump.price_per_liter,
        'open'
      );
      
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Also fix the ensureCurrentShiftSnapshots to properly detect shift changes
-- ============================================================================

-- Function to check if we need to transition shifts
CREATE OR REPLACE FUNCTION public.ensure_current_shift_snapshots(
  p_branch_id UUID,
  p_branch_name TEXT DEFAULT 'Manolo'
)
RETURNS INT AS $$
DECLARE
  v_current_shift INT;
  v_current_date DATE;
  v_existing_open_shift INT;
  v_existing_open_date DATE;
  v_count INT := 0;
BEGIN
  -- Get current shift number based on time
  v_current_shift := public.get_current_shift(p_branch_name);
  v_current_date := CURRENT_DATE;

  -- Check if there's an open snapshot for a DIFFERENT shift
  SELECT shift_number, shift_date INTO v_existing_open_shift, v_existing_open_date
  FROM public.shift_pump_snapshots
  WHERE branch_id = p_branch_id AND status = 'open'
  LIMIT 1;

  -- If open snapshot exists for a different shift/date, we need to transition
  IF v_existing_open_shift IS NOT NULL AND 
     (v_existing_open_shift != v_current_shift OR v_existing_open_date != v_current_date) THEN
    -- Transition: close old shift, create new shift
    SELECT public.create_shift_snapshots(p_branch_id, v_current_date, v_current_shift) INTO v_count;
  ELSIF v_existing_open_shift IS NULL THEN
    -- No open snapshots exist, create new ones
    SELECT public.create_shift_snapshots(p_branch_id, v_current_date, v_current_shift) INTO v_count;
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.ensure_current_shift_snapshots(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_current_shift_snapshots(UUID, TEXT) TO anon;
