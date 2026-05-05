-- Add 'lubes_deposit' as a valid deposit_type value
-- This allows cashiers to record lubes deposits separately from fuel deposits

-- First, check if there's a CHECK constraint on deposit_type
DO $$ 
BEGIN
  -- Drop the existing CHECK constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'cash_deposits' 
    AND column_name = 'deposit_type'
  ) THEN
    ALTER TABLE cash_deposits DROP CONSTRAINT IF EXISTS cash_deposits_deposit_type_check;
    RAISE NOTICE 'Dropped existing deposit_type constraint';
  END IF;
END $$;

-- Add new CHECK constraint that includes 'lubes_deposit'
ALTER TABLE cash_deposits
ADD CONSTRAINT cash_deposits_deposit_type_check 
CHECK (deposit_type IN ('vault_deposit', 'gcash', 'cash_register', 'lubes_deposit'));

-- Verify the constraint
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'cash_deposits_deposit_type_check';

-- Success message
DO $$ 
BEGIN
  RAISE NOTICE 'Successfully added lubes_deposit as a valid deposit type';
  RAISE NOTICE 'Cashiers can now record lubes deposits separately';
END $$;
