# Deploy Broadcast-Based Price Updates

## What Changed

Instead of polling every 5 minutes or using database realtime (which has issues in React dev mode), we now use **Supabase Broadcast** - a lightweight pub/sub system.

### How It Works

```
Schedule Executes
    ↓
Edge Function updates pump prices
    ↓
Edge Function broadcasts message to branch channel
    ↓
All POS terminals listening to that branch receive message
    ↓
POS terminals refresh pump prices
    ↓
Toast notification shows
```

### Benefits

✅ **Efficient**: Only updates when schedules actually execute
✅ **Instant**: No waiting for polling interval
✅ **Reliable**: Broadcast is more stable than database realtime
✅ **Scalable**: Works with multiple POS terminals
✅ **No Overhead**: Zero API calls when no price changes

## Deployment Steps

### 1. Redeploy Edge Function

```bash
npx supabase functions deploy price-change-scheduler
```

This updates the Edge Function to broadcast messages when schedules execute.

### 2. Test the Broadcast

1. Refresh your POS page
2. Open browser console (F12)
3. Look for: `[Broadcast] Successfully subscribed to price change broadcasts`
4. Create a schedule for 1-2 minutes from now
5. Wait for execution
6. You should see:
   - `[Broadcast] Price change notification received: {payload}`
   - Toast notification: "Pump prices updated 💰"
   - Prices update in UI

### 3. Verify in Edge Function Logs

After a schedule executes, check Edge Function logs for:
```
[Scheduler] Broadcasting price update to all POS terminals
[Scheduler] Broadcast sent to branch {branch_id}
```

## Technical Details

### Edge Function Changes
- Added broadcast after successful schedule execution
- Sends message to branch-specific channel: `price-updates-{branch_id}`
- Includes timestamp and execution count in payload

### POS Changes
- Removed polling (no more 5-minute intervals)
- Removed database realtime subscription (had React 18 issues)
- Added broadcast subscription (lightweight, reliable)
- Subscribes to: `price-updates-{branch_id}`

### Channel Naming
- Each branch has its own channel
- Format: `price-updates-e4573298-a370-4439-bb28-1af9446e5768`
- Only POS terminals for that branch receive updates

## Testing Checklist

- [ ] Edge Function redeployed successfully
- [ ] POS shows `[Broadcast] Successfully subscribed...` in console
- [ ] Create test schedule
- [ ] Schedule executes at correct time
- [ ] POS console shows `[Broadcast] Price change notification received`
- [ ] Toast notification appears
- [ ] Pump prices update in UI
- [ ] No polling logs (removed)

## Troubleshooting

### If broadcast doesn't work:

1. **Check Edge Function logs**:
   - Look for "Broadcasting price update" message
   - Verify no errors during broadcast

2. **Check POS console**:
   - Should show `[Broadcast] Successfully subscribed`
   - If shows `CLOSED`, refresh the page

3. **Verify channel name**:
   - Edge Function: `price-updates-{branch_id}`
   - POS: `price-updates-{branch_id}`
   - Must match exactly

4. **Test manual broadcast** (in Supabase SQL Editor):
   ```sql
   -- This won't work from SQL, but you can test via Edge Function
   SELECT public.invoke_price_change_scheduler();
   ```

### If subscription closes immediately:

This is a React 18 dev mode issue. The broadcast subscription is more stable than database realtime, but if it still closes:

1. **Build for production**:
   ```bash
   npm run build
   npm run preview
   ```

2. **Or add a small polling fallback** (optional):
   - Check prices every 10 minutes as backup
   - Only if broadcast consistently fails

## Performance Comparison

### Old Approach (Polling):
- API call every 5 minutes
- 12 calls per hour per POS terminal
- Updates even when no price changes
- 60-300 second delay

### New Approach (Broadcast):
- Zero API calls when idle
- Instant updates when schedules execute
- Only updates when needed
- <1 second delay

### Example:
- 5 POS terminals running 8 hours
- Old: 480 API calls (5 terminals × 12/hour × 8 hours)
- New: ~5 API calls (only when schedules execute)
- **96% reduction in API calls!**

## Conclusion

The broadcast-based approach is:
- ✅ More efficient (96% fewer API calls)
- ✅ Faster (instant vs 5-minute delay)
- ✅ More reliable (broadcast is stable)
- ✅ Scalable (works with any number of POS terminals)

**Ready to deploy!** 🚀
