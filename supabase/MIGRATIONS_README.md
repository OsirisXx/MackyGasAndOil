# Supabase Migration Files

## IMPORTANT: Never modify `00_initial_schema.sql` after importing!

For any database changes, create a new numbered migration file:

- `01_alter_example.sql` — Example: adding a column
- `02_alter_example.sql` — Example: modifying a constraint

### Template for migration files:

```sql
-- ============================================================================
-- Migration: [XX]_[description].sql
-- Date: YYYY-MM-DD
-- Description: [What this migration does]
-- ============================================================================

-- Your ALTER TABLE / CREATE TABLE statements here
-- Example:
-- ALTER TABLE public.some_table ADD COLUMN new_col TEXT;
```

### How to apply:
1. Go to Supabase Dashboard → SQL Editor
2. Paste the migration file contents
3. Click "Run"
