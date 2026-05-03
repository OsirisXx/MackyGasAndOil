# Setup Cron Schedule for Price Change Scheduler

## ✅ Function Deployed Successfully!

The `price-change-scheduler` function is now deployed and active.

**Function URL:** https://obinxgdqklzwhhjkzpxu.supabase.co/functions/v1/price-change-scheduler

## ⚠️ Cron Schedule Not Yet Active

The function is deployed but won't run automatically until we set up the cron schedule.

## Option 1: Setup via Supabase Dashboard (Recommended)

1. **Go to Edge Functions:**
   https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/functions

2. **Click on `price-change-scheduler`**

3. **Look for "Cron Jobs" or "Schedules" tab**

4. **Add a new cron job:**
   - Schedule: `* * * * *` (every minute)
   - Or use: `*/1 * * * *` (every 1 minute)

5. **Save the schedule**

## Option 2: Manual Invocation (For Testing)

You can manually invoke the function to test it right now:

### Via Dashboard:
1. Go to the function page
2. Click "Invoke" or "Test" button
3. Check the logs to see if it executed your pending schedule

### Via curl:
```bash
curl -X POST https://obinxgdqklzwhhjkzpxu.supabase.co/functions/v1/price-change-scheduler \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaW54Z2RxS2x6d2hoamtwenhUIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA5NjI4NzcsImV4cCI6MjA0NjUzODg3N30.Hs-Hs8Hs8Hs8Hs8Hs8Hs8Hs8Hs8Hs8Hs8Hs8Hs8Hs8" \
  -H "Content-Type: application/json"
```

## Option 3: Setup via SQL (Alternative)

If the dashboard doesn't have a cron UI, you can set it up via SQL:

```sql
-- Enable pg_net extension (for HTTP requests)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to invoke the Edge Function
CREATE OR REPLACE FUNCTION invoke_price_change_scheduler()
RETURNS void AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://obinxgdqklzwhhjkzpxu.supabase.co/functions/v1/price-change-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function to run every minute
SELECT cron.schedule(
  'price-change-scheduler',
  '* * * * *',
  'SELECT invoke_price_change_scheduler();'
);

-- Verify the cron job was created
SELECT * FROM cron.job;
```

## Verify It's Working

### 1. Check Function Logs
Go to: https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/functions/price-change-scheduler/logs

You should see logs like:
```
[Scheduler] Starting price change scheduler check...
[Scheduler] Found 1 due schedules
[Scheduler] Executing schedule <id>...
[Scheduler] Completed: 1 succeeded, 0 failed
```

### 2. Check Your Pending Schedule
- Go to http://localhost:5173/admin/pump-management
- Click "View Schedules"
- The schedule should change from "Pending" to "Executed" within 1 minute

### 3. Check Pump Prices
- Refresh the pump list
- The pump price should update to ₱65.17

### 4. Check Database
```sql
-- Check schedule status
SELECT id, status, executed_at, error_message
FROM price_change_schedules
ORDER BY created_at DESC
LIMIT 5;

-- Check pump prices
SELECT pump_number, pump_name, price_per_liter, updated_at
FROM pumps
ORDER BY updated_at DESC;

-- Check notifications
SELECT type, title, message, created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 5;
```

## Troubleshooting

### Function Not Running Automatically
- **Check:** Is the cron schedule set up?
- **Solution:** Set up cron via dashboard or SQL

### Schedule Still Pending After 1 Minute
- **Check:** Function logs for errors
- **Solution:** Manually invoke the function to see the error

### Permission Errors in Logs
- **Check:** Service role key is set correctly
- **Solution:** The function uses `SUPABASE_SERVICE_ROLE_KEY` from environment

### Pump Prices Not Updating
- **Check:** `execute_price_change_schedule` function exists
- **Solution:** Verify the migration was run correctly

## Next Steps

1. **Set up the cron schedule** (Option 1 recommended)
2. **Wait 1 minute** for the scheduler to run
3. **Check your pump prices** - should update to ₱65.17
4. **Verify in the UI** - schedule should show "Executed"

Once the cron is set up, all future schedules will execute automatically!
