-- ============================================================================
-- Migration: 22_rebuild_shift_snapshots.sql
-- Description: Rebuild all shift snapshots from actual sales data
--              Uses current_reading (known correct) minus total sales to find
--              the true starting reading, then walks forward through sales
--              Also fixes timezone issues (UTC vs Asia/Manila)
-- ============================================================================

-- ============================================================================
-- STEP 1: Helper to determine which shift a timestamp belongs to
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_shift_for_timestamp(
  p_timestamp TIMESTAMPTZ,
  p_branch_name TEXT DEFAULT 'Manolo'
)
RETURNS TABLE(shift_date DATE, shift_number INT) AS $$
DECLARE
  v_hour INT;
  v_is_balingasag BOOLEAN;
  v_local_time TIMESTAMP;
BEGIN
  v_local_time := p_timestamp AT TIME ZONE 'Asia/Manila';
  v_hour := EXTRACT(HOUR FROM v_local_time);
  v_is_balingasag := (p_branch_name = 'Balingasag');

  IF v_is_balingasag THEN
    IF v_hour >= 5 AND v_hour < 13 THEN
      shift_date := v_local_time::DATE;
      shift_number := 1;
    ELSIF v_hour >= 13 AND v_hour < 21 THEN
      shift_date := v_local_time::DATE;
      shift_number := 2;
    ELSE
      IF v_hour >= 21 THEN
        shift_date := v_local_time::DATE;
      ELSE
        shift_date := (v_local_time - INTERVAL '1 day')::DATE;
      END IF;
      shift_number := 3;
    END IF;
  ELSE
    IF v_hour >= 4 AND v_hour < 12 THEN
      shift_date := v_local_time::DATE;
      shift_number := 1;
    ELSIF v_hour >= 12 AND v_hour < 20 THEN
      shift_date := v_local_time::DATE;
      shift_number := 2;
    ELSE
      IF v_hour >= 20 THEN
        shift_date := v_local_time::DATE;
      ELSE
        shift_date := (v_local_time - INTERVAL '1 day')::DATE;
      END IF;
      shift_number := 3;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- STEP 2: FIX get_current_shift to use Philippine timezone
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_current_shift(p_branch_name TEXT DEFAULT 'Manolo')
RETURNS INT AS $$
DECLARE
  v_hour INT;
  v_is_balingasag BOOLEAN;
BEGIN
  v_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Asia/Manila'));
  v_is_balingasag := (p_branch_name = 'Balingasag');

  IF v_is_balingasag THEN
    IF v_hour >= 5 AND v_hour < 13 THEN RETURN 1;
    ELSIF v_hour >= 13 AND v_hour < 21 THEN RETURN 2;
    ELSE RETURN 3;
    END IF;
  ELSE
    IF v_hour >= 4 AND v_hour < 12 THEN RETURN 1;
    ELSIF v_hour >= 12 AND v_hour < 20 THEN RETURN 2;
    ELSE RETURN 3;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- STEP 3: Rebuild all shift snapshots from sales data
-- KEY FIX: Compute the TRUE starting reading as:
--   current_reading (known correct from pump hardware) - SUM(all sales liters)
-- This gives us the actual meter reading BEFORE any sales were recorded
-- Then walk forward through sales chronologically
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rebuild_all_shift_snapshots(
  p_branch_id UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_branch RECORD;
  v_pump RECORD;
  v_sale RECORD;
  v_shift_info RECORD;
  v_running_reading NUMERIC(12,3);
  v_current_shift_date DATE;
  v_current_shift_number INT;
  v_total_rebuilt INT := 0;
  v_branch_name TEXT;
  v_total_sales_liters NUMERIC(12,3);
  v_true_start_reading NUMERIC(12,3);
BEGIN
  FOR v_branch IN
    SELECT id, name FROM public.branches
    WHERE is_active = true
      AND (p_branch_id IS NULL OR id = p_branch_id)
  LOOP
    v_branch_name := v_branch.name;

    FOR v_pump IN
      SELECT id, initial_reading, current_reading, price_per_liter
      FROM public.pumps
      WHERE branch_id = v_branch.id AND is_active = true
    LOOP
      -- Delete existing snapshots for this pump
      DELETE FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id AND branch_id = v_branch.id;

      -- Calculate total liters from ALL sales ever for this pump
      SELECT COALESCE(SUM(liters), 0) INTO v_total_sales_liters
      FROM (
        SELECT COALESCE(liters, 0) as liters FROM public.cash_sales WHERE pump_id = v_pump.id
        UNION ALL
        SELECT COALESCE(liters, 0) as liters FROM public.purchase_orders WHERE pump_id = v_pump.id
        UNION ALL
        SELECT COALESCE(liters, 0) as liters FROM public.pump_calibrations WHERE pump_id = v_pump.id
      ) all_sales;

      -- TRUE starting reading = current_reading - total sales
      -- This is the actual physical meter reading before any sales were recorded
      v_true_start_reading := v_pump.current_reading - v_total_sales_liters;
      v_running_reading := v_true_start_reading;
      v_current_shift_date := NULL;
      v_current_shift_number := NULL;

      -- Walk through ALL sales chronologically
      FOR v_sale IN
        SELECT created_at, COALESCE(liters, 0) as liters
        FROM public.cash_sales WHERE pump_id = v_pump.id
        UNION ALL
        SELECT created_at, COALESCE(liters, 0) as liters
        FROM public.purchase_orders WHERE pump_id = v_pump.id
        UNION ALL
        SELECT created_at, COALESCE(liters, 0) as liters
        FROM public.pump_calibrations WHERE pump_id = v_pump.id
        ORDER BY created_at ASC
      LOOP
        SELECT * INTO v_shift_info
        FROM public.get_shift_for_timestamp(v_sale.created_at, v_branch_name);

        -- New shift detected
        IF v_current_shift_date IS NULL
           OR v_shift_info.shift_date != v_current_shift_date
           OR v_shift_info.shift_number != v_current_shift_number THEN

          -- Close previous shift
          IF v_current_shift_date IS NOT NULL THEN
            UPDATE public.shift_pump_snapshots
            SET ending_reading = v_running_reading,
                status = 'closed',
                closed_at = v_sale.created_at
            WHERE pump_id = v_pump.id
              AND shift_date = v_current_shift_date
              AND shift_number = v_current_shift_number;
          END IF;

          -- Create new shift snapshot
          INSERT INTO public.shift_pump_snapshots (
            branch_id, pump_id, shift_date, shift_number,
            beginning_reading, ending_reading, price_per_liter, status
          ) VALUES (
            v_branch.id, v_pump.id, v_shift_info.shift_date, v_shift_info.shift_number,
            v_running_reading, v_running_reading, v_pump.price_per_liter, 'open'
          )
          ON CONFLICT (pump_id, shift_date, shift_number) DO NOTHING;

          v_current_shift_date := v_shift_info.shift_date;
          v_current_shift_number := v_shift_info.shift_number;
          v_total_rebuilt := v_total_rebuilt + 1;
        END IF;

        -- Add liters to running reading
        v_running_reading := v_running_reading + v_sale.liters;

        -- Update ending reading
        UPDATE public.shift_pump_snapshots
        SET ending_reading = v_running_reading
        WHERE pump_id = v_pump.id
          AND shift_date = v_current_shift_date
          AND shift_number = v_current_shift_number;
      END LOOP;

      -- Close all past shift snapshots
      UPDATE public.shift_pump_snapshots
      SET status = 'closed',
          closed_at = COALESCE(closed_at, now())
      WHERE pump_id = v_pump.id
        AND branch_id = v_branch.id
        AND status = 'open'
        AND NOT (
          shift_date = (now() AT TIME ZONE 'Asia/Manila')::DATE
          AND shift_number = public.get_current_shift(v_branch_name)
        );

    END LOOP;
  END LOOP;

  RETURN v_total_rebuilt;
END;
$$ LANGUAGE plpgsql;


-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rebuild_all_shift_snapshots(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_all_shift_snapshots(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_shift_for_timestamp(TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shift_for_timestamp(TIMESTAMPTZ, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_current_shift(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_shift(TEXT) TO anon;

-- ============================================================================
-- STEP 4: Fix create_shift_snapshots
-- ============================================================================
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
  UPDATE public.shift_pump_snapshots ss
  SET ending_reading = p.current_reading
  FROM public.pumps p
  WHERE ss.pump_id = p.id
    AND ss.branch_id = p_branch_id
    AND ss.status = 'open';

  UPDATE public.shift_pump_snapshots
  SET status = 'closed', closed_at = now()
  WHERE branch_id = p_branch_id
    AND status = 'open'
    AND NOT (shift_date = p_shift_date AND shift_number = p_shift_number);

  FOR v_pump IN
    SELECT id, current_reading, price_per_liter
    FROM public.pumps
    WHERE branch_id = p_branch_id AND is_active = true
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id
        AND shift_date = p_shift_date
        AND shift_number = p_shift_number
    ) THEN
      SELECT ending_reading INTO v_prev_ending
      FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id AND status = 'closed'
      ORDER BY shift_date DESC, shift_number DESC
      LIMIT 1;

      INSERT INTO public.shift_pump_snapshots (
        branch_id, pump_id, shift_date, shift_number,
        beginning_reading, ending_reading, price_per_liter, status
      ) VALUES (
        p_branch_id, v_pump.id, p_shift_date, p_shift_number,
        COALESCE(v_prev_ending, v_pump.current_reading),
        v_pump.current_reading, v_pump.price_per_liter, 'open'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- STEP 5: Fix update_shift_snapshot_readings
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_shift_snapshot_readings(
  p_branch_id UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.shift_pump_snapshots ss
  SET ending_reading = p.current_reading
  FROM public.pumps p
  WHERE ss.pump_id = p.id
    AND ss.status = 'open'
    AND (p_branch_id IS NULL OR ss.branch_id = p_branch_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Fix ensure_current_shift_snapshots to use Philippine date
-- ============================================================================
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
  v_current_shift := public.get_current_shift(p_branch_name);
  v_current_date := (now() AT TIME ZONE 'Asia/Manila')::DATE;

  SELECT shift_number, shift_date INTO v_existing_open_shift, v_existing_open_date
  FROM public.shift_pump_snapshots
  WHERE branch_id = p_branch_id AND status = 'open'
  LIMIT 1;

  IF v_existing_open_shift IS NOT NULL AND
     (v_existing_open_shift != v_current_shift OR v_existing_open_date != v_current_date) THEN
    SELECT public.create_shift_snapshots(p_branch_id, v_current_date, v_current_shift) INTO v_count;
  ELSIF v_existing_open_shift IS NULL THEN
    SELECT public.create_shift_snapshots(p_branch_id, v_current_date, v_current_shift) INTO v_count;
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.ensure_current_shift_snapshots(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_current_shift_snapshots(UUID, TEXT) TO anon;


-- ============================================================================
-- STEP 7: Fix the sale trigger to use Philippine date
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_pump_reading_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pumps
  SET current_reading = current_reading + COALESCE(NEW.liters, 0),
      updated_at = now()
  WHERE id = NEW.pump_id;

  UPDATE public.shift_pump_snapshots
  SET ending_reading = (SELECT current_reading FROM public.pumps WHERE id = NEW.pump_id)
  WHERE pump_id = NEW.pump_id
    AND shift_date = (now() AT TIME ZONE 'Asia/Manila')::DATE
    AND status = 'open';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_cash_sale ON public.cash_sales;
CREATE TRIGGER trigger_update_pump_reading_on_cash_sale
  AFTER INSERT ON public.cash_sales
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_sale();

DROP TRIGGER IF EXISTS trigger_update_pump_reading_on_po ON public.purchase_orders;
CREATE TRIGGER trigger_update_pump_reading_on_po
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW
  WHEN (NEW.pump_id IS NOT NULL AND NEW.liters IS NOT NULL)
  EXECUTE FUNCTION public.update_pump_reading_on_sale();

-- ============================================================================
-- STEP 8: Fix auto-update snapshot trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_update_snapshot_on_pump_change()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.shift_pump_snapshots
  SET ending_reading = NEW.current_reading
  WHERE pump_id = NEW.id
    AND status = 'open';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_update_snapshot ON public.pumps;
CREATE TRIGGER trigger_auto_update_snapshot
  AFTER UPDATE OF current_reading ON public.pumps
  FOR EACH ROW
  WHEN (OLD.current_reading IS DISTINCT FROM NEW.current_reading)
  EXECUTE FUNCTION public.auto_update_snapshot_on_pump_change();

-- ============================================================================
-- STEP 9: RUN THE REBUILD
-- ============================================================================
SELECT public.rebuild_all_shift_snapshots(NULL);

-- Verify: check that beginning readings are now large numbers matching pump meters
SELECT
  sps.shift_date,
  sps.shift_number,
  p.pump_name,
  p.fuel_type,
  sps.beginning_reading,
  sps.ending_reading,
  sps.ending_reading - sps.beginning_reading as liters_dispensed,
  sps.status
FROM public.shift_pump_snapshots sps
JOIN public.pumps p ON p.id = sps.pump_id
ORDER BY sps.shift_date DESC, sps.shift_number DESC, p.fuel_type
LIMIT 30;
