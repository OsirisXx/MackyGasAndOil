# Implementation Plan: Vault & PO Expansion

## Overview

This plan implements the vault deposit classification, admin vault management (soft delete/restore/create), PO form expansion with product mode, and accountability report updates. Tasks are ordered so each builds on the previous — starting with the database migration, then shared helper utilities, then UI changes from POS through admin pages and reports.

## Tasks

- [x] 1. Database migration and shared helper utilities
  - [x] 1.1 Create database migration file `supabase/25_vault_po_expansion.sql`
    - Add `deposit_type TEXT CHECK (deposit_type IN ('vault_deposit', 'gcash', 'cash_register'))` to `cash_deposits`
    - Add `deleted_at TIMESTAMPTZ` to `cash_deposits`
    - Add index on `cash_deposits(deleted_at)`
    - Add `ci_number TEXT` to `purchase_orders`
    - Add `po_slip_number TEXT` to `purchase_orders`
    - Add `description TEXT` to `purchase_orders`
    - Add `unit_type TEXT CHECK (unit_type IN ('liters', 'pcs'))` to `purchase_orders`
    - All columns nullable, use `ADD COLUMN IF NOT EXISTS` for idempotency
    - _Requirements: 1.1, 1.4, 5.1, 8.1, 12.1_

  - [x] 1.2 Create shared helper utilities file `src/utils/vaultHelpers.js`
    - Implement `getDepositTypeLabel(depositType)` — returns label string, null defaults to "Vault Deposit"
    - Implement `getUnitTypeLabel(unitType)` — returns "Liters", "Pcs", or "—"
    - Implement `groupDepositsByType(deposits)` — groups deposit amounts by type, null treated as vault_deposit
    - Implement `filterActiveDeposits(deposits)` — filters out records where `deleted_at` is not null
    - Implement `VAULT_TABS` constant array with tab config (key, label, icon)
    - _Requirements: 1.3, 3.3, 5.3, 10.2, 10.3_

  - [ ]* 1.3 Write property tests for helper utilities (`src/__tests__/vault-po-expansion.property.test.js`)
    - **Property 1: Null deposit_type defaults to vault_deposit** — `getDepositTypeLabel(null)` returns "Vault Deposit", `groupDepositsByType` includes null amounts in vault_deposit bucket
    - **Validates: Requirements 1.3, 3.3**
    - **Property 3: Soft-deleted deposits excluded from active queries** — `filterActiveDeposits` returns only records where `deleted_at` is null
    - **Validates: Requirements 5.3, 5.5, 5.6**
    - **Property 6: Deposit type filter returns only matching records** — filtering by type returns only deposits whose `deposit_type` matches (null treated as vault_deposit)
    - **Validates: Requirements 4.3**
    - **Property 9: Null PO fields display as dash** — `getUnitTypeLabel(null)` returns "—"
    - **Validates: Requirements 10.2**
    - **Property 10: Unit type display mapping** — `getUnitTypeLabel('liters')` returns "Liters", `getUnitTypeLabel('pcs')` returns "Pcs"
    - **Validates: Requirements 10.3**

- [x] 2. Checkpoint — Ensure migration and helpers are correct
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. POS Vault Modal expansion
  - [x] 3.1 Expand vault modal in `src/pages/POS.jsx` from 2 tabs to 4 tabs
    - Replace `vaultTab` state values: change from `'deposit'`/`'withdraw'` to `'vault_deposit'`/`'withdraw'`/`'gcash'`/`'cash_register'`
    - Render 4 tab buttons using `VAULT_TABS` from vaultHelpers (Vault Deposit, Withdrawals/Cash Out, GCash, Cash Register)
    - For deposit tabs (`vault_deposit`, `gcash`, `cash_register`): reuse existing deposit form, include `deposit_type: vaultTab` in the insert payload
    - For `withdraw` tab: keep existing withdrawal form unchanged
    - Retain all existing form fields (amount, notes) for each deposit type
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 3.2 Write property tests for vault deposit type insertion
    - **Property 2: Net Vault calculation correctness** — sum of grouped deposits by type plus withdrawals equals net vault
    - **Validates: Requirements 3.2**

- [x] 4. POS PO Form expansion
  - [x] 4.1 Add new fields and product mode toggle to PO form in `src/pages/POS.jsx`
    - Add state variables: `poMode` ('fuel'/'product'), `poCiNumber`, `poSlipNumber`, `poDescription`, `poUnitType`, `poProductId`
    - Add fuel/product mode toggle at top of PO form
    - In fuel mode: keep existing pump dropdown, liters/amount calculation; set `unit_type` to 'liters'
    - In product mode: show product dropdown (from `products` store), hide pump dropdown; set `pump_id` and `fuel_type_id` to null; auto-fill description from product name; set `unit_type` to 'pcs'; require manual amount entry
    - Add input fields for CI Number, PO Slip Number, Description, Unit Type below existing fields
    - On submit: include `ci_number`, `po_slip_number`, `description`, `unit_type` in the insert payload
    - Reset all new fields on successful submission
    - _Requirements: 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 4.2 Write property tests for product mode PO
    - **Property 7: Product mode PO nullifies fuel fields** — PO created in product mode has pump_id=null and fuel_type_id=null
    - **Validates: Requirements 9.5**
    - **Property 8: Product selection auto-fills description and unit_type** — selecting a product sets description to product name and unit_type to 'pcs'
    - **Validates: Requirements 9.4**

- [x] 5. Checkpoint — Ensure POS changes work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Accountability Report updates
  - [x] 6.1 Update vault section in `src/pages/AccountabilityReport.jsx`
    - Import `groupDepositsByType`, `filterActiveDeposits`, `getDepositTypeLabel` from vaultHelpers
    - Filter deposits with `filterActiveDeposits` to exclude soft-deleted records
    - Group deposits by type using `groupDepositsByType`
    - Display vault section with 3 deposit sub-rows (Vault Deposits, GCash, Cash Register) + Withdrawals row
    - Calculate Net Vault = vault_deposit + gcash + cash_register + withdrawals
    - _Requirements: 3.1, 3.2, 3.3, 5.5_

  - [x] 6.2 Update "C. EXPENSES" section to use withdrawals instead of expenses table
    - Replace the expenses query/display with withdrawals data (from `cash_withdrawals` table)
    - Display each withdrawal with columns: NATURE (withdrawal reason) and AMOUNT
    - Update `totalExpenses` calculation to use withdrawals total instead of expenses table
    - Ensure the short/over formula still works correctly with withdrawals as expenses
    - _Requirements: 2.7, 3.5, 3.6_

  - [x] 6.3 Expand Charge Invoice table to 7 columns
    - Update the charge invoice table header to: C.I. No., P.O. Slip No., Customer, Plate Number, Description, Unit, Amount
    - Display `ci_number`, `po_slip_number`, `description` from each PO record
    - Display `unit_type` using `getUnitTypeLabel` (Liters/Pcs/—)
    - Show "—" for any null field
    - Update the print layout to include all 7 columns
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 7. CashierAccountability modal updates
  - [x] 7.1 Update vault breakdown in `src/components/CashierAccountability.jsx`
    - Import `groupDepositsByType`, `filterActiveDeposits`, `getDepositTypeLabel` from vaultHelpers
    - Filter deposits with `filterActiveDeposits` to exclude soft-deleted
    - Display vault breakdown by deposit type (Vault Deposits, GCash, Cash Register) in the Cash Summary section
    - Keep Withdrawals row as-is
    - _Requirements: 3.4, 5.6_

- [x] 8. Checkpoint — Ensure report and accountability changes are correct
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Admin CashDeposits page updates
  - [x] 9.1 Add deposit type column, soft delete, restore, and type filter to `src/pages/CashDeposits.jsx`
    - Import helpers from vaultHelpers
    - Add `deposit_type` column to deposits table using `getDepositTypeLabel`
    - Add deposit type filter dropdown (All, Vault Deposit, GCash, Cash Register)
    - Add `showDeleted` toggle state; default query adds `.is('deleted_at', null)` filter; toggle shows all
    - Change `handleDelete` to set `deleted_at = NOW()` instead of hard delete
    - Add `handleRestore` function that sets `deleted_at = null` and logs audit
    - Show Restore button for soft-deleted records; show visual indicator (strikethrough or muted style) for deleted records
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3_

  - [x] 9.2 Add admin "Create Deposit" form to `src/pages/CashDeposits.jsx`
    - Add "Create Deposit" button that opens a modal form
    - Form fields: cashier (dropdown from cashiers list), branch (dropdown), amount, deposit type (dropdown), date/time, notes (optional)
    - On submit: insert into `cash_deposits` with provided values and log audit with admin identity
    - Validate required fields before submission
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 9.3 Write property tests for soft delete and restore
    - **Property 4: Soft delete preserves record with timestamp** — after soft delete, record still exists with non-null `deleted_at`, all other fields unchanged
    - **Validates: Requirements 5.2**
    - **Property 5: Restore clears deleted_at** — after restore, `deleted_at` is null and record appears in active queries
    - **Validates: Requirements 6.2**

- [x] 10. Admin PurchaseOrders page updates
  - [x] 10.1 Add new columns and extended search to `src/pages/PurchaseOrders.jsx`
    - Add columns to the table: CI Number, PO Slip Number, Description, Unit Type
    - Display "—" for null values in new columns
    - Display `unit_type` using `getUnitTypeLabel`
    - Extend search filter to include `ci_number` and `po_slip_number`
    - Update the `printCustomerStatement` function to include new columns in the printed statement
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ]* 10.2 Write property test for search filter inclusion
    - **Property 11: Search includes ci_number and po_slip_number** — searching by ci_number or po_slip_number value includes matching POs in results
    - **Validates: Requirements 11.2**

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All new DB columns are nullable for backward compatibility (Requirement 12)
- Existing records with null values display gracefully with "—" or default labels
- The "C. EXPENSES" section uses withdrawals (cash_withdrawals) per client clarification — the separate expenses table is not used in the actual accountability process
