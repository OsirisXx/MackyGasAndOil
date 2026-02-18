-- ============================================================================
-- Migration: 04_audit_logs.sql
-- Date: 2026-02-16
-- Description: Create audit_logs table to track all system activities
-- ============================================================================

-- ============================================================================
-- 1. AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who performed the action
  user_id UUID REFERENCES auth.users(id),          -- Admin user (if authenticated)
  user_email TEXT,                                  -- Cached email for display
  cashier_id UUID REFERENCES public.cashiers(id),  -- Cashier (if action by cashier)
  cashier_name TEXT,                                -- Cached name for display
  
  -- What action was performed
  action TEXT NOT NULL,                             -- e.g. 'create', 'update', 'delete', 'login', 'checkout'
  entity_type TEXT NOT NULL,                        -- e.g. 'cash_sale', 'purchase_order', 'cashier', 'branch'
  entity_id UUID,                                   -- ID of the affected record
  
  -- Context
  branch_id UUID REFERENCES public.branches(id),   -- Which branch (if applicable)
  branch_name TEXT,                                 -- Cached branch name
  
  -- Details
  description TEXT,                                 -- Human-readable description
  old_values JSONB,                                 -- Previous values (for updates)
  new_values JSONB,                                 -- New values (for creates/updates)
  metadata JSONB,                                   -- Any additional context
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- IP/Device info (optional, for security audits)
  ip_address TEXT,
  user_agent TEXT
);

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_cashier_id ON public.audit_logs(cashier_id);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_branch_id ON public.audit_logs(branch_id);

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "Admin can read audit logs" ON public.audit_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Anyone authenticated can insert (logging happens from various contexts)
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- No one can update or delete audit logs (immutable)
-- (No UPDATE or DELETE policies = denied by default)

-- ============================================================================
-- 4. HELPER FUNCTION FOR LOGGING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_branch_name TEXT DEFAULT NULL,
  p_cashier_id UUID DEFAULT NULL,
  p_cashier_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_log_id UUID;
BEGIN
  -- Get current user info if authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_email, cashier_id, cashier_name,
    action, entity_type, entity_id,
    branch_id, branch_name,
    description, old_values, new_values, metadata
  ) VALUES (
    v_user_id, v_user_email, p_cashier_id, p_cashier_name,
    p_action, p_entity_type, p_entity_id,
    p_branch_id, p_branch_name,
    p_description, p_old_values, p_new_values, p_metadata
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
