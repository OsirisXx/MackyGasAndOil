-- ============================================================================
-- Migration: 16_auto_shift_snapshots.sql
-- Description: Auto Shift Snapshots System
--              Automatically captures pump readings at shift boundaries
--              Enables accurate per-shift accountability reporting
-- ============================================================================

-- ============================================================================
-- 1. SHIFT PUMP SNAPSHOTS TABLE
-- Stores pump readings at the START of each shift
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shift_pump_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Context
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  pump_id UUID NOT NULL REFERENCES public.pumps(id) ON DELETE CASCADE,
  
  -- Shift info
  shift_date DATE NOT NULL,
  shift_number INT NOT NULL CHECK (shift_number IN (1, 2, 3)),
  
  -- Readings at shift START
  beginning_reading NUMERIC(12,3) NOT NULL DEFAULT 0,
  
  -- Readings at shift END (updated when next shift starts or manually closed)
  ending_reading NUMERIC(12,3),
  
  -- Calculated fields
  liters_sold NUMERIC(12,3) GENERATED ALWAYS AS (
    COALESCE(ending_reading, 0) - beginning_reading
  ) STORED,
  
  -- Price at time of snapshot
  price_per_liter NUMERIC(10,2) NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  
  -- Unique constraint: one snapshot per pump per shift per day
  UNIQUE(pump_id, shift_date, shift_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_branch ON public.shift_pump_snapshots(branch_id);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_date ON public.shift_pump_snapshots(shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_shift ON public.shift_pump_snapshots(shift_number);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_pump ON public.shift_pump_snapshots(pump_id);
CREATE INDEX IF NOT EXISTS idx_shift_snapshots_status ON public.shift_pump_snapshots(status);

-- ============================================================================
-- 2. FUNCTION: Create shift snapshots for all pumps
-- Called at shift boundaries to capture current readings
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
  v_prev_snapshot RECORD;
BEGIN
  -- Close any open snapshots for previous shift
  UPDATE public.shift_pump_snapshots
  SET 
    status = 'closed',
    closed_at = now()
  WHERE 
    branch_id = p_branch_id
    AND status = 'open'
    AND NOT (shift_date = p_shift_date AND shift_number = p_shift_number);

  -- Create snapshots for each active pump
  FOR v_pump IN 
    SELECT id, current_reading, price_per_liter
    FROM public.pumps
    WHERE branch_id = p_branch_id AND is_active = true
  LOOP
    -- Check if snapshot already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id 
        AND shift_date = p_shift_date 
        AND shift_number = p_shift_number
    ) THEN
      -- Get previous shift's ending reading if exists
      SELECT ending_reading INTO v_prev_snapshot
      FROM public.shift_pump_snapshots
      WHERE pump_id = v_pump.id
        AND status = 'closed'
      ORDER BY shift_date DESC, shift_number DESC
      LIMIT 1;

      -- Insert new snapshot
      INSERT INTO public.shift_pump_snapshots (
        branch_id,
        pump_id,
        shift_date,
        shift_number,
        beginning_reading,
        price_per_liter
      ) VALUES (
        p_branch_id,
        v_pump.id,
        p_shift_date,
        p_shift_number,
        COALESCE(v_prev_snapshot.ending_reading, v_pump.current_reading),
        v_pump.price_per_liter
      );
      
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. FUNCTION: Update shift snapshot ending readings
-- Called periodically or on demand to update current shift's ending readings
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_shift_snapshot_readings(
  p_branch_id UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  -- Update all open snapshots with current pump readings
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
-- 4. FUNCTION: Close shift and create next shift snapshots
-- Convenience function for shift transitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transition_shift(
  p_branch_id UUID,
  p_new_shift_date DATE,
  p_new_shift_number INT
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- First update all current readings to open snapshots
  PERFORM public.update_shift_snapshot_readings(p_branch_id);
  
  -- Then create new shift snapshots (which also closes previous)
  SELECT public.create_shift_snapshots(p_branch_id, p_new_shift_date, p_new_shift_number) INTO v_count;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNCTION: Get current shift number based on time and branch
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_current_shift(p_branch_name TEXT DEFAULT 'Manolo')
RETURNS INT AS $$
DECLARE
  v_hour INT;
  v_is_balingasag BOOLEAN;
BEGIN
  v_hour := EXTRACT(HOUR FROM now());
  v_is_balingasag := (p_branch_name = 'Balingasag');
  
  IF v_is_balingasag THEN
    -- Balingasag: 5am-1pm (1st), 1pm-9pm (2nd), 9pm-5am (3rd)
    IF v_hour >= 5 AND v_hour < 13 THEN
      RETURN 1;
    ELSIF v_hour >= 13 AND v_hour < 21 THEN
      RETURN 2;
    ELSE
      RETURN 3;
    END IF;
  ELSE
    -- Manolo/Sankanan/Patulangan: 4am-12pm (1st), 12pm-8pm (2nd), 8pm-4am (3rd)
    IF v_hour >= 4 AND v_hour < 12 THEN
      RETURN 1;
    ELSIF v_hour >= 12 AND v_hour < 20 THEN
      RETURN 2;
    ELSE
      RETURN 3;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. TRIGGER: Auto-update snapshot ending reading on pump reading change
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_update_snapshot_on_pump_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the open snapshot for this pump with new current reading
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
-- 7. RLS POLICIES
-- ============================================================================
ALTER TABLE public.shift_pump_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "Admin full access shift_pump_snapshots" ON public.shift_pump_snapshots;
CREATE POLICY "Admin full access shift_pump_snapshots" ON public.shift_pump_snapshots
  FOR ALL USING (auth.role() = 'authenticated');

-- Anon can read (for POS accountability display)
DROP POLICY IF EXISTS "Anon can read shift_pump_snapshots" ON public.shift_pump_snapshots;
CREATE POLICY "Anon can read shift_pump_snapshots" ON public.shift_pump_snapshots
  FOR SELECT USING (true);

-- ============================================================================
-- 8. INITIALIZE: Create snapshots for current shift for all branches
-- ============================================================================
DO $$
DECLARE
  v_branch RECORD;
  v_shift INT;
BEGIN
  FOR v_branch IN SELECT id, name FROM public.branches WHERE is_active = true
  LOOP
    -- Get current shift for this branch
    v_shift := public.get_current_shift(v_branch.name);
    
    -- Create snapshots for current shift
    PERFORM public.create_shift_snapshots(v_branch.id, CURRENT_DATE, v_shift);
  END LOOP;
END $$;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- How it works:
-- 1. When shift starts, create_shift_snapshots captures beginning readings
-- 2. As sales happen, pump.current_reading updates
-- 3. Trigger auto-updates the snapshot's ending_reading
-- 4. When next shift starts, previous shift is closed and new one opens
-- 
-- For accountability reports:
-- - Query shift_pump_snapshots for specific shift_date + shift_number
-- - liters_sold is auto-calculated (ending - beginning)
-- - Each shift has its own isolated data
--
-- Shift transitions can be triggered:
-- - Manually by admin
-- - By a scheduled job (pg_cron)
-- - By first POS action of new shift
