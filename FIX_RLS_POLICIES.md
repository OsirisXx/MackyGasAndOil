# Fix RLS Policies for Scheduled Price Changes

## Issue
The initial RLS policies were checking for `auth.users.role = 'admin'`, but your auth system doesn't have a `role` column. This caused 403 Forbidden errors.

## Solution

### Step 1: Run the Fix SQL
Execute this in your Supabase SQL Editor:

```sql
\i supabase/26_fix_rls_policies.sql
```

Or copy and paste the contents of `supabase/26_fix_rls_policies.sql` into the SQL Editor and run it.

### Step 2: Verify the Fix
After running the SQL, the following should work:
- Viewing schedules in PumpManagement page
- Creating new schedules
- Editing schedules
- Canceling schedules
- Conflict detection

### What Changed

**Before (Broken):**
```sql
-- Checked for role column that doesn't exist
CREATE POLICY "Admins can view all schedules"
  ON public.price_change_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.role = 'admin'  -- ❌ This column doesn't exist
    )
  );
```

**After (Fixed):**
```sql
-- Simply checks if user is authenticated
CREATE POLICY "Authenticated users can view schedules"
  ON public.price_change_schedules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);  -- ✅ Works with your auth system
```

### Code Changes Made

1. **SchedulePriceChangeForm.jsx**
   - Changed `const { user } = useAuthStore()` to `const { adminUser } = useAuthStore()`
   - Changed `created_by: user.id` to `created_by: adminUser?.id || null`
   - Changed `created_by_name: user.email` to `created_by_name: adminUser?.email || 'Unknown'`

2. **supabase/26_scheduled_price_changes.sql**
   - Updated RLS policies to check `auth.uid() IS NOT NULL` instead of checking for admin role

## Testing After Fix

1. Refresh your browser (Ctrl+F5 or Cmd+Shift+R)
2. Go to `/admin/pump-management`
3. Click "Schedule Price Change"
4. You should now be able to:
   - See the form without errors
   - Create a schedule
   - View schedules in "View Schedules"
   - Edit and cancel schedules

## Note on Security

The current implementation allows any authenticated user to manage schedules. If you need to restrict this to specific admin users in the future, you can:

1. Add an `is_admin` column to the `profiles` table
2. Update the RLS policies to check:
   ```sql
   EXISTS (
     SELECT 1 FROM public.profiles
     WHERE profiles.id = auth.uid()
     AND profiles.is_admin = true
   )
   ```

For now, since all authenticated users in your system are admins, the current approach is sufficient.
