-- ============================================================================
-- Migration: 08_branch_shifts.sql
-- Date: 2026-02-18
-- Description: Create branch_shifts table to allow dynamic shift time
--              management per branch instead of hardcoded shift times.
-- ============================================================================

-- ============================================================================
-- 1. BRANCH SHIFTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.branch_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  shift_number INT NOT NULL CHECK (shift_number >= 1),
  label TEXT NOT NULL DEFAULT 'Shift',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(branch_id, shift_number)
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_branch_shifts_branch ON public.branch_shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_shifts_active ON public.branch_shifts(is_active);

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================
ALTER TABLE public.branch_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON public.branch_shifts
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================================
CREATE TRIGGER update_branch_shifts_updated_at
  BEFORE UPDATE ON public.branch_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 5. SEED DEFAULT SHIFTS FOR EXISTING BRANCHES
-- ============================================================================
-- Insert default 3 shifts for all existing branches
INSERT INTO public.branch_shifts (branch_id, shift_number, label, start_time, end_time)
SELECT b.id, s.shift_number, s.label, s.start_time, s.end_time
FROM public.branches b
CROSS JOIN (
  VALUES 
    (1, 'Shift 1', '06:00'::TIME, '14:00'::TIME),
    (2, 'Shift 2', '14:00'::TIME, '22:00'::TIME),
    (3, 'Shift 3', '22:00'::TIME, '06:00'::TIME)
) AS s(shift_number, label, start_time, end_time)
ON CONFLICT (branch_id, shift_number) DO NOTHING;
