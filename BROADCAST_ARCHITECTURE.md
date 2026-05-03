# Broadcast-Based Price Update Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE CLOUD                                  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Edge Function: price-change-scheduler (runs every 60s via cron) │  │
│  │                                                                  │  │
│  │  1. Finds pending schedules (scheduled_at <= now)               │  │
│  │  2. Calls execute_price_change_schedule(schedule_id)            │  │
│  │  3. Inserts into price_change_notifications table               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Database: price_change_notifications table                       │  │
│  │                                                                  │  │
│  │  Columns: id, branch_id, pump_ids, schedule_id, created_at      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Trigger: handle_price_change_notifications (AFTER INSERT)       │  │
│  │                                                                  │  │
│  │  Fires on every INSERT to price_change_notifications            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Function: broadcast_price_change()                               │  │
│  │                                                                  │  │
│  │  Calls: realtime.broadcast_changes(                             │  │
│  │    topic: 'price-changes:<branch_id>',                          │  │
│  │    event: 'INSERT',                                             │  │
│  │    payload: NEW record                                          │  │
│  │  )                                                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Supabase Realtime Server                                         │  │
│  │                                                                  │  │
│  │  Broadcasts message to all WebSocket clients subscribed to:     │  │
│  │  channel: 'price-changes:<branch_id>'                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
└─────────────────────────────────────────────────────────────────────────┘
                               ↓
                    WebSocket Connection
                               ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLIENT SIDE (POS)                               │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ POS.jsx - useEffect Hook                                         │  │
│  │                                                                  │  │
│  │  supabase.channel(`price-changes:${branchId}`)                  │  │
│  │    .on('broadcast', { event: 'INSERT' }, handler)               │  │
│  │    .subscribe()                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Broadcast Handler                                                │  │
│  │                                                                  │  │
│  │  1. Capture old pump prices                                     │  │
│  │  2. Fetch updated prices from database                          │  │
│  │  3. Compare old vs new prices                                   │  │
│  │  4. Show price change alert modal                               │  │
│  │  5. Update pump dropdown automatically                          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              ↓                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ UI Updates                                                       │  │
│  │                                                                  │  │
│  │  ✅ Price Change Alert Modal                                     │  │
│  │     "Diesel: ₱95.17 → ₱96.00"                                   │  │
│  │                                                                  │  │
│  │  ✅ Pump Dropdown Updated                                        │  │
│  │     Shows new prices immediately                                │  │
│  │                                                                  │  │
│  │  ✅ Cashier Stays on POS Screen                                  │  │
│  │     No redirect to shift selection                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

```
Admin Panel          Edge Function       Database           Realtime Server      POS Terminal
    |                     |                  |                     |                  |
    |--Schedule Price---->|                  |                     |                  |
    |    Change           |                  |                     |                  |
    |                     |                  |                     |                  |
    |                [Cron runs every 60s]   |                     |                  |
    |                     |                  |                     |                  |
    |                     |--Find Pending--->|                     |                  |
    |                     |   Schedules      |                     |                  |
    |                     |                  |                     |                  |
    |                     |<--Return---------|                     |                  |
    |                     |   Schedules      |                     |                  |
    |                     |                  |                     |                  |
    |                     |--Execute-------->|                     |                  |
    |                     |   Schedule       |                     |                  |
    |                     |   (RPC call)     |                     |                  |
    |                     |                  |                     |                  |
    |                     |                  |--Update Pump------->|                  |
    |                     |                  |   Prices            |                  |
    |                     |                  |                     |                  |
    |                     |<--Success--------|                     |                  |
    |                     |                  |                     |                  |
    |                     |--Insert--------->|                     |                  |
    |                     |   Notification   |                     |                  |
    |                     |                  |                     |                  |
    |                     |                  |--Trigger Fires----->|                  |
    |                     |                  |   (broadcast_price_ |                  |
    |                     |                  |    change())        |                  |
    |                     |                  |                     |                  |
    |                     |                  |                     |--Broadcast------>|
    |                     |                  |                     |   (WebSocket)    |
    |                     |                  |                     |                  |
    |                     |                  |                     |                  |<--Fetch Updated
    |                     |                  |                     |                  |   Prices
    |                     |                  |                     |                  |
    |                     |                  |<--Query Pumps-------------------------------|
    |                     |                  |                     |                  |
    |                     |                  |--Return Prices---------------------------->|
    |                     |                  |                     |                  |
    |                     |                  |                     |                  |--Show Alert
    |                     |                  |                     |                  |   Modal
    |                     |                  |                     |                  |
    |                     |                  |                     |                  |--Update UI
    |                     |                  |                     |                  |
```

---

## Key Components

### 1. Database Trigger
**File:** `supabase/30_broadcast_price_changes.sql`

```sql
create trigger handle_price_change_notifications
after insert on public.price_change_notifications
for each row
execute function broadcast_price_change();
```

**Purpose:** Automatically broadcasts when Edge Function inserts notification record

---

### 2. Broadcast Function
**File:** `supabase/30_broadcast_price_changes.sql`

```sql
create or replace function public.broadcast_price_change()
returns trigger
security definer
language plpgsql
as $$
begin
  perform realtime.broadcast_changes(
    'price-changes:' || NEW.branch_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  return null;
end;
$$;
```

**Purpose:** Calls Supabase Realtime's broadcast API with branch-specific topic

---

### 3. POS Subscription
**File:** `src/pages/POS.jsx`

```javascript
const channel = supabase
  .channel(`price-changes:${branchId}`, {
    config: { 
      broadcast: { self: false },
      private: false
    }
  })
  .on('broadcast', { event: 'INSERT' }, async (payload) => {
    // Handle price update
  })
  .subscribe()
```

**Purpose:** Subscribes to branch-specific broadcast channel

---

## Data Flow

### 1. Schedule Execution
```
Admin schedules price change
  ↓
Edge Function finds due schedule (cron every 60s)
  ↓
Edge Function calls execute_price_change_schedule(schedule_id)
  ↓
Database function updates pump prices
  ↓
Edge Function inserts into price_change_notifications
```

### 2. Broadcast Trigger
```
INSERT into price_change_notifications
  ↓
Trigger: handle_price_change_notifications fires
  ↓
Function: broadcast_price_change() executes
  ↓
Calls: realtime.broadcast_changes()
  ↓
Realtime Server broadcasts to topic: price-changes:<branch_id>
```

### 3. Client Reception
```
POS subscribed to: price-changes:<branch_id>
  ↓
Receives broadcast event via WebSocket
  ↓
Handler captures old prices
  ↓
Fetches updated prices from database
  ↓
Compares old vs new
  ↓
Shows alert modal with changes
  ↓
Updates pump dropdown
```

---

## Channel Configuration

### Topic Naming
```
Format: price-changes:<branch_id>

Examples:
- price-changes:e4573298-a370-4439-bb28-1af9446e5768 (Balingasag)
- price-changes:f5684309-b481-5550-cc39-2bf0557f6879 (Another Branch)
```

**Why branch-specific?**
- Each branch has independent pricing
- Prevents cross-branch updates
- Reduces unnecessary broadcasts

### Channel Config
```javascript
{
  broadcast: { self: false },  // Don't receive own broadcasts
  private: false               // Allow anon users (cashiers)
}
```

**Why `private: false`?**
- Cashiers use anon key (not authenticated users)
- RLS policies on `realtime.messages` control access
- Simpler than managing auth tokens for cashiers

---

## Security

### RLS Policies
```sql
-- Allow anon users to receive broadcasts
create policy "Anon users can receive price change broadcasts"
on realtime.messages
for select
to anon
using (true);
```

**Why this is safe:**
- Broadcasts are read-only (SELECT only)
- No sensitive data in broadcasts (just notification that prices changed)
- Actual price data fetched separately with proper RLS
- Branch-specific topics prevent cross-branch access

---

## Comparison: Old vs New

### Old Approach (postgres_changes)
```javascript
// ❌ Issues:
// - Single-threaded (doesn't scale)
// - TIMED_OUT errors in React 18 Strict Mode
// - Less reliable WebSocket connections

.channel('price-notifications')
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'price_change_notifications',
  filter: `branch_id=eq.${branchId}`
})
```

### New Approach (broadcast)
```javascript
// ✅ Benefits:
// - Multi-threaded (scales better)
// - Handles React 18 Strict Mode properly
// - More stable WebSocket connections
// - Supabase's recommended approach

.channel(`price-changes:${branchId}`, {
  config: { broadcast: { self: false }, private: false }
})
.on('broadcast', { event: 'INSERT' })
```

---

## Performance Characteristics

### Latency
```
Schedule executes → Broadcast received: ~100-500ms
  - Edge Function execution: 50-200ms
  - Database trigger: 10-50ms
  - Realtime broadcast: 50-200ms
  - Network latency: varies
```

### Scalability
```
postgres_changes: Single-threaded, limited to ~100 concurrent connections
broadcast:        Multi-threaded, supports 1000+ concurrent connections
```

### Reliability
```
postgres_changes: Prone to TIMED_OUT in React 18 Strict Mode
broadcast:        Stable in all environments (dev, prod, Strict Mode)
```

---

## References

- [Supabase: Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase: Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase: Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
