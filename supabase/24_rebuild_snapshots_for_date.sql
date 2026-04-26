-- ============================================================================
-- Migration: 24_rebuild_snapshots_for_date.sql
-- Description: Function to rebuild snapshots for a specific date range
--              Called when accountability report finds no snapshots but sales exist
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_snapshots_for_date(
  p_branch_id UUID,
  p_date DATE,
  p_shift_number INT
)
RETURNS INT AS $$
DECLARE
  v_pump RECORD;
  v_count INT := 0;
  v_branch_name TEXT;
  v_beginning NUMERIC(12,3);
  v_ending NUMERIC(12,3);
  v_shift_start TIMESTAMPTZ;
  v_shift_end TIMESTAMPTZ;
  v_hour_start INT;
  v_hour_end INT;
BEGIN
  -- Get branch name
  SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id;
  IF v_branch_name IS NULL THEN RETURN 0; END IF;

  -- Determine shift time boundaries in Philippine time
  IF v_branch_name = 'Balingasag' THEN
    IF p_shift_number = 1 THEN v_hour_start := 5; v_hour_end := 13;
    ELSIF p_shift_number = 2 THEN v_hour_start := 13; v_hour_end := 21;
    ELSE v_hour_start := 21; v_hour_end := 29; -- 29 = 5am next day
    END IF;
  ELSE
    IF p_shift_number = 1 THEN v_hour_start := 4; v_hour_end := 12;
    ELSIF p_shift_number = 2 THEN v_hour_start := 12; v_hour_end := 20;
    ELSE v_hour_start := 20; v_hour_end := 28; -- 28 = 4am next day
    END IF;
  END IF;

  -- Convert to UTC timestamps
  IF v_hour_end > 24 THEN
    v_shift_start := (p_date || ' ' || v_hour_start || ':00:00')::TIMESTAMP AT TIME ZONE 'Asia/Manila';
    v_shift_end := ((p_date + 1) || ' ' || (v_hour_end - 24) || ':00:00')::TIMESTAMP AT TIME ZONE 'Asia/Manila';
  ELSE
    v_shift_start := (p_date || ' ' || v_hour_start || ':00:00')::TIMESTAMP AT TIME ZONE 'Asia/Manila';
    v_shift_end := (p_date || ' ' || v_hour_end || ':00:00')::TIMESTAMP AT TIME ZONE 'Asia/Manila';
  END IF;

  -- For each active pump in this branch
  FOR v_pump IN
    SELECT id, current_reading, price_per_liter
    FROM public.pumps
    WHERE branch_id = p_branch_id AND is_active = true
  LOOP
    -- Skip if snapshot already exists
    IF EXISTS (
      SELECT 1 FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id AND shift_date = p_date AND shift_number = p_shift_number
    ) THEN
      CONTINUE;
    END IF;

    -- Calculate total liters sold during this shift for this pump
    SELECT COALESCE(SUM(liters), 0) INTO v_ending
    FROM (
      SELECT COALESCE(liters, 0) as liters FROM public.cash_sales
      WHERE pump_id = v_pump.id AND created_at >= v_shift_start AND created_at < v_shift_end
      UNION ALL
      SELECT COALESCE(liters, 0) as liters FROM public.purchase_orders
      WHERE pump_id = v_pump.id AND created_at >= v_shift_start AND created_at < v_shift_end
      UNION ALL
      SELECT COALESCE(liters, 0) as liters FROM public.pump_calibrations
      WHERE pump_id = v_pump.id AND created_at >= v_shift_start AND created_at < v_shift_end
    ) shift_sales;

    -- Get beginning reading from previous shift's ending, or calculate from total sales
    SELECT ending_reading INTO v_beginning
    FROM public.shift_pump_snapshots
    WHERE pump_id = v_pump.id
      AND (shift_date < p_date OR (shift_date = p_date AND shift_number < p_shift_number))
      AND status = 'closed'
    ORDER BY shift_date DESC, shift_number DESC
    LIMIT 1;

    -- If no previous snapshot, calculate from current_reading minus all sales after this shift
    IF v_beginning IS NULL THEN
      SELECT v_pump.current_reading - COALESCE(SUM(liters), 0) INTO v_beginning
      FROM (
        SELECT COALESCE(liters, 0) as liters FROM public.cash_sales
        WHERE pump_id = v_pump.id AND created_at >= v_shift_start
        UNION ALL
        SELECT COALESCE(liters, 0) as liters FROM public.purchase_orders
        WHERE pump_id = v_pump.id AND created_at >= v_shift_start
        UNION ALL
        SELECT COALESCE(liters, 0) as liters FROM public.pump_calibrations
        WHERE pump_id = v_pump.id AND created_at >= v_shift_start
      ) future_sales;
    END IF;

    -- Only create snapshot if there were sales during this shift
    -- or if we want to show all pumps (create with 0 liters)
    INSERT INTO public.shift_pump_snapshots (
      branch_id, pump_id, shift_date, shift_number,
      beginning_reading, ending_reading, price_per_liter, status
    ) VALUES (
      p_branch_id, v_pump.id, p_date, p_shift_number,
      v_beginning, v_beginning + v_ending, v_pump.price_per_liter,
      CASE WHEN p_date < (now() AT TIME ZONE 'Asia/Manila')::DATE THEN 'closed'
           WHEN p_date = (now() AT TIME ZONE 'Asia/Manila')::DATE
                AND p_shift_number < public.get_current_shift(v_branch_name) THEN 'closed'
           ELSE 'open'
      END
    )
    ON CONFLICT (pump_id, shift_date, shift_number) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.rebuild_snapshots_for_date(UUID, DATE, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_snapshots_for_date(UUID, DATE, INT) TO anon;
