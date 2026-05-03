-- ============================================================================
-- Fix Cron Authentication Issue
-- Description: Update the invoke function to use the legacy JWT anon key
-- ============================================================================

-- Update the function with the correct legacy JWT anon key
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

-- Test the function immediately
SELECT public.invoke_price_change_scheduler();

-- Check if it worked by looking at the response
-- You should see a successful response in the Edge Function logs
