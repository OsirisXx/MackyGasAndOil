# Broadcast-Based Price Change Updates - Implementation Summary

## Problem Solved

**Issue:** POS terminals were experiencing `TIMED_OUT` errors when subscribing to price change updates using `postgres_changes`. This was caused by React 18 Strict Mode's double-mounting behavior creating race conditions with WebSocket connections.

**Root Cause:** 
- React 18 Strict Mode mounts → unmounts → remounts components in development
- This caused WebSocket subscriptions to be created and destroyed rapidly
- `postgres_changes` subscriptions couldn't handle this pattern reliably
- Result: `TIMED_OUT` status and no real-time updates

## Solution Implemented

Switched from `postgres_changes` to **broadcast with database triggers** (Supabase's recommended approach for production apps).

### Why Broadcast is Better

According to [Supabase's official documentation](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes):

> **Broadcast** is the recommended method for scalability and security.  
> **Postgres Changes** is a simpler method but does not scale as well as Broadcast.

**Benefits:**
- ✅ More stable WebSocket connections
- ✅ Multi-threaded (postgres_changes is single-threaded)
- ✅ Handles React 18 Strict Mode properly
- ✅ Better scalability for production
- ✅ Works reliably in both dev and prod environments

---

## Files Changed

### 1. **supabase/30_broadcast_price_changes.sql** (NEW)
Database migration that creates:
- `broadcast_price_change()` function - broadcasts to `price-changes:<branch_id>` topic
- Trigger on `price_change_notifications` table - fires on INSERT
- RLS policies for `realtime.messages` - allows anon users to receive broadcasts

### 2. **src/pages/POS.jsx** (MODIFIED)
Changed from:
```javascript
.channel('price-notifications')
.on('postgres_changes', { ... })
```

To:
```javascript
.channel(`price-changes:${branchId}`, {
  config: { 
    broadcast: { self: false },
    private: false  // Cashiers use anon key
  }
})
.on('broadcast', { event: 'INSERT' }, ...)
```

### 3. **DEPLOY_BROADCAST_FIX.md** (NEW)
Complete deployment guide with:
- Step-by-step instructions
- Testing procedures
- Troubleshooting tips
- Rollback plan

### 4. **BROADCAST_FIX_SUMMARY.md** (NEW - this file)
Implementation summary and next steps

---

## How It Works Now

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Edge Function executes price change schedule                │
│    └─> Inserts record into price_change_notifications table    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Database Trigger fires on INSERT                            │
│    └─> handle_price_change_notifications trigger               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Trigger Function calls realtime.broadcast_changes()         │
│    └─> Broadcasts to topic: price-changes:<branch_id>          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Supabase Realtime broadcasts via WebSocket                  │
│    └─> All POS terminals subscribed to that branch receive it  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. POS Client receives broadcast event                         │
│    └─> Fetches updated prices                                  │
│    └─> Compares old vs new prices                              │
│    └─> Shows alert modal with changes                          │
│    └─> Updates pump dropdown automatically                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Steps - Testing

### Step 1: Run Database Migration

Open Supabase SQL Editor and run:
```sql
-- Copy and paste contents of:
supabase/30_broadcast_price_changes.sql
```

**Verify it worked:**
```sql
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'handle_price_change_notifications';
-- Should return 1 row
```

### Step 2: Test in Development

```bash
npm run dev
```

**Expected console output:**
```
[Realtime] Subscribing to broadcast channel for branch: <branch_id>
[Realtime] Subscription status: SUBSCRIBED
[Realtime] Successfully subscribed to price change broadcasts
```

**Test the flow:**
1. Open POS as cashier (e.g., "test acc")
2. Open Admin → Pump Management in another tab
3. Schedule a price change for 1 minute from now
4. Wait for schedule to execute
5. Verify:
   - ✅ Console shows: `[Realtime] Price change broadcast received:`
   - ✅ Price change alert modal appears
   - ✅ Modal shows old → new prices
   - ✅ Cashier stays on POS (not kicked to shift selection)
   - ✅ Pump prices update in dropdown

### Step 3: Test in Production Build

```bash
npm run build
npm run preview
```

Repeat the same test flow. Should work identically (no Strict Mode issues).

### Step 4: Push to GitHub

Once all tests pass:
```bash
git add .
git commit -m "fix: switch to broadcast for price updates (resolves TIMED_OUT issue)"
git push origin main
```

---

## Expected Behavior Changes

### Before (postgres_changes)
```
❌ [Realtime] Subscription status: TIMED_OUT
❌ WebSocket connection failed
❌ No price updates received
❌ Manual refresh required
```

### After (broadcast)
```
✅ [Realtime] Subscription status: SUBSCRIBED
✅ [Realtime] Successfully subscribed to price change broadcasts
✅ [Realtime] Price change broadcast received: {...}
✅ Price change alert modal appears
✅ Prices update automatically
```

---

## Rollback Plan

If issues occur:

1. **Revert code changes:**
   ```bash
   git revert HEAD
   npm run build
   ```

2. **Drop database trigger:**
   ```sql
   DROP TRIGGER IF EXISTS handle_price_change_notifications ON price_change_notifications;
   DROP FUNCTION IF EXISTS broadcast_price_change();
   ```

---

## Technical Notes

### Why `private: false`?

Cashiers authenticate via QR/PIN, not `auth.users`, so they use the **anon** key (not authenticated). Setting `private: false` allows anon users to receive broadcasts. Access control is handled by RLS policies on `realtime.messages`.

### Why `broadcast: { self: false }`?

Prevents a client from receiving its own broadcasts. Not critical for this use case (Edge Function sends broadcasts, not clients), but good practice.

### Channel Naming Convention

Topic format: `price-changes:<branch_id>`

This ensures:
- Each branch has its own channel
- POS terminals only receive updates for their branch
- No cross-branch pollution

---

## Success Criteria

✅ Build completes without errors  
✅ Console shows `SUBSCRIBED` (not `TIMED_OUT`)  
✅ Price change alert appears when schedule executes  
✅ Alert shows correct old → new prices  
✅ Cashier stays on POS screen  
✅ Prices update automatically  
✅ Works in both dev and prod builds  

---

## References

- [Supabase: Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase: Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase: Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [GitHub Discussion: realtime-js changes](https://github.com/orgs/supabase/discussions/37869)

---

## Status

🟡 **Ready for Testing**

All code changes complete. Build passes. Ready for database migration and testing.
