# Accountability Report Fixes — Bugfix Design

## Overview

Five bugs affect the accuracy of the Macky Oil & Gas station management system's accountability report and cashier workflow. The bugs fall into three categories:

1. **Report display gaps** (Bugs 1 & 2): The accountability report omits vault withdrawals and does not show the PO (Charge Invoice) deduction as a visible line item, making it impossible for cashiers to reconcile with the paper form.
2. **Shift auto-detection override** (Bugs 3 & 4): The `ensureCurrentShiftSnapshots` function uses wall-clock time to determine the shift, ignoring the cashier's manual selection from the POS login gate.
3. **PO entry limitation** (Bug 5): The PO creation form only accepts peso amounts, with no option to enter liters and auto-calculate the amount.

All fixes are code-only changes. No existing database data will be modified.

## Glossary

- **Bug_Condition (C)**: The specific input/state combination that triggers each bug
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing behaviors that must remain unchanged after the fix
- **`filterByShift`**: Local function in `AccountabilityReport.jsx` that filters day-wide records to the selected shift using `shift_number`/`shift_date` columns, falling back to time-based filtering
- **`ensureCurrentShiftSnapshots`**: Function in `shiftService.js` that creates/manages pump reading snapshots for the current shift; currently uses `getCurrentShift()` (time-based) to determine shift number
- **`getCurrentShift`**: Function in `shiftConfig.js` that returns the shift number based on wall-clock time and branch schedule
- **`selectedShift`**: The shift number manually chosen by the cashier on the POS login gate
- **`netAccountability`**: `totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous - totalCalibrations`
- **`shortOver`**: `totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)`
- **PO / Charge Invoice**: Purchase order recorded for credit customers; deducted from expected cash remittance

## Bug Details

### Bug Condition

The five bugs manifest under distinct conditions:

**Bug 1 — Vault Withdrawals Not Displayed:**
The report fetches withdrawal data via `filterByShift(allDayWith)` and stores it in `withdrawalsData`, but this variable is never saved to component state or rendered. The VAULT DEPOSITS section only renders `deposits`.

**Bug 2 — PO Deduction Not Visible:**
The summary section shows "Total Sales" as `netAccountability` but never displays the Charge Invoice total as a labeled deduction line. The paper form shows: `Total Accountability - D. Charge Invoices - E. Expenses - F. Purchases = Expected Cash`. The system computes `shortOver` correctly using `totalChargeInvoices` but the deduction is invisible to the cashier.

**Bug 3 — Auto Shift Change:**
`ensureCurrentShiftSnapshots(branchId, branchName)` internally calls `getCurrentShift(branchName)` to determine the shift. When wall-clock time crosses a shift boundary, it auto-closes the old shift's snapshots and creates new ones — even though the cashier is still working their selected shift.

**Bug 4 — Shift Selection Not Passed Through:**
All call sites of `ensureCurrentShiftSnapshots` in `POS.jsx` and `CashierAccountability.jsx` pass only `(branchId, branchName)` — never the cashier's `selectedShift`. The function has no parameter to accept an explicit shift number.

**Bug 5 — PO Liter Entry Missing:**
The PO form in `POS.jsx` only has an amount input. Liters are always derived as `amount / price_per_liter`. There is no toggle to enter liters first and compute `amount = liters * price_per_liter`.

**Formal Specification:**
```
FUNCTION isBugCondition(context)
  INPUT: context of type { bug, reportView, shiftContext, poInput }
  OUTPUT: boolean

  SWITCH context.bug:
    CASE 1: RETURN context.reportView.withdrawalsForShift.length > 0
    CASE 2: RETURN context.reportView.chargeInvoicesForShift.length > 0
    CASE 3: RETURN getCurrentShift(context.shiftContext.branchName) ≠ context.shiftContext.selectedShift
    CASE 4: RETURN context.shiftContext.selectedShift ≠ getCurrentShift(context.shiftContext.branchName)
    CASE 5: RETURN context.poInput.entryMode = "liters"
END FUNCTION
```

### Examples

- **Bug 1**: Cashier deposits ₱5,000 and withdraws ₱1,000 for change. Report shows ₱5,000 deposits but no withdrawals. Expected: shows both, net vault = ₱4,000.
- **Bug 2**: Shift has ₱50,000 total accountability and ₱8,000 in charge invoices. Report shows "Total Sales: ₱50,000" but no "D. CHARGE INVOICES: ₱8,000" deduction line in the summary. Expected: summary shows the ₱8,000 deduction explicitly (it already does in the left column, but the right column "Total Sales" label is misleading — it should show the expected cash after deductions).
- **Bug 3**: Cashier selects Shift 2 at 11:50 AM. At 12:01 PM (Shift 2 start for Manolo), `ensureCurrentShiftSnapshots` detects "Shift 2" via clock — same shift, no issue. But if cashier selected Shift 1 and it's now 12:01 PM, the function auto-transitions to Shift 2.
- **Bug 4**: Cashier selects Shift 1 on login gate. POS calls `ensureCurrentShiftSnapshots(branchId, branchName)` without passing `selectedShift=1`. If clock says Shift 2, snapshots are created for Shift 2.
- **Bug 5**: Customer orders 20 liters of diesel. Cashier must mentally calculate `20 * price_per_liter` and enter the peso amount. Expected: toggle to "liters" mode, enter 20, system calculates amount.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Deposits-only shifts must continue to display deposits correctly with the same layout and totals (Req 3.1)
- The `shortOver` formula must produce the same mathematical result: `totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)` (Req 3.2)
- Records must continue to save `shift_date` and `shift_number` columns (Req 3.3)
- Shift selection UI on the POS login gate must retain the same look, feel, and change-shift dialog (Req 3.4)
- PO creation in peso-amount mode must continue to auto-calculate liters as `amount / price_per_liter` (Req 3.5)
- Printed report layout must retain all existing sections intact (Req 3.6)
- `filterByShift` must continue to use column-based filtering as primary method when `shift_number`/`shift_date` are present (Req 3.7)
- Charge invoices detail section (page 2) must continue to display individual PO line items (Req 3.8)

**Scope:**
All inputs that do NOT trigger any of the five bug conditions should produce identical behavior before and after the fix. Specifically:
- Shifts with no withdrawals: vault section unchanged
- Shifts with no charge invoices: summary section unchanged
- Cases where `selectedShift === getCurrentShift()`: snapshot behavior unchanged
- PO entries in peso-amount mode: calculation unchanged

## Hypothesized Root Cause

Based on code analysis of the actual source files:

1. **Bug 1 — Missing state variable**: In `AccountabilityReport.jsx`, `withdrawalsData` is computed by `filterByShift(allDayWith)` but is never stored via `useState`. The component has a `deposits` state but no `withdrawals` state. The JSX only renders `deposits` in the VAULT DEPOSITS table.

2. **Bug 2 — Summary layout mismatch**: The summary section's right column shows `Total Remittance`, `Short/Over`, and `Total Sales` (as `netAccountability`). The left column shows `D. CHARGE INVOICES`, `E. EXPENSES`, `F. PURCHASES`, `G. CALIBRATION` — but these are not presented as deductions from a running total. The paper form expects: `Total Accountability` → `Less: Charge Invoices` → `Less: Expenses` → `Less: Purchases` → `= Expected Cash`. The right column should show this breakdown so cashiers can verify.

3. **Bug 3 — No shift parameter**: `ensureCurrentShiftSnapshots(branchId, branchName)` has no third parameter for an explicit shift number. It delegates to the Supabase RPC `ensure_current_shift_snapshots` which internally calls `get_current_shift()` — a time-based function. The fallback path also calls `getCurrentShift(branchName)`.

4. **Bug 4 — Call sites don't pass shift**: All three call sites (`POS.jsx` useEffect, `handleCashSale`, `handleCreatePO`) and `CashierAccountability.jsx` call `ensureCurrentShiftSnapshots(branchId, branchName)` without a shift number. Even if the function accepted a shift parameter, the callers don't provide it.

5. **Bug 5 — No entry mode toggle**: The PO form in `POS.jsx` has a single `poAmount` input. Liters are always derived: `poLiters = poAmount / poPump.price_per_liter`. There is no `poEntryMode` state or liters input field.

## Correctness Properties

Property 1: Bug Condition - Vault Withdrawals Rendered

_For any_ accountability report view where the shift has one or more vault withdrawals (`withdrawalsForShift.length > 0`), the fixed `AccountabilityReport` component SHALL render a withdrawals table showing each withdrawal with cashier name, amount, and reason, and SHALL display a net vault total (deposits minus withdrawals).

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition - PO Deduction Visible in Summary

_For any_ accountability report view where the shift has one or more charge invoices (`chargeInvoicesForShift.length > 0`), the fixed summary section SHALL display the charge invoice total as a clearly labeled deduction line item, showing the breakdown: Total Accountability → Less Charge Invoices → Less Expenses → Less Purchases → Expected Cash.

**Validates: Requirements 2.4, 2.5**

Property 3: Bug Condition - Shift Override Respected

_For any_ call to `ensureCurrentShiftSnapshots` where an explicit shift number is provided AND that shift differs from the time-based auto-detected shift, the function SHALL use the provided shift number for snapshot creation and SHALL NOT auto-close or transition the shift.

**Validates: Requirements 2.6, 2.7, 2.8**

Property 4: Bug Condition - Liter Entry Mode Calculates Amount

_For any_ PO creation where the entry mode is "liters" and a liter quantity is entered, the system SHALL calculate `amount = liters * price_per_liter` and save both the liter quantity and computed amount to the database.

**Validates: Requirements 2.9**

Property 5: Preservation - Existing Report Layout Unchanged

_For any_ accountability report view where the shift has no withdrawals AND no charge invoices, the fixed component SHALL produce the same rendered output as the original component, preserving all existing section layouts, totals, and the `shortOver` calculation.

**Validates: Requirements 3.1, 3.2, 3.6, 3.7, 3.8**

Property 6: Preservation - Peso-Mode PO Entry Unchanged

_For any_ PO creation where the entry mode is "amount" (the default/current behavior), the fixed PO form SHALL calculate liters as `amount / price_per_liter` with the same precision and save identical data as the original code.

**Validates: Requirements 3.5**

Property 7: Preservation - Same-Shift Snapshot Behavior Unchanged

_For any_ call to `ensureCurrentShiftSnapshots` where the provided shift number equals the time-based auto-detected shift, the function SHALL produce the same result as the original function.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/pages/AccountabilityReport.jsx`

**Bug 1 — Add withdrawals state and rendering:**

1. **Add `withdrawals` state**: Add `const [withdrawals, setWithdrawals] = useState([])` alongside the existing `deposits` state.
2. **Store filtered withdrawals**: In `fetchAllData`, after `const withdrawalsData = filterByShift(allDayWith)`, add `setWithdrawals(withdrawalsData || [])`.
3. **Render withdrawals table**: Below the existing deposits table in the VAULT DEPOSITS section, add a "VAULT WITHDRAWALS (CASH OUT)" table with columns: #, CASHIER, AMOUNT, REASON, NOTES.
4. **Compute and display net vault**: Add `totalWithdrawals` calculation and display "NET VAULT" = `totalDeposits - totalWithdrawals`.
5. **Fix fallback filter for deposits/withdrawals**: In the `filterByShift` time-based fallback, ensure `deposit_date` and `withdrawal_date` columns are checked alongside `created_at` (the current code already does `item.created_at || item.deposit_date || item.withdrawal_date` — verify this is correct).

**Bug 2 — Add PO deduction to summary:**

1. **Restructure summary right column**: Replace the current right-column layout with a breakdown matching the paper form:
   - `TOTAL ACCOUNTABILITY: ₱X`
   - `Less: D. Charge Invoices: ₱Y`
   - `Less: E. Expenses: ₱Z`
   - `Less: F. Purchases: ₱W`
   - `Less: G. Calibration: ₱V` (if applicable)
   - `= EXPECTED CASH: ₱(X - Y - Z - W - V)`
   - `TOTAL REMITTANCE: ₱R`
   - `SHORT/OVER: ₱(R - Expected)`
2. **Compute `expectedCash`**: Add `const expectedCash = netAccountability - totalChargeInvoices - totalExpenses - totalPurchases` (calibrations already deducted in `netAccountability`).

---

**File**: `src/services/shiftService.js`

**Bug 3 & 4 — Add explicit shift parameter:**

1. **Add `shiftNumber` parameter**: Change signature to `ensureCurrentShiftSnapshots(branchId, branchName, shiftNumber = null)`.
2. **Use provided shift when available**: If `shiftNumber` is provided, pass it to the RPC call as `p_shift_number` (if the RPC supports it) or use the fallback path with the explicit shift number instead of calling `getCurrentShift()`.
3. **Fallback path**: In the fallback (when the RPC doesn't exist), use `shiftNumber || getCurrentShift(branchName)` instead of always calling `getCurrentShift(branchName)`.
4. **No auto-transition when shift is explicit**: When an explicit shift number is provided, skip the auto-close/transition logic — just ensure snapshots exist for that specific shift.

---

**File**: `src/pages/POS.jsx`

**Bug 3 & 4 — Pass selectedShift to all ensureCurrentShiftSnapshots calls:**

1. **useEffect call**: Change `ensureCurrentShiftSnapshots(cashier.branch_id || selectedBranchId, cashier.branches?.name)` to `ensureCurrentShiftSnapshots(cashier.branch_id || selectedBranchId, cashier.branches?.name, selectedShift)`.
2. **handleCashSale call**: Same change — pass `selectedShift` as third argument.
3. **handleCreatePO call**: Same change — pass `selectedShift` as third argument.

**Bug 5 — Add liter-based PO entry:**

1. **Add `poEntryMode` state**: `const [poEntryMode, setPoEntryMode] = useState('amount')` — default to current behavior.
2. **Add `poLitersInput` state**: `const [poLitersInput, setPoLitersInput] = useState('')` for when entry mode is "liters".
3. **Add toggle UI**: Render a toggle/segmented control ("₱ Amount" | "Liters") above or beside the amount input in the PO form.
4. **Conditional input**: When mode is "amount", show the existing amount input. When mode is "liters", show a liters input and auto-calculate amount as `liters * price_per_liter`.
5. **Update handleCreatePO**: When `poEntryMode === 'liters'`, compute `poAmount = poLitersInput * poPump.price_per_liter` and `poLiters = poLitersInput`. When mode is "amount", keep existing logic.

---

**File**: `src/components/CashierAccountability.jsx`

**Bug 3 & 4 — Pass selectedShift:**

1. **Pass shift to ensureCurrentShiftSnapshots**: Change `ensureCurrentShiftSnapshots(selectedBranchId, currentBranch?.name)` to `ensureCurrentShiftSnapshots(selectedBranchId, currentBranch?.name, selectedShift)`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write component-level tests that render the accountability report with specific data configurations and inspect the rendered output. For shift service tests, mock Supabase and verify which shift number is passed to RPCs.

**Test Cases**:
1. **Bug 1 — Withdrawals Missing**: Render `AccountabilityReport` with shift data containing withdrawals. Assert the VAULT section does NOT render withdrawal rows (will fail on unfixed code — confirming the bug).
2. **Bug 2 — PO Deduction Hidden**: Render `AccountabilityReport` with charge invoices. Assert the summary section does NOT show a "Charge Invoices" deduction line (will fail on unfixed code — confirming the bug).
3. **Bug 3 — Auto Shift Transition**: Call `ensureCurrentShiftSnapshots(branchId, 'Manolo')` when `getCurrentShift()` returns a different shift than the cashier's selected shift. Assert the function uses the auto-detected shift (will demonstrate the bug).
4. **Bug 5 — No Liter Toggle**: Render the PO form. Assert there is no entry mode toggle (will confirm the bug).

**Expected Counterexamples**:
- Bug 1: `withdrawals` state is never set; JSX has no withdrawal rendering code
- Bug 2: Summary right column shows `netAccountability` as "Total Sales" with no deduction breakdown
- Bug 3: `ensureCurrentShiftSnapshots` always calls `getCurrentShift()` regardless of caller intent
- Bug 5: PO form has only `poAmount` input, no mode toggle

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
// Bug 1
FOR ALL report WHERE report.withdrawalsForShift.length > 0 DO
  rendered := renderAccountabilityReport'(report)
  ASSERT rendered.vaultSection.containsWithdrawals = true
  ASSERT rendered.vaultSection.netVault = SUM(deposits) - SUM(withdrawals)
END FOR

// Bug 2
FOR ALL report WHERE report.chargeInvoicesForShift.length > 0 DO
  rendered := renderAccountabilityReport'(report)
  ASSERT rendered.summarySection.showsChargeInvoiceDeduction = true
  ASSERT rendered.summarySection.expectedCash = netAccountability - totalCI - totalExp - totalPur
END FOR

// Bug 3 & 4
FOR ALL ctx WHERE ctx.selectedShift ≠ getCurrentShift(ctx.branchName) DO
  result := ensureCurrentShiftSnapshots'(ctx.branchId, ctx.branchName, ctx.selectedShift)
  ASSERT result uses ctx.selectedShift (not auto-detected shift)
END FOR

// Bug 5
FOR ALL po WHERE po.entryMode = "liters" DO
  result := handleCreatePO'(po)
  ASSERT result.amount = po.liters * po.pricePerLiter
  ASSERT result.liters = po.liters
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
// Bug 1 preservation
FOR ALL report WHERE report.withdrawalsForShift.length = 0 DO
  ASSERT renderAccountabilityReport(report).vaultSection = renderAccountabilityReport'(report).vaultSection
END FOR

// Bug 2 preservation
FOR ALL report WHERE report.chargeInvoicesForShift.length = 0 DO
  ASSERT renderAccountabilityReport(report).shortOver = renderAccountabilityReport'(report).shortOver
END FOR

// Bug 3 & 4 preservation
FOR ALL ctx WHERE ctx.selectedShift = getCurrentShift(ctx.branchName) DO
  ASSERT ensureCurrentShiftSnapshots(ctx.branchId, ctx.branchName) 
       = ensureCurrentShiftSnapshots'(ctx.branchId, ctx.branchName, ctx.selectedShift)
END FOR

// Bug 5 preservation
FOR ALL po WHERE po.entryMode = "amount" DO
  ASSERT handleCreatePO(po) = handleCreatePO'(po)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss (e.g., zero amounts, null fields, boundary shift times)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for deposits-only reports, no-CI reports, same-shift scenarios, and peso-mode POs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Deposits-Only Preservation**: Verify that shifts with deposits but no withdrawals render identically before and after fix
2. **No-CI Summary Preservation**: Verify that shifts with no charge invoices produce the same `shortOver` value
3. **Same-Shift Snapshot Preservation**: Verify that when `selectedShift === getCurrentShift()`, snapshot behavior is identical
4. **Peso-Mode PO Preservation**: Verify that PO creation in amount mode produces identical database records

### Unit Tests

- Test `filterByShift` with records that have NULL `shift_number`/`shift_date` to verify fallback uses correct timestamp columns
- Test `ensureCurrentShiftSnapshots` with explicit shift number parameter vs. without (backward compatibility)
- Test PO amount calculation in both "amount" and "liters" entry modes
- Test withdrawal total and net vault calculation with various deposit/withdrawal combinations
- Test `expectedCash` computation matches paper form formula

### Property-Based Tests

- Generate random sets of deposits and withdrawals, verify net vault = SUM(deposits) - SUM(withdrawals)
- Generate random accountability totals with CI/expenses/purchases, verify `expectedCash` formula consistency
- Generate random shift contexts where `selectedShift` varies, verify the correct shift number is always used
- Generate random PO inputs in both modes, verify `amount = liters * price_per_liter` identity holds in both directions

### Integration Tests

- Test full accountability report render with a mix of deposits, withdrawals, charge invoices, expenses, and purchases — verify all sections display correctly and totals reconcile
- Test POS flow: select shift on login gate → record sale → record PO → view accountability — verify all records use the selected shift number
- Test PO creation in liters mode end-to-end: select pump → toggle to liters → enter liters → verify saved record has correct amount and liters
- Test printed report output includes withdrawal section and PO deduction breakdown
