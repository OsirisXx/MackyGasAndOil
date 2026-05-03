-- ============================================================================
-- Enable Realtime for Pumps Table
-- Description: Enables real-time subscriptions for pump price updates
--              so POS terminals automatically see price changes
-- ============================================================================

-- Enable realtime for pumps table
ALTER PUBLICATION supabase_realtime ADD TABLE public.pumps;

-- Set replica identity to FULL to include all columns in realtime payloads
-- This ensures the subscription receives the updated price_per_liter value
ALTER TABLE public.pumps REPLICA IDENTITY FULL;

-- ============================================================================
-- Verification:
-- After running this migration, the POS real-time subscription will work:
-- 1. When a scheduled price change executes
-- 2. The pumps table UPDATE triggers a realtime event
-- 3. POS.jsx subscription receives the event
-- 4. fetchPumps() is called to refresh prices
-- 5. Toast notification shows "Pump prices updated 💰"
-- ============================================================================
