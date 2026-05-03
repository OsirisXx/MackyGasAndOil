-- ============================================================================
-- Setup Cron Schedule for Price Change Scheduler
-- Description: Configures pg_cron to automatically invoke the Edge Function
--              every minute to check for pending price change schedules
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to invoke the Edge Function
-- Using the legacy JWT anon key for authentication
CREATE OR REPLACE FUNCTION public.invoke_price_change_scheduler()
RETURNS void AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://obinxgdqklzwhhjkzpxu.supabase.co/functions/v1/price-change-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaW54Z2Rxa2x6d2hoamt6cHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTQyMjMsImV4cCI6MjA4NjczMDIyM30.bsl6NT_Dhk8iL_zhB2TaFtlbrNgdCT-WtEDkqyOmW4E'
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove existing cron job if it exists
SELECT cron.unschedule('price-change-scheduler') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'price-change-scheduler'
);

-- Schedule the function to run every minute
SELECT cron.schedule(
  'price-change-scheduler',  -- Job name
  '* * * * *',               -- Every minute (cron expression)
  'SELECT public.invoke_price_change_scheduler();'
);

-- Verify the cron job was created
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'price-change-scheduler';

-- ============================================================================
-- Expected Output:
-- You should see one row with:
-- - jobname: price-change-scheduler
-- - schedule: * * * * *
-- - active: true
-- - command: SELECT public.invoke_price_change_scheduler();
-- ============================================================================
