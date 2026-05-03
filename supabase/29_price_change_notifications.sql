-- ============================================================================
-- Price Change Notifications Table
-- Description: Stores price change notifications for real-time updates to POS
-- ============================================================================

-- Create price_change_notifications table
CREATE TABLE IF NOT EXISTS price_change_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  pump_ids UUID[] NOT NULL,
  schedule_id UUID REFERENCES price_change_schedules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Index for efficient queries
  CONSTRAINT price_change_notifications_branch_id_idx 
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Create index for faster lookups by branch
CREATE INDEX IF NOT EXISTS idx_price_change_notifications_branch 
  ON price_change_notifications(branch_id, created_at DESC);

-- Enable RLS
ALTER TABLE price_change_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read all price change notifications
-- (Cashiers authenticate via QR/PIN, not auth.users, so we allow all authenticated reads)
CREATE POLICY "Authenticated users can read price change notifications"
  ON price_change_notifications
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to insert notifications (for Edge Function)
CREATE POLICY "Service role can insert price change notifications"
  ON price_change_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE price_change_notifications;

-- Function to clean up old notifications (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_price_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM price_change_notifications
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_old_price_notifications() TO service_role;

COMMENT ON TABLE price_change_notifications IS 'Stores price change notifications for real-time updates to POS terminals';
COMMENT ON FUNCTION cleanup_old_price_notifications() IS 'Cleans up price change notifications older than 1 hour';
