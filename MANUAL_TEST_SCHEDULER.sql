-- ============================================================================
-- Manual Test: Execute Pending Schedule
-- Description: Manually execute the pending schedule to test the system
--              without deploying the Edge Function
-- ============================================================================

-- Step 1: Find the pending schedule
SELECT 
  id,
  scheduled_at,
  status,
  pump_ids,
  price_changes,
  branch_id,
  created_by_name
FROM price_change_schedules 
WHERE status = 'pending' 
ORDER BY scheduled_at ASC
LIMIT 1;

-- Step 2: Copy the schedule ID from above and execute it
-- Replace 'YOUR-SCHEDULE-ID' with the actual ID from Step 1
SELECT execute_price_change_schedule('YOUR-SCHEDULE-ID');

-- Step 3: Verify the schedule was executed
SELECT 
  id,
  status,
  executed_at,
  error_message,
  pump_ids,
  price_changes
FROM price_change_schedules 
WHERE id = 'YOUR-SCHEDULE-ID';

-- Step 4: Verify pump prices were updated
SELECT 
  id,
  pump_number,
  pump_name,
  fuel_type,
  price_per_liter,
  updated_at
FROM pumps
WHERE updated_at > now() - interval '5 minutes'
ORDER BY updated_at DESC;

-- Step 5: Check notifications were created
SELECT 
  id,
  type,
  title,
  message,
  created_at
FROM notifications
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;

-- Step 6: Check audit log
SELECT 
  id,
  action,
  entity_type,
  description,
  created_at
FROM audit_logs
WHERE entity_type = 'price_change_schedule'
AND created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;
