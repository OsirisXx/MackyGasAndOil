-- ============================================================================
-- PART 2: Verify triggers are enabled
-- Run this after Part 1
-- ============================================================================

SELECT tgname, tgrelid::regclass, tgenabled 
FROM pg_trigger 
WHERE tgname LIKE '%pump%' OR tgname LIKE '%sale%';

-- tgenabled should show 'O' (enabled), not '0' (disabled)
