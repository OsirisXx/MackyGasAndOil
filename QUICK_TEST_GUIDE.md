# Quick Test Guide - Broadcast Price Updates

## 🚀 Quick Start (5 minutes)

### 1. Run Migration (30 seconds)
```sql
-- In Supabase SQL Editor, paste and run:
-- File: supabase/30_broadcast_price_changes.sql
```

### 2. Start Dev Server (10 seconds)
```bash
npm run dev
```

### 3. Test the Flow (3 minutes)

**Tab 1 - POS Terminal:**
1. Go to `http://localhost:5173`
2. Login as cashier (e.g., "test acc")
3. Open browser console (F12)
4. Look for: `[Realtime] Subscription status: SUBSCRIBED` ✅

**Tab 2 - Admin Panel:**
1. Go to `http://localhost:5173/admin/pump-management`
2. Click "Schedule Price Change"
3. Select a pump (e.g., "#1 Diesel")
4. Set new price (e.g., ₱95.17 → ₱96.00)
5. Schedule for **1 minute from now**
6. Click "Schedule Change"

**Back to Tab 1 - Watch POS:**
- Wait 1 minute for schedule to execute
- Console should show: `[Realtime] Price change broadcast received:` ✅
- Price change alert modal should appear ✅
- Modal shows: "Diesel: ₱95.17 → ₱96.00" ✅
- Click "OK" to dismiss
- Pump dropdown now shows new price ✅

---

## ✅ Success Checklist

Console Output:
- [ ] `[Realtime] Subscribing to broadcast channel for branch: <id>`
- [ ] `[Realtime] Subscription status: SUBSCRIBED`
- [ ] `[Realtime] Successfully subscribed to price change broadcasts`
- [ ] `[Realtime] Price change broadcast received: {...}`

UI Behavior:
- [ ] Price change alert modal appears
- [ ] Modal shows correct old → new prices
- [ ] Cashier stays on POS screen (not kicked out)
- [ ] Pump prices update automatically in dropdown

---

## ❌ Troubleshooting

### Issue: `TIMED_OUT` in console

**Fix:** Run the migration first!
```sql
-- In Supabase SQL Editor:
\i supabase/30_broadcast_price_changes.sql
```

### Issue: No broadcast received

**Check trigger exists:**
```sql
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'handle_price_change_notifications';
```

**Manually test:**
```sql
-- Insert test notification
INSERT INTO price_change_notifications (branch_id, pump_ids, schedule_id)
VALUES ('your-branch-id', ARRAY['pump-id'], 'test-id');

-- Check POS console for broadcast
```

### Issue: WebSocket closes immediately

**This is normal in development** (React 18 Strict Mode).

Test in production build:
```bash
npm run build
npm run preview
```

---

## 🎯 What Changed?

**Before:**
```javascript
// ❌ Old approach (postgres_changes)
.channel('price-notifications')
.on('postgres_changes', { table: 'price_change_notifications' })
```

**After:**
```javascript
// ✅ New approach (broadcast)
.channel(`price-changes:${branchId}`)
.on('broadcast', { event: 'INSERT' })
```

**Why?** Broadcast is Supabase's recommended approach for scalability and handles React 18 Strict Mode properly.

---

## 📊 Expected Console Output

```
[Realtime] Subscribing to broadcast channel for branch: e4573298-a370-4439-bb28-1af9446e5768
[Realtime] Subscription status: SUBSCRIBED
[Realtime] Successfully subscribed to price change broadcasts

// ... wait for schedule to execute ...

[Realtime] Price change broadcast received: {
  payload: {
    new: { branch_id: "...", pump_ids: [...], ... }
  }
}
```

---

## 🔄 Full Test Cycle

1. **Migration** → Run SQL (30s)
2. **Dev Server** → `npm run dev` (10s)
3. **Login** → POS as cashier (10s)
4. **Schedule** → Admin panel, set price change (30s)
5. **Wait** → 1 minute for execution
6. **Verify** → Alert appears, prices update (10s)
7. **Production** → `npm run build && npm run preview` (1m)
8. **Repeat** → Test again in production build (2m)
9. **Push** → `git push` when all tests pass

**Total Time:** ~5-7 minutes

---

## 🎉 Done!

Once all checks pass, you're ready to push:

```bash
git add .
git commit -m "fix: switch to broadcast for price updates (resolves TIMED_OUT)"
git push origin main
```
