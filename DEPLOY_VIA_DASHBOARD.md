# Deploy Scheduler via Supabase Dashboard

Since CLI linking has permission issues, let's deploy via the dashboard instead.

## Steps to Deploy

### 1. Go to Supabase Dashboard
Navigate to: https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/functions

### 2. Create New Function
- Click "Create a new function" or "New Edge Function"
- Function name: `price-change-scheduler`
- Click "Create"

### 3. Copy the Function Code

Open `supabase/functions/price-change-scheduler/index.ts` and copy ALL the code.

Or copy this:

```typescript
// ============================================================================
// Supabase Edge Function: price-change-scheduler
// Description: Monitors pending price change schedules and executes them
//              at the scheduled time. Runs every 60 seconds via cron.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    
    console.log('[Scheduler] Starting price change scheduler check...')
    
    // Find all pending schedules that are due (scheduled_at <= now)
    const { data: dueSchedules, error: fetchError } = await supabase
      .from('price_change_schedules')
      .select('id, scheduled_at, pump_ids, branch_id')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    
    if (fetchError) {
      console.error('[Scheduler] Error fetching due schedules:', fetchError)
      throw fetchError
    }
    
    console.log(`[Scheduler] Found ${dueSchedules?.length || 0} due schedules`)
    
    const results = []
    
    // Execute each schedule sequentially
    for (const schedule of dueSchedules || []) {
      console.log(`[Scheduler] Executing schedule ${schedule.id} (scheduled at ${schedule.scheduled_at})`)
      
      const { data, error } = await supabase.rpc(
        'execute_price_change_schedule',
        { p_schedule_id: schedule.id }
      )
      
      if (error) {
        console.error(`[Scheduler] Error executing schedule ${schedule.id}:`, error)
        results.push({
          schedule_id: schedule.id,
          success: false,
          error: error.message
        })
      } else {
        console.log(`[Scheduler] Schedule ${schedule.id} executed:`, data)
        results.push({
          schedule_id: schedule.id,
          success: data?.success || false,
          error: data?.error || null,
          pumps_updated: data?.pumps_updated || 0
        })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    
    console.log(`[Scheduler] Completed: ${successCount} succeeded, ${failureCount} failed`)
    
    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        processed: results.length,
        succeeded: successCount,
        failed: failureCount,
        results
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
    
  } catch (error) {
    console.error('[Scheduler] Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
})
```

### 4. Paste and Deploy
- Paste the code into the function editor
- Click "Deploy" or "Save"

### 5. Set Up Cron Schedule

**Option A: Via Dashboard (if available)**
- In the function settings, look for "Cron Jobs" or "Schedules"
- Add schedule: `* * * * *` (every minute)
- Save

**Option B: Via SQL (if cron UI not available)**
Run this in SQL Editor:

```sql
-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function to run every minute
SELECT cron.schedule(
  'price-change-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://obinxgdqklzwhhjkzpxu.supabase.co/functions/v1/price-change-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Option C: Use Supabase's Built-in Cron (Recommended)**

Supabase Edge Functions support cron natively. Create a file at:
`supabase/functions/price-change-scheduler/cron.yml`

With content:
```yaml
- name: "price-change-scheduler"
  schedule: "* * * * *"
  function: "price-change-scheduler"
```

Then redeploy the function.

### 6. Test the Function

**Manual Test:**
Go to the function page and click "Invoke" or "Test" to run it manually.

**Check Logs:**
- Go to function logs
- Should see: `[Scheduler] Starting price change scheduler check...`
- Should see: `[Scheduler] Found X due schedules`

### 7. Verify It's Working

After deployment:

1. **Check your pending schedule:**
   - Go to http://localhost:5173/admin/pump-management
   - Click "View Schedules"
   - The overdue schedule should execute within 1 minute

2. **Check pump prices:**
   - Refresh the pump list
   - Price should update to ₱65.17

3. **Check schedule status:**
   - Schedule should show "Executed" status
   - Should show execution timestamp

## Troubleshooting

### Function Not Running
- Check if function is deployed (green status)
- Check if cron schedule is active
- Look at function logs for errors

### Schedule Not Executing
- Check function logs for errors
- Verify `execute_price_change_schedule` function exists in database
- Check service role key is set correctly

### Permission Errors
- Ensure service role key is set in function environment variables
- Check RLS policies are correct (should allow authenticated users)

## Alternative: Manual Execution

If you just want to test without cron, you can manually invoke the function:

```bash
curl -X POST https://obinxgdqklzwhhjkzpxu.supabase.co/functions/v1/price-change-scheduler \
  -H "Authorization: Bearer YOUR-ANON-KEY"
```

Or use the "Invoke" button in the Supabase dashboard.
