# Enable Real-Time Price Updates in POS

## Problem
When a scheduled price change executes, cashiers have to manually refresh the page to see the updated pump prices in the POS terminal.

## Solution
Enable Supabase Realtime for the `pumps` table so that price updates are automatically pushed to all connected POS terminals.

## How It Works

### Current Implementation (Already in POS.jsx)
The POS already has a real-time subscription set up:

```javascript
// Subscribe to pump price changes for real-time updates
useEffect(() => {
  const channel = supabase
    .channel('pump_price_changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pumps',
        filter: `branch_id=eq.${branchId}`
      },
      (payload) => {
        console.log('Pump price updated:', payload)
        // Refresh pumps to get new prices
        fetchPumps(branchId)
        toast.success('Pump prices updated', {
          icon: '💰',
          duration: 3000
        })
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [cashier?.branch_id, selectedBranchId])
```

### What Was Missing
The `pumps` table was not added to the Supabase Realtime publication, so the subscription wasn't receiving events.

## Steps to Enable

### 1. Run the Migration
Execute `supabase/28_enable_pumps_realtime.sql` in your Supabase SQL Editor:

```bash
# Copy the contents of supabase/28_enable_pumps_realtime.sql
# Paste into Supabase SQL Editor and run
```

This migration does two things:
1. **Adds pumps table to realtime publication**: `ALTER PUBLICATION supabase_realtime ADD TABLE public.pumps;`
2. **Sets replica identity to FULL**: Ensures all column values (including the new price) are included in realtime events

### 2. Verify Realtime is Enabled

After running the migration, verify in Supabase Dashboard:

1. Go to: **Database** → **Replication**
2. Look for `supabase_realtime` publication
3. Verify `pumps` table is listed

### 3. Test the Real-Time Updates

#### Test Scenario 1: Scheduled Price Change
1. Open POS terminal on one device/tab
2. On another device/tab, go to **Pump Management**
3. Create a price change schedule for 1-2 minutes from now
4. Wait for the scheduled time
5. **Expected Result**: 
   - POS automatically shows toast: "Pump prices updated 💰"
   - Pump prices update without page refresh
   - Console shows: "Pump price updated: {payload}"

#### Test Scenario 2: Manual Price Change
1. Open POS terminal
2. In Supabase Dashboard, manually update a pump price:
   ```sql
   UPDATE pumps 
   SET price_per_liter = 99.99 
   WHERE pump_name = 'Pump 1';
   ```
3. **Expected Result**: POS immediately shows the new price

### 4. Monitor Real-Time Events

Open browser console in POS terminal to see real-time events:

```javascript
// You should see logs like:
Pump price updated: {
  eventType: 'UPDATE',
  new: { id: '...', price_per_liter: 99.99, ... },
  old: { id: '...', price_per_liter: 95.00, ... }
}
```

## What Happens When Price Changes

### Flow Diagram
```
Scheduled Time Reached
        ↓
Edge Function Executes
        ↓
execute_price_change_schedule() runs
        ↓
UPDATE pumps SET price_per_liter = ...
        ↓
Postgres triggers realtime event
        ↓
Supabase broadcasts to all subscribers
        ↓
POS.jsx subscription receives event
        ↓
fetchPumps() refreshes pump data
        ↓
Toast notification shows
        ↓
UI updates with new prices
```

### Timeline
- **T+0ms**: Schedule executes, pumps table updated
- **T+50ms**: Realtime event broadcast
- **T+100ms**: POS subscription receives event
- **T+150ms**: fetchPumps() called
- **T+300ms**: UI updates with new prices
- **T+300ms**: Toast notification appears

## Benefits

✅ **No Manual Refresh**: Cashiers see price updates instantly
✅ **Multi-Terminal Support**: All POS terminals update simultaneously
✅ **User Feedback**: Toast notification confirms the update
✅ **Audit Trail**: Console logs show when updates occur
✅ **Branch-Specific**: Only pumps for the cashier's branch update

## Troubleshooting

### If real-time updates don't work:

#### 1. Check Realtime is Enabled
```sql
-- Run in Supabase SQL Editor
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```
Should show `pumps` in the results.

#### 2. Check Browser Console
Open POS terminal and check console for:
- ✅ "Pump price updated: ..." logs
- ❌ Subscription errors or connection issues

#### 3. Check Supabase Dashboard
Go to: **Database** → **Replication** → Verify `pumps` is in `supabase_realtime` publication

#### 4. Test Manual Update
```sql
UPDATE pumps 
SET price_per_liter = price_per_liter + 0.01 
WHERE branch_id = 'YOUR_BRANCH_ID';
```
POS should immediately show toast notification.

#### 5. Check RLS Policies
The subscription uses the anon key, so RLS policies must allow SELECT on pumps:
```sql
-- Verify this policy exists:
SELECT * FROM pg_policies 
WHERE tablename = 'pumps' 
AND policyname LIKE '%select%';
```

### Common Issues

**Issue**: "Pump prices updated" toast shows but prices don't change
- **Cause**: fetchPumps() might be failing
- **Fix**: Check browser console for errors in fetchPumps()

**Issue**: No toast notification appears
- **Cause**: Realtime not enabled or subscription not connected
- **Fix**: Run migration again, check Supabase Dashboard replication settings

**Issue**: Updates work for admin but not cashier
- **Cause**: RLS policies blocking cashier's SELECT on pumps
- **Fix**: Verify RLS policies allow authenticated users to SELECT pumps

## Success Indicators

✅ Migration runs without errors
✅ `pumps` appears in `supabase_realtime` publication
✅ POS console shows "Pump price updated" logs
✅ Toast notification appears when prices change
✅ Pump prices update without page refresh
✅ Multiple POS terminals update simultaneously

## Next Steps

Once confirmed working:
1. Test with multiple POS terminals open simultaneously
2. Create a real scheduled price change and verify all terminals update
3. Document for your team that price updates are now automatic
4. Push changes to GitHub
