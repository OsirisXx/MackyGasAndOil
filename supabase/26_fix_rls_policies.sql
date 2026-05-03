-- ============================================================================
-- Fix RLS Policies for Scheduled Price Changes
-- Description: Drop old policies and create new ones that work with the
--              existing auth system (no role column in auth.users)
-- ============================================================================

-- Drop old policies on price_change_schedules
DROP POLICY IF EXISTS "Admins can view all schedules" ON public.price_change_schedules;
DROP POLICY IF EXISTS "Admins can create schedules" ON public.price_change_schedules;
DROP POLICY IF EXISTS "Admins can update schedules" ON public.price_change_schedules;

-- Create new policies that check for authenticated users
CREATE POLICY "Authenticated users can view schedules"
  ON public.price_change_schedules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create schedules"
  ON public.price_change_schedules
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update schedules"
  ON public.price_change_schedules
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Drop old policies on notifications
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;

-- Create new policies
CREATE POLICY "Users can view their notifications"
  ON public.notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL)
  );

CREATE POLICY "Users can update their notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
