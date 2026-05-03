# Deploy Broadcast-Based Price Change Updates

This guide walks through deploying the improved real-time price update system using Supabase Realtime's **broadcast** feature instead of `postgres_changes`.

## Why This Change?

**Problem:** The previous implementation using `postgres_changes` was timing out in React 18 Strict Mode due to WebSocket connection issues during component double-mounting.

**Solution:** Supabase officially recommends using **broadcast with database triggers** for better scalability and reliability. This approach:
- ✅ More stable WebSocket connections
- ✅ Better scalability (broadcast is multi-threaded, postgres_changes is single-threaded)
- ✅ Works reliably in both development and production
- ✅ Handles React 18 Strict Mode properly

**Reference:** [Supabase Docs - Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

---

## Deployment Steps

### Step 1: Run Database Migration

Run the new migration in Supabase SQL Editor:

```bash
# Copy the contents of this file:
supabase/30_broadcast_price_changes.sql
```

**What it does:**
1. Creates `broadcast_price_change()` function that broadcasts to `price-changes:<branch_id>` topic
2. Creates trigger on `price_change_notifications` table to auto-broadcast on INSERT
3. Sets up RLS policies for `realtime.messages` to allow anon users to receive broadcasts

**Verify it worked:**
```sql
-- Check trigger exists
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'handle_price_change_notifications';

-- Should return 1 row showing the trigger
```

---

### Step 2: Test in Development

The code changes are already applied to `src/pages/POS.jsx`. Test locally:

```bash
npm run dev
```

**What to look for in console:**
```
[Realtime] Subscribing to broadcast channel for branch: <branch_id>
[Realtime] Subscription status: SUBSCRIBED
[Realtime] Successfully subscribed to price change broadcasts
```

**Test the flow:**
1. Open POS as a cashier
2. In another tab, go to Admin → Pump Management
3. Schedule a price change for 1 minute from now
4. Wait for the schedule to execute
5. POS should show:
   - Console: `[Realtime] Price change broadcast received:`
   - UI: Price change alert modal with old → new prices
   - Cashier stays on POS screen (not kicked to shift selection)
   - Pump prices update automatically in dropdown

---

### Step 3: Verify No More Timeouts

**Before (with postgres_changes):**
```
[Realtime] Subscription status: TIMED_OUT
WebSocket connection failed
```

**After (with broadcast):**
```
[Realtime] Subscription status: SUBSCRIBED
[Realtime] Successfully subscribed to price change broadcasts
```

If you still see `TIMED_OUT`, check:
1. Migration ran successfully (Step 1)
2. Supabase project is on latest version
3. No network/firewall issues blocking WebSocket connections

---

### Step 4: Build and Test Production

Once development testing passes:

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

Test the same flow in production build to ensure it works without Strict Mode interference.

---

### Step 5: Push to GitHub

Once everything works:

```bash
git add .
git commit -m "fix: switch to broadcast for price change updates (fixes TIMED_OUT issue)"
git push origin main
```

---

## Technical Details

### How It Works

1. **Edge Function** (`price-change-scheduler`) executes a schedule
2. **Edge Function** inserts record into `price_change_notifications` table
3. **Database Trigger** (`handle_price_change_notifications`) fires on INSERT
4. **Trigger Function** (`broadcast_price_change()`) calls `realtime.broadcast_changes()`
5. **Supabase Realtime** broadcasts to topic `price-changes:<branch_id>`
6. **POS Client** receives broadcast event via WebSocket subscription
7. **POS** fetches updated prices, compares old vs new, shows alert modal

### Channel Configuration

```javascript
supabase.channel(`price-changes:${branchId}`, {
  config: { 
    broadcast: { self: false },  // Don't receive own broadcasts
    private: false               // Use anon key (cashiers aren't auth.users)
  }
})
```

### Why `private: false`?

Cashiers authenticate via QR/PIN, not `auth.users`, so they use the **anon** key. Setting `private: false` allows anon users to receive broadcasts. The RLS policy on `realtime.messages` controls access.

---

## Rollback Plan

If issues occur, you can revert to the previous approach:

1. **Revert POS.jsx:**
   ```bash
   git revert HEAD
   ```

2. **Drop the trigger:**
   ```sql
   DROP TRIGGER IF EXISTS handle_price_change_notifications ON price_change_notifications;
   DROP FUNCTION IF EXISTS broadcast_price_change();
   ```

---

## Troubleshooting

### Issue: Still seeing TIMED_OUT

**Cause:** Migration didn't run or RLS policies missing

**Fix:**
```sql
-- Re-run the migration
\i supabase/30_broadcast_price_changes.sql

-- Verify policies exist
SELECT * FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages';
```

### Issue: No broadcast received

**Cause:** Trigger not firing or topic name mismatch

**Fix:**
```sql
-- Check trigger exists
SELECT * FROM information_schema.triggers WHERE trigger_name = 'handle_price_change_notifications';

-- Manually test trigger
INSERT INTO price_change_notifications (branch_id, pump_ids, schedule_id)
VALUES ('your-branch-id', ARRAY['pump-id'], 'test-schedule-id');

-- Check POS console for broadcast
```

### Issue: WebSocket closes immediately

**Cause:** React 18 Strict Mode double-mounting (development only)

**Fix:** This is expected in development. Test in production build:
```bash
npm run build && npm run preview
```

---

## Success Criteria

✅ Console shows `SUBSCRIBED` status (not `TIMED_OUT`)  
✅ Price change alert modal appears when schedule executes  
✅ Modal shows correct old → new prices  
✅ Cashier stays on POS screen (not kicked to shift selection)  
✅ Pump prices update automatically in dropdown  
✅ Works in both development and production builds  

---

## References

- [Supabase Docs: Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Docs: Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase Discussion: realtime-js changes affecting Node.js](https://github.com/orgs/supabase/discussions/37869)
