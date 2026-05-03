# Deploy Price Change Notifications System

## Overview

This system uses **database triggers** instead of broadcast channels for more reliable real-time price updates. When the Edge Function executes a schedule, it inserts a record into the `price_change_notifications` table, which the POS listens to using Supabase Realtime (postgres_changes).

### Why This Approach?

✅ **More Reliable**: postgres_changes is more stable than broadcast channels
✅ **Event-Driven**: Only triggers when schedules actually execute
✅ **No Polling**: Zero overhead when no price changes occur
✅ **Works in Dev Mode**: No React Strict Mode issues

---

## Deployment Steps

### 1. Run Database Migration

```bash
# Apply the price_change_notifications table migration
psql -h db.obinxgdqklzwhhjkzpxu.supabase.co -U postgres -d postgres -f supabase/29_price_change_notifications.sql
```

Or run in Supabase SQL Editor:
- Open: https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/sql/new
- Copy contents of `supabase/29_price_change_notifications.sql`
- Click "Run"

### 2. Redeploy Edge Function

```bash
npx supabase functions deploy price-change-scheduler
```

This updates the Edge Function to insert notification records instead of broadcasting.

### 3. Test the System

1. **Refresh your POS page**
2. **Check console** - you should see:
   ```
   [Realtime] Subscribing to price_change_notifications for branch: ...
   [Realtime] Successfully subscribed to price change notifications
   ```
3. **Create a test schedule** for 1-2 minutes from now
4. **Wait for execution**
5. **Observe**:
   - Console shows: `[Realtime] Price change notification received: {...}`
   - Price change alert modal appears
   - Modal shows old → new prices
   - Cashier stays on POS screen
   - Prices update in dropdown

---

## How It Works

### Flow Diagram

```
Schedule Executes
    ↓
Edge Function calls execute_price_change_schedule()
    ↓
Pump prices updated in database
    ↓
Edge Function inserts record into price_change_notifications table
    ↓
Supabase Realtime detects INSERT
    ↓
POS receives postgres_changes event
    ↓
POS captures old prices, fetches new prices, compares
    ↓
Price change alert modal appears
    ↓
Cashier acknowledges and continues working
```

### Technical Details

**Database Table**: `price_change_notifications`
- Stores: branch_id, pump_ids, schedule_id, created_at
- RLS enabled: Users can only see notifications for their branch
- Auto-cleanup: Records older than 1 hour are deleted

**Edge Function**: `price-change-scheduler`
- After executing schedule, inserts notification record
- Calls `cleanup_old_price_notifications()` to remove old records

**POS Component**: `src/pages/POS.jsx`
- Subscribes to postgres_changes on `price_change_notifications` table
- Filters by branch_id
- Captures old prices, fetches new prices, shows modal

---

## Troubleshooting

### If notifications don't appear:

1. **Check database migration**:
   ```sql
   SELECT * FROM price_change_notifications ORDER BY created_at DESC LIMIT 5;
   ```
   - Should show recent notification records after schedule execution

2. **Check Edge Function logs**:
   - Look for: `[Scheduler] Notification inserted for branch ...`
   - If missing, check for errors in Edge Function execution

3. **Check POS console**:
   - Should show: `[Realtime] Successfully subscribed to price change notifications`
   - If shows "TIMED_OUT", check Supabase Realtime status

4. **Check RLS policies**:
   ```sql
   SELECT * FROM price_change_notifications WHERE branch_id = 'your-branch-id';
   ```
   - Should return records (if RLS is blocking, you'll see nothing)

5. **Verify realtime is enabled**:
   ```sql
   SELECT schemaname, tablename 
   FROM pg_publication_tables 
   WHERE pubname = 'supabase_realtime' 
   AND tablename = 'price_change_notifications';
   ```
   - Should return 1 row

---

## Comparison: Broadcast vs Database Notifications

### Broadcast Channels (Old Approach)
❌ WebSocket connection issues in dev mode
❌ React Strict Mode double-mounting problems
❌ Connection timeouts
❌ No persistence (if POS is offline, message is lost)

### Database Notifications (New Approach)
✅ More reliable postgres_changes subscription
✅ Works in dev mode
✅ No double-mounting issues
✅ Persistent (records stored in database)
✅ Can query history if needed

---

## Maintenance

### Clean Up Old Notifications

The system automatically cleans up notifications older than 1 hour. To manually clean up:

```sql
DELETE FROM price_change_notifications WHERE created_at < NOW() - INTERVAL '1 hour';
```

Or call the function:

```sql
SELECT cleanup_old_price_notifications();
```

### Monitor Notification Volume

```sql
-- Count notifications in last 24 hours
SELECT COUNT(*) FROM price_change_notifications 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Count by branch
SELECT branch_id, COUNT(*) 
FROM price_change_notifications 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY branch_id;
```

---

## Success Criteria

✅ **Database Migration**: `price_change_notifications` table exists
✅ **Edge Function**: Inserts notification records after schedule execution
✅ **POS Subscription**: Shows "Successfully subscribed" in console
✅ **Real-time Updates**: Price change alert modal appears when schedule executes
✅ **No Polling**: Zero API calls when no price changes occur
✅ **Shift Persistence**: Cashier stays on POS screen during updates

---

## Next Steps

1. **Deploy the migration** (Step 1 above)
2. **Redeploy Edge Function** (Step 2 above)
3. **Test with real schedule** (Step 3 above)
4. **Monitor for 24 hours** to ensure stability
5. **Push to GitHub** when testing is complete

---

**Status**: Ready for Deployment

**Date**: May 3, 2026

**Files**:
- `supabase/29_price_change_notifications.sql` - Database migration
- `supabase/functions/price-change-scheduler/index.ts` - Updated Edge Function
- `src/pages/POS.jsx` - Updated POS component
