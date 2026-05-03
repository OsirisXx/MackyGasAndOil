# Enable Automatic Price Change Scheduler

## ✅ Manual Test Successful!

Great! The scheduler function works. Now let's make it run automatically every minute.

## Setup Automatic Execution

### Step 1: Run the Cron Setup SQL

1. **Open Supabase SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/sql

2. **Copy and paste this SQL:**

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to invoke the Edge Function
CREATE OR REPLACE FUNCTION public.invoke_price_change_scheduler()
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

-- Remove existing cron job if it exists (in case you run this multiple times)
SELECT cron.unschedule('price-change-scheduler') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'price-change-scheduler'
);

-- Schedule the function to run every minute
SELECT cron.schedule(
  'price-change-scheduler',
  '* * * * *',
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
```

3. **Click "Run"**

4. **Verify the output:**
   - You should see one row showing:
     - `jobname`: price-change-scheduler
     - `schedule`: * * * * *
     - `active`: true

### Step 2: Test Automatic Execution

1. **Create a new test schedule:**
   - Go to http://localhost:5173/admin/pump-management
   - Click "Schedule Price Change"
   - Set time for 2 minutes in the future
   - Select a pump and set a new price
   - Click "Create Schedule"

2. **Wait for the scheduled time**
   - The cron will check every minute
   - When the time arrives, it will automatically execute

3. **Verify it worked:**
   - Refresh "View Schedules" - status should change to "Executed"
   - Check pump prices - should update automatically
   - Check POS page - should show toast notification "Pump prices updated 💰"

## How It Works

```
Every Minute:
  ↓
pg_cron triggers
  ↓
invoke_price_change_scheduler() function
  ↓
HTTP POST to Edge Function
  ↓
Edge Function checks for pending schedules
  ↓
Executes due schedules
  ↓
Updates pump prices
  ↓
Creates notifications
  ↓
POS receives real-time update
```

## Verify Cron is Running

### Check Cron Job Status
```sql
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command,
  nodename,
  nodeport
FROM cron.job
WHERE jobname = 'price-change-scheduler';
```

### Check Cron Job History (if available)
```sql
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job WHERE jobname = 'price-change-scheduler'
)
ORDER BY start_time DESC
LIMIT 10;
```

### Check Edge Function Logs
Go to: https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/functions/price-change-scheduler/logs

You should see logs appearing every minute:
```
[Scheduler] Starting price change scheduler check...
[Scheduler] Found 0 due schedules
[Scheduler] Completed: 0 succeeded, 0 failed
```

## Troubleshooting

### Cron Not Running
**Check if extensions are enabled:**
```sql
SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
```

**Check if cron job exists:**
```sql
SELECT * FROM cron.job;
```

### Schedules Not Executing
**Check Edge Function logs** for errors

**Manually test the invoke function:**
```sql
SELECT public.invoke_price_change_scheduler();
```

**Check if service role key is correct** in the function

### Permission Errors
**Ensure pg_net has permissions:**
```sql
GRANT USAGE ON SCHEMA net TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres;
```

## Disable Automatic Scheduler (if needed)

If you ever need to stop the automatic scheduler:

```sql
-- Disable the cron job
SELECT cron.unschedule('price-change-scheduler');

-- Verify it's removed
SELECT * FROM cron.job WHERE jobname = 'price-change-scheduler';
-- Should return no rows
```

## Re-enable Later

Just run the setup SQL again to re-enable it.

## Success Indicators

✅ Cron job shows `active: true`
✅ Edge Function logs show activity every minute
✅ Test schedules execute automatically at scheduled time
✅ Pump prices update without manual intervention
✅ POS shows toast notifications when prices change

Once you see these indicators, the automatic scheduler is working perfectly!
