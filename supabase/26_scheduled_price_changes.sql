-- ============================================================================
-- Migration: 26_scheduled_price_changes.sql
-- Description: Add scheduled price changes feature with price_change_schedules
--              and notifications tables. Includes database functions for
--              schedule execution and conflict detection.
-- ============================================================================

-- ============================================================================
-- PART 1: Create price_change_schedules table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_change_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scheduling info
  scheduled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Execution tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Target pumps and prices
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  pump_ids UUID[] NOT NULL, -- Array of pump IDs to update
  price_changes JSONB NOT NULL, -- { "pump_id": new_price, ... }
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  cancelled_by UUID REFERENCES auth.users(id),
  cancelled_by_name TEXT,
  notes TEXT,
  
  -- Constraints
  CONSTRAINT future_schedule CHECK (scheduled_at > created_at),
  CONSTRAINT valid_pump_ids CHECK (array_length(pump_ids, 1) > 0)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_schedules_status 
  ON public.price_change_schedules(status);

CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at 
  ON public.price_change_schedules(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_schedules_branch 
  ON public.price_change_schedules(branch_id);

-- ============================================================================
-- PART 2: Create notifications table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Target user (NULL = all admins)
  user_id UUID REFERENCES auth.users(id),
  
  -- Notification content
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'error', 'success')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entity
  entity_type TEXT, -- 'price_change_schedule'
  entity_id UUID,
  
  -- Status
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user 
  ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread 
  ON public.notifications(is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_created 
  ON public.notifications(created_at DESC);

-- ============================================================================
-- PART 3: Create execute_price_change_schedule function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.execute_price_change_schedule(
  p_schedule_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_schedule RECORD;
  v_pump_id UUID;
  v_new_price NUMERIC;
  v_old_prices JSONB := '{}';
  v_updated_count INT := 0;
  v_old_price NUMERIC;
BEGIN
  -- Get schedule details with row lock
  SELECT * INTO v_schedule
  FROM public.price_change_schedules
  WHERE id = p_schedule_id
    AND status = 'pending'
  FOR UPDATE; -- Lock row to prevent concurrent execution
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Schedule not found or already processed'
    );
  END IF;
  
  -- Update each pump
  FOR v_pump_id IN SELECT unnest(v_schedule.pump_ids)
  LOOP
    -- Get new price from price_changes JSONB
    v_new_price := (v_schedule.price_changes->>v_pump_id::text)::NUMERIC;
    
    -- Get old price for audit
    SELECT price_per_liter INTO v_old_price
    FROM public.pumps
    WHERE id = v_pump_id;
    
    -- Store old price in JSONB
    v_old_prices := v_old_prices || jsonb_build_object(
      v_pump_id::text,
      v_old_price
    );
    
    -- Update pump price
    UPDATE public.pumps
    SET price_per_liter = v_new_price,
        updated_at = now()
    WHERE id = v_pump_id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  -- Mark schedule as executed
  UPDATE public.price_change_schedules
  SET status = 'executed',
      executed_at = now(),
      updated_at = now()
  WHERE id = p_schedule_id;
  
  -- Create audit log
  PERFORM public.log_audit(
    'execute',
    'price_change_schedule',
    p_schedule_id,
    format('Executed price change for %s pumps', v_updated_count),
    v_old_prices,
    v_schedule.price_changes,
    jsonb_build_object(
      'scheduled_at', v_schedule.scheduled_at,
      'executed_at', now(),
      'pump_count', v_updated_count
    ),
    v_schedule.branch_id,
    NULL, -- branch_name (can be joined if needed)
    NULL, -- cashier_id
    NULL  -- cashier_name
  );
  
  -- Create success notification
  INSERT INTO public.notifications (type, title, message, entity_type, entity_id)
  VALUES (
    'success',
    'Price Change Executed',
    format('Scheduled price change for %s pumps executed successfully', v_updated_count),
    'price_change_schedule',
    p_schedule_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'pumps_updated', v_updated_count,
    'executed_at', now()
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Mark schedule as failed
  UPDATE public.price_change_schedules
  SET status = 'failed',
      error_message = SQLERRM,
      updated_at = now()
  WHERE id = p_schedule_id;
  
  -- Create error notification
  INSERT INTO public.notifications (type, title, message, entity_type, entity_id)
  VALUES (
    'error',
    'Price Change Failed',
    format('Failed to execute price change: %s', SQLERRM),
    'price_change_schedule',
    p_schedule_id
  );
  
  -- Log error
  PERFORM public.log_audit(
    'error',
    'price_change_schedule',
    p_schedule_id,
    format('Failed to execute price change: %s', SQLERRM),
    NULL,
    NULL,
    jsonb_build_object('error', SQLERRM),
    v_schedule.branch_id,
    NULL,
    NULL,
    NULL
  );
  
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: Create check_schedule_conflicts function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
  p_scheduled_at TIMESTAMPTZ,
  p_pump_ids UUID[],
  p_exclude_schedule_id UUID DEFAULT NULL
) RETURNS TABLE (
  schedule_id UUID,
  scheduled_at TIMESTAMPTZ,
  pump_ids UUID[],
  created_by_name TEXT,
  time_diff_minutes INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.scheduled_at,
    s.pump_ids,
    s.created_by_name,
    EXTRACT(EPOCH FROM (s.scheduled_at - p_scheduled_at))::INT / 60 AS time_diff_minutes
  FROM public.price_change_schedules s
  WHERE s.status = 'pending'
    AND s.id != COALESCE(p_exclude_schedule_id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND s.pump_ids && p_pump_ids -- Array overlap operator
    AND ABS(EXTRACT(EPOCH FROM (s.scheduled_at - p_scheduled_at))) <= 600 -- Within 10 minutes (600 seconds)
  ORDER BY s.scheduled_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: Enable RLS (Row Level Security) policies
-- ============================================================================

-- Enable RLS on price_change_schedules
ALTER TABLE public.price_change_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all schedules
CREATE POLICY "Admins can view all schedules"
  ON public.price_change_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.role = 'admin'
    )
  );

-- Policy: Admins can create schedules
CREATE POLICY "Admins can create schedules"
  ON public.price_change_schedules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.role = 'admin'
    )
  );

-- Policy: Admins can update schedules
CREATE POLICY "Admins can update schedules"
  ON public.price_change_schedules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.role = 'admin'
    )
  );

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications or broadcast notifications
CREATE POLICY "Users can view their notifications"
  ON public.notifications
  FOR SELECT
  USING (
    user_id = auth.uid() OR user_id IS NULL
  );

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their notifications"
  ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: System can insert notifications (via service role)
CREATE POLICY "System can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Migration complete
-- ============================================================================
