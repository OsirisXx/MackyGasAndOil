-- ============================================================================
-- Migration: Broadcast Price Changes via Realtime
-- Description: Sets up database trigger to broadcast price changes using
--              Supabase Realtime's broadcast feature (recommended approach)
--              instead of postgres_changes for better scalability.
-- ============================================================================

-- Create function to broadcast price changes when notification is inserted
create or replace function public.broadcast_price_change()
returns trigger
security definer
language plpgsql
as $$
begin
  -- Broadcast to topic: price-changes:<branch_id>
  -- This uses Realtime's broadcast_changes function which is more scalable
  perform realtime.broadcast_changes(
    'price-changes:' || NEW.branch_id::text,  -- topic name includes branch_id
    TG_OP,                                     -- event type (INSERT)
    TG_OP,                                     -- operation
    TG_TABLE_NAME,                             -- table name
    TG_TABLE_SCHEMA,                           -- schema
    NEW,                                       -- new record
    OLD                                        -- old record (null for INSERT)
  );
  return null;
end;
$$;

-- Create trigger on price_change_notifications table
-- This fires AFTER each INSERT, broadcasting to all subscribed POS terminals
drop trigger if exists handle_price_change_notifications on public.price_change_notifications;

create trigger handle_price_change_notifications
after insert
on public.price_change_notifications
for each row
execute function broadcast_price_change();

-- Grant necessary permissions
grant usage on schema realtime to authenticated;
grant usage on schema realtime to anon;

-- Create RLS policy for realtime.messages to allow authenticated users to receive broadcasts
-- This is required for Realtime Authorization
do $$
begin
  -- Check if policy already exists
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'realtime' 
    and tablename = 'messages' 
    and policyname = 'Authenticated users can receive price change broadcasts'
  ) then
    execute 'create policy "Authenticated users can receive price change broadcasts"
      on realtime.messages
      for select
      to authenticated
      using (true)';
  end if;
end $$;

-- Also allow anon role (for cashiers who authenticate via QR/PIN, not auth.users)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'realtime' 
    and tablename = 'messages' 
    and policyname = 'Anon users can receive price change broadcasts'
  ) then
    execute 'create policy "Anon users can receive price change broadcasts"
      on realtime.messages
      for select
      to anon
      using (true)';
  end if;
end $$;

-- Verify the trigger was created
select 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
from information_schema.triggers
where trigger_name = 'handle_price_change_notifications';

-- Success message
do $$
begin
  raise notice 'Broadcast price change trigger created successfully';
  raise notice 'POS terminals will now receive real-time price updates via broadcast channel';
end $$;
