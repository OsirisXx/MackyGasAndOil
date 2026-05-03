# Testing Checklist - Broadcast Price Updates

## Pre-Testing Setup

- [ ] **Database Migration Run**
  ```sql
  -- In Supabase SQL Editor, run:
  -- File: supabase/30_broadcast_price_changes.sql
  ```

- [ ] **Verify Trigger Created**
  ```sql
  SELECT trigger_name, event_object_table 
  FROM information_schema.triggers 
  WHERE trigger_name = 'handle_price_change_notifications';
  -- Should return 1 row
  ```

- [ ] **Verify RLS Policies**
  ```sql
  SELECT policyname, tablename 
  FROM pg_policies 
  WHERE schemaname = 'realtime' AND tablename = 'messages';
  -- Should show policies for anon and authenticated users
  ```

---

## Development Testing

### Test 1: Subscription Establishment

- [ ] Start dev server: `npm run dev`
- [ ] Open POS: `http://localhost:5173`
- [ ] Login as cashier (e.g., "test acc")
- [ ] Open browser console (F12)
- [ ] **Verify console shows:**
  ```
  [Realtime] Subscribing to broadcast channel for branch: <branch_id>
  [Realtime] Subscription status: SUBSCRIBED
  [Realtime] Successfully subscribed to price change broadcasts
  ```
- [ ] **NO `TIMED_OUT` errors**

### Test 2: Price Change Flow

- [ ] Keep POS open in Tab 1
- [ ] Open Tab 2: `http://localhost:5173/admin/pump-management`
- [ ] Click "Schedule Price Change"
- [ ] Select pump: "#1 Diesel"
- [ ] Current price: ₱95.17
- [ ] New price: ₱96.00
- [ ] Schedule time: **1 minute from now**
- [ ] Click "Schedule Change"
- [ ] **Wait 1 minute** (schedule executes at top of minute)

### Test 3: Broadcast Reception

After schedule executes:

- [ ] **Console shows:**
  ```
  [Realtime] Price change broadcast received: { payload: {...} }
  ```
- [ ] **Price change alert modal appears**
- [ ] **Modal shows:** "Diesel: ₱95.17 → ₱96.00"
- [ ] **Cashier stays on POS screen** (not kicked to shift selection)
- [ ] Click "OK" to dismiss modal
- [ ] **Pump dropdown shows new price:** ₱96.00

### Test 4: Multiple Pumps

- [ ] Schedule price change for multiple pumps
- [ ] Select: "#1 Diesel" and "#2 Premium"
- [ ] Set different prices for each
- [ ] Schedule for 1 minute from now
- [ ] **Wait for execution**
- [ ] **Verify modal shows all changes:**
  ```
  Diesel: ₱95.17 → ₱96.00
  Premium: ₱89.95 → ₱90.50
  ```

### Test 5: React Strict Mode Handling

- [ ] Verify `main.jsx` has `<React.StrictMode>`
- [ ] Refresh POS page
- [ ] **Console may show double subscription** (expected in dev)
- [ ] **Final status should be:** `SUBSCRIBED`
- [ ] **NO `TIMED_OUT` errors**
- [ ] Schedule a price change
- [ ] **Broadcast still received correctly**

---

## Production Build Testing

### Test 6: Production Build

- [ ] Build: `npm run build`
- [ ] **Build succeeds** (no errors)
- [ ] Preview: `npm run preview`
- [ ] Open: `http://localhost:4173`
- [ ] Login as cashier
- [ ] **Console shows:** `SUBSCRIBED`
- [ ] Schedule price change
- [ ] **Broadcast received**
- [ ] **Alert modal appears**
- [ ] **Prices update**

### Test 7: Production Stability

- [ ] Keep POS open for 5 minutes
- [ ] **Connection stays:** `SUBSCRIBED`
- [ ] **NO reconnection attempts**
- [ ] **NO `TIMED_OUT` errors**
- [ ] Schedule another price change
- [ ] **Still receives broadcast**

---

## Edge Cases

### Test 8: Multiple POS Terminals

- [ ] Open POS in 2 browser tabs (same branch)
- [ ] Both show: `SUBSCRIBED`
- [ ] Schedule price change
- [ ] **Both terminals receive broadcast**
- [ ] **Both show alert modal**
- [ ] **Both update prices**

### Test 9: Different Branches

- [ ] Open POS for Branch A in Tab 1
- [ ] Open POS for Branch B in Tab 2
- [ ] Schedule price change for Branch A only
- [ ] **Tab 1 (Branch A) receives broadcast** ✅
- [ ] **Tab 2 (Branch B) does NOT receive broadcast** ✅
- [ ] Verify branch isolation works

### Test 10: Network Interruption

- [ ] Open POS, verify `SUBSCRIBED`
- [ ] Open DevTools → Network tab
- [ ] Throttle to "Offline"
- [ ] **Console shows:** `CHANNEL_ERROR` or disconnection
- [ ] Set back to "Online"
- [ ] **Connection auto-reconnects**
- [ ] **Status returns to:** `SUBSCRIBED`
- [ ] Schedule price change
- [ ] **Broadcast received after reconnection**

### Test 11: Page Refresh

- [ ] Open POS, verify `SUBSCRIBED`
- [ ] Refresh page (F5)
- [ ] **Re-subscribes automatically**
- [ ] **Status:** `SUBSCRIBED`
- [ ] Schedule price change
- [ ] **Broadcast received**

### Test 12: Cashier Logout/Login

- [ ] Login as cashier, verify `SUBSCRIBED`
- [ ] Click "End Shift"
- [ ] **Subscription cleaned up**
- [ ] Login again
- [ ] **Re-subscribes automatically**
- [ ] **Status:** `SUBSCRIBED`

---

## Performance Testing

### Test 13: Rapid Price Changes

- [ ] Schedule 3 price changes, 1 minute apart
- [ ] **All 3 broadcasts received**
- [ ] **All 3 alerts shown**
- [ ] **No missed updates**
- [ ] **No duplicate alerts**

### Test 14: Large Price Change

- [ ] Schedule price change for all pumps (3+ pumps)
- [ ] **Single broadcast received**
- [ ] **Modal shows all pump changes**
- [ ] **All prices update correctly**

---

## Regression Testing

### Test 15: Existing Features Still Work

- [ ] **Record Cash Sale** works
- [ ] **Create Purchase Order** works
- [ ] **Product Sales** work
- [ ] **Vault Deposits** work
- [ ] **Pump Readings** work
- [ ] **Accountability Report** works
- [ ] **Shift Selection** works
- [ ] **No new errors in console**

---

## Rollback Testing (Optional)

### Test 16: Rollback Procedure

- [ ] Drop trigger:
  ```sql
  DROP TRIGGER IF EXISTS handle_price_change_notifications ON price_change_notifications;
  DROP FUNCTION IF EXISTS broadcast_price_change();
  ```
- [ ] Revert code: `git revert HEAD`
- [ ] Rebuild: `npm run build`
- [ ] **App still works** (falls back to manual refresh)

---

## Final Verification

### Test 17: End-to-End Flow

- [ ] Fresh browser session (clear cache)
- [ ] Login as cashier
- [ ] Verify `SUBSCRIBED`
- [ ] Admin schedules price change
- [ ] **Broadcast received within 1 minute**
- [ ] **Alert shows correct prices**
- [ ] **Cashier stays on POS**
- [ ] **Prices update automatically**
- [ ] Record a sale with new price
- [ ] **Sale uses updated price**

---

## Success Criteria

### Must Pass (Critical)
- ✅ Console shows `SUBSCRIBED` (not `TIMED_OUT`)
- ✅ Broadcast received when schedule executes
- ✅ Alert modal appears with correct prices
- ✅ Cashier stays on POS screen
- ✅ Prices update automatically
- ✅ Works in both dev and prod builds

### Should Pass (Important)
- ✅ Multiple terminals receive broadcasts
- ✅ Branch isolation works
- ✅ Auto-reconnects after network interruption
- ✅ No duplicate alerts
- ✅ Existing features unaffected

### Nice to Have (Optional)
- ✅ Handles rapid price changes
- ✅ Rollback procedure works
- ✅ Performance is acceptable

---

## Sign-Off

**Tested By:** _______________  
**Date:** _______________  
**Environment:** [ ] Development [ ] Production  
**Result:** [ ] Pass [ ] Fail  

**Notes:**
```
(Add any observations, issues, or comments here)
```

---

## Next Steps After Testing

If all tests pass:

1. **Commit changes:**
   ```bash
   git add .
   git commit -m "fix: switch to broadcast for price updates (resolves TIMED_OUT)"
   ```

2. **Push to GitHub:**
   ```bash
   git push origin main
   ```

3. **Deploy to production:**
   - Run migration in production Supabase
   - Deploy updated frontend
   - Monitor for issues

4. **Document in changelog:**
   - Add entry to CHANGELOG.md
   - Note the fix for TIMED_OUT issue
   - Reference Supabase broadcast documentation

---

## Troubleshooting Reference

| Issue | Cause | Fix |
|-------|-------|-----|
| `TIMED_OUT` | Migration not run | Run `30_broadcast_price_changes.sql` |
| No broadcast | Trigger missing | Verify trigger exists in database |
| Wrong branch | Topic mismatch | Check `branchId` in channel name |
| Duplicate alerts | Multiple subscriptions | Check cleanup in useEffect |
| No reconnect | WebSocket closed | Refresh page or check network |

---

## Documentation Links

- [DEPLOY_BROADCAST_FIX.md](./DEPLOY_BROADCAST_FIX.md) - Full deployment guide
- [BROADCAST_ARCHITECTURE.md](./BROADCAST_ARCHITECTURE.md) - System architecture
- [QUICK_TEST_GUIDE.md](./QUICK_TEST_GUIDE.md) - Quick 5-minute test
- [BROADCAST_FIX_SUMMARY.md](./BROADCAST_FIX_SUMMARY.md) - Implementation summary
