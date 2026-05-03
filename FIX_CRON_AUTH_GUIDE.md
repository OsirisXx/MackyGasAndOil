# Fix Cron Authentication Issue - Step by Step Guide

## Problem
The cron job was failing with `401 UNAUTHORIZED_INVALID_JWT_FORMAT` because it was using the new `sb_publishable_` key format, which is not compatible with Edge Function JWT verification.

## Solution
Use the **legacy JWT anon key** instead of the new publishable key format.

## Steps to Fix

### 1. Run the Fix SQL Script
Execute the `FIX_CRON_AUTH.sql` file in your Supabase SQL Editor:

```bash
# Copy the contents of FIX_CRON_AUTH.sql and paste into Supabase SQL Editor
# Or run it via Supabase CLI if you have it set up
```

This will:
- Update the `invoke_price_change_scheduler()` function to use the correct legacy JWT anon key
- Test the function immediately to verify it works

### 2. Verify the Fix

After running the SQL script, check the Edge Function logs:

1. Go to: **Edge Functions** → **price-change-scheduler** → **Logs**
2. Look for the most recent invocation
3. You should see:
   - Status: **200 OK** (not 401)
   - Response showing schedules processed successfully

### 3. Monitor Automatic Execution

The cron job runs every minute. Wait 1-2 minutes and check:

1. **Edge Function Logs**: Should show automatic invocations every minute with 200 status
2. **Scheduled Price Changes**: Create a test schedule for 1-2 minutes in the future
3. **Verify Execution**: The schedule should automatically execute and update pump prices

### 4. Test with a Real Schedule

1. Go to **Pump Management** in your app
2. Click **"Schedule Price Change"**
3. Set a schedule for 2 minutes from now
4. Select a pump and set a new price
5. Save the schedule
6. Wait for the scheduled time
7. Verify:
   - Schedule status changes to "Executed"
   - Pump price is updated
   - Edge Function logs show successful execution

## What Changed

### Before (WRONG):
```sql
'Authorization', 'Bearer sb_publishable_2KoBImVRHuoQ2GWmfMVWow_CzoMcVte'
```
- Used new publishable key format
- Not compatible with Edge Function JWT verification
- Resulted in 401 errors

### After (CORRECT):
```sql
'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaW54Z2Rxa2x6d2hoamt6cHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTQyMjMsImV4cCI6MjA4NjczMDIyM30.bsl6NT_Dhk8iL_zhB2TaFtlbrNgdCT-WtEDkqyOmW4E'
```
- Uses legacy JWT anon key
- Compatible with Edge Function JWT verification
- Works correctly with automatic cron invocation

## Why This Happened

According to [Supabase documentation](https://supabase.com/docs/guides/api/api-keys):

> **Edge Functions only support JWT verification via the anon and service_role JWT-based API keys.** You will need to use the `--no-verify-jwt` option when using publishable and secret keys.

Since we want automatic JWT verification (for security), we must use the legacy JWT keys.

## Alternative Approach (Not Recommended)

If you wanted to use the new `sb_publishable_` key, you would need to:
1. Redeploy the Edge Function with `--no-verify-jwt` flag
2. Implement custom authentication logic inside the Edge Function
3. Use `apikey` header instead of `Authorization` header

This is more complex and less secure, so we're sticking with the legacy JWT approach.

## Troubleshooting

### If you still see 401 errors:

1. **Check the function was updated:**
   ```sql
   SELECT prosrc FROM pg_proc WHERE proname = 'invoke_price_change_scheduler';
   ```
   Should show the new JWT key in the function body.

2. **Manually test the function:**
   ```sql
   SELECT public.invoke_price_change_scheduler();
   ```
   Check Edge Function logs immediately after running this.

3. **Verify cron job is active:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'price-change-scheduler';
   ```
   Should show `active = true`.

4. **Check Edge Function logs:**
   Look for the authorization header in the request logs to confirm it's using the JWT key.

## Success Indicators

✅ Edge Function logs show 200 status codes
✅ Automatic invocations happen every minute
✅ Test schedules execute at the correct time
✅ Pump prices update automatically
✅ No more 401 authentication errors

## Next Steps

Once confirmed working:
1. Create real price change schedules
2. Monitor for a few hours to ensure stability
3. Push changes to GitHub
4. Document the feature for your team
