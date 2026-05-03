-- ============================================================================
-- Diagnose Scheduler Issues
-- Description: Check why pending schedules are not executing
-- ============================================================================

-- 1. Check current time and pending schedules
SELECT 
  'Current Database Time' as info,
  now() as current_time,
  now() AT TIME ZONE 'UTC' as current_time_utc,
  now() AT TIME ZONE 'Asia/Manila' as current_time_manila;

-- 2. Check pending schedules with time comparison
SELECT 
  id,
  scheduled_at,
  scheduled_at AT TIME ZONE 'UTC' as scheduled_utc,
  scheduled_at AT TIME ZONE 'Asia/Manila' as scheduled_manila,
  now() as current_time,
  (now() >= scheduled_at) as is_due,
  (now() - scheduled_at) as time_diff,
  status,
  pump_ids,
  price_changes,
  error_message
FROM price_change_schedules
WHERE status = 'pending'
ORDER BY scheduled_at;

-- 3. Try to manually execute the pending schedule
-- Copy the ID from above and run:
-- SELECT execute_price_change_schedule('PASTE-ID-HERE');

-- 4. Check if the execute function exists and works
SELECT 
  proname as function_name,
  pronargs as num_args,
  proargnames as arg_names
FROM pg_proc
WHERE proname = 'execute_price_change_schedule';

-- 5. Check recent function invocations (if pg_stat_statements is enabled)
SELECT 
  calls,
  total_exec_time,
  mean_exec_time,
  query
FROM pg_stat_statements
WHERE query LIKE '%execute_price_change_schedule%'
ORDER BY calls DESC
LIMIT 5;

-- 6. Check notifications created
SELECT 
  id,
  type,
  title,
  message,
  created_at
FROM notifications
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- 7. Check audit logs for schedule executions
SELECT 
  id,
  action,
  entity_type,
  description,
  created_at
FROM audit_logs
WHERE entity_type = 'price_change_schedule'
AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
