# Deploy Price Change Scheduler

## Why the Price Didn't Change Automatically

The scheduler Edge Function needs to be deployed to Supabase. This function runs every 60 seconds and checks for pending schedules that need to be executed.

## Option 1: Deploy via Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu
   - Click on "Edge Functions" in the left sidebar

2. **Create New Function**
   - Click "Create a new function"
   - Name: `price-change-scheduler`
   - Click "Create function"

3. **Copy the Code**
   - Open `supabase/functions/price-change-scheduler/index.ts`
   - Copy all the code
   - Paste it into the function editor in Supabase Dashboard
   - Click "Deploy"

4. **Set Environment Variables** (if not already set)
   - In the function settings, ensure these are set:
     - `SUPABASE_URL`: Your Supabase URL
     - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (from Settings > API)

5. **Enable Cron Schedule**
   - In the function settings, find "Cron Jobs"
   - Add a new cron job:
     - Schedule: `* * * * *` (every minute)
     - Function: `price-change-scheduler`
   - Save

## Option 2: Install Supabase CLI and Deploy

### Install Supabase CLI

**Windows (PowerShell):**
```powershell
scoop install supabase
```

Or download from: https://github.com/supabase/cli/releases

**After Installation:**
```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref obinxgdqklzwhhjkzpxu

# Deploy the function
supabase functions deploy price-change-scheduler

# Verify deployment
supabase functions list
```

## Option 3: Manual Execution (For Testing)

If you just want to test the scheduler without deploying, you can manually execute the schedule:

1. **Go to Supabase SQL Editor**

2. **Run this SQL to manually execute a pending schedule:**
   ```sql
   -- Find pending schedules
   SELECT id, scheduled_at, status 
   FROM price_change_schedules 
   WHERE status = 'pending' 
   AND scheduled_at <= now();

   -- Execute a specific schedule (replace with actual ID)
   SELECT execute_price_change_schedule('YOUR-SCHEDULE-ID-HERE');
   ```

3. **Check the result:**
   ```sql
   -- Check if prices were updated
   SELECT id, pump_number, pump_name, price_per_liter, updated_at
   FROM pumps
   ORDER BY updated_at DESC;

   -- Check schedule status
   SELECT id, status, executed_at, error_message
   FROM price_change_schedules
   WHERE id = 'YOUR-SCHEDULE-ID-HERE';
   ```

## Verify Scheduler is Working

After deployment, check:

1. **Function Logs** (in Supabase Dashboard > Edge Functions > price-change-scheduler > Logs)
   - Should see logs every 60 seconds
   - Look for: `[Scheduler] Starting price change scheduler check...`

2. **Test with a New Schedule**
   - Create a schedule for 2 minutes in the future
   - Wait for the scheduled time
   - Check if:
     - Schedule status changed to 'executed'
     - Pump prices updated
     - Notification created

## Troubleshooting

### Scheduler Not Running
- Check Edge Function logs for errors
- Verify cron schedule is enabled
- Check service role key is set correctly

### Schedule Not Executing
- Check schedule status in database
- Look for error_message in price_change_schedules table
- Check Edge Function logs for execution errors

### Prices Not Updating
- Verify execute_price_change_schedule function exists
- Check pump IDs in schedule are valid
- Look for transaction errors in logs

## Current Status

Your schedule shows:
- **Status:** Pending (Overdue)
- **Scheduled:** May 3, 2026, 5:22 PM
- **Pumps:** 1 pump affected
- **Price:** ₱65.17

Once the scheduler is deployed, it will:
1. Detect this overdue schedule
2. Execute it immediately (missed schedule recovery)
3. Update the pump price to ₱65.17
4. Change status to 'executed'
5. Create a notification

## Quick Test Command

To manually test the execution right now:

```sql
-- Get the schedule ID from the UI or run:
SELECT id FROM price_change_schedules WHERE status = 'pending' LIMIT 1;

-- Execute it manually:
SELECT execute_price_change_schedule('PASTE-SCHEDULE-ID-HERE');

-- Verify:
SELECT * FROM pumps WHERE updated_at > now() - interval '1 minute';
```
