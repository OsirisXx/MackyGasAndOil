-- ============================================================================
-- Diagnose Realtime Configuration
-- Description: Check if realtime is properly configured for pumps table
-- ============================================================================

-- 1. Check if pumps table is in the realtime publication
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- Expected: Should show 'public' and 'pumps' in the results

-- 2. Check replica identity for pumps table
SELECT relname, relreplident
FROM pg_class
WHERE relname = 'pumps';

-- Expected: relreplident should be 'f' (FULL) or 'd' (DEFAULT)
-- 'f' = FULL (includes all columns in realtime events)
-- 'd' = DEFAULT (only includes primary key)

-- 3. Check if pg_net extension is enabled (needed for HTTP calls)
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 4. Check if there are any active realtime connections
SELECT * FROM pg_stat_activity 
WHERE application_name LIKE '%realtime%';

-- 5. Test manual pump update to trigger realtime event
-- Run this and check if POS receives the event:
-- UPDATE pumps 
-- SET price_per_liter = price_per_liter + 0.01 
-- WHERE pump_name = 'Pump 1'
-- RETURNING *;

-- ============================================================================
-- If pumps is NOT in the realtime publication, run:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.pumps;
-- ALTER TABLE public.pumps REPLICA IDENTITY FULL;
-- ============================================================================
