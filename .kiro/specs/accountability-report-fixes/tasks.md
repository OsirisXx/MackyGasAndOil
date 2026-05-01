# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Accountability Report Missing Data & Shift Override
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the five bugs exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug:
    - Bug 1: Render AccountabilityReport with withdrawals data → assert vault section contains withdrawal rows and net vault total (deposits - withdrawals). On unfixed code, `withdrawals` state is never set, so no withdrawal rows render.
    - Bug 2: Render AccountabilityReport with charge invoices → assert summary section shows deduction breakdown (Total Accountability → Less CI → Less Expenses → Less Purchases → Expected Cash). On unfixed code, summary shows only "Total Sales" with no deduction lines.
    - Bug 3 & 4: Call `ensureCurrentShiftSnapshots(branchId, branchName, shiftNumber)` with explicit shift number different from auto-detected → assert the provided shift number is used (not auto-detected). On unfixed code, function has no `shiftNumber` parameter and always uses `getCurrentShift()`.
    - Bug 5: Render PO form → assert entry mode toggle exists for "₱ Amount" vs "Liters". On unfixed code, no toggle exists.
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.4, 1.6, 1.7, 1.8, 1.9_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Report Layout, Shift Behavior, and PO Entry Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code:
    - Deposits-only report: vault section renders deposits table with correct totals
    - No-CI report: `shortOver` formula produces correct result: `totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)`
    - Same-shift scenario: `ensureCurrentShiftSnapshots(branchId, branchName)` without explicit shift behaves identically when selectedShift matches auto-detected shift
    - Peso-mode PO: `handleCreatePO` calculates `liters = amount / price_per_liter` with same precision
  - Write property-based tests capturing observed behavior:
    - For all deposit/withdrawal combinations where withdrawals.length = 0, vault section renders identically to unfixed code (Req 3.1)
    - For all accountability totals, `shortOver` formula produces same mathematical result (Req 3.2)
    - For all shift contexts where selectedShift === getCurrentShift(), snapshot behavior is unchanged (Req 3.3, 3.4)
    - For all PO inputs in peso-amount mode, liters = amount / price_per_liter identity holds (Req 3.5)
    - `filterByShift` continues to use column-based filtering as primary method when shift_number/shift_date are present (Req 3.7)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix shift service to accept explicit shift number (Bugs 3 & 4)

  - [x] 3.1 Add `shiftNumber` parameter to `ensureCurrentShiftSnapshots` in `src/services/shiftService.js`
    - Change signature from `ensureCurrentShiftSnapshots(branchId, branchName)` to `ensureCurrentShiftSnapshots(branchId, branchName, shiftNumber = null)`
    - When `shiftNumber` is provided, pass it to the Supabase RPC as `p_shift_number` (if supported) or use the fallback path with the explicit shift number
    - In the fallback path, use `shiftNumber || getCurrentShift(branchName)` instead of always calling `getCurrentShift(branchName)`
    - When an explicit shift number is provided, skip auto-close/transition logic — just ensure snapshots exist for that specific shift
    - _Bug_Condition: isBugCondition(ctx) where getCurrentShift(ctx.branchName) ≠ ctx.selectedShift_
    - _Expected_Behavior: ensureCurrentShiftSnapshots uses ctx.selectedShift when provided_
    - _Preservation: When shiftNumber is null, behavior is identical to original function_
    - _Requirements: 2.6, 2.7, 2.8, 3.3_

  - [x] 3.2 Pass `selectedShift` from all call sites in `src/pages/POS.jsx`
    - useEffect call: `ensureCurrentShiftSnapshots(cashier.branch_id || selectedBranchId, cashier.branches?.name, selectedShift)`
    - handleSubmit (cash sale): same — pass `selectedShift` as third argument
    - handleCreatePO: same — pass `selectedShift` as third argument
    - _Bug_Condition: POS.jsx calls ensureCurrentShiftSnapshots without selectedShift_
    - _Expected_Behavior: All call sites pass selectedShift so snapshots use cashier's chosen shift_
    - _Preservation: When selectedShift matches auto-detected shift, behavior is unchanged_
    - _Requirements: 2.8, 3.4_

  - [x] 3.3 Pass `selectedShift` from `src/components/CashierAccountability.jsx`
    - Change `ensureCurrentShiftSnapshots(selectedBranchId, currentBranch?.name)` to `ensureCurrentShiftSnapshots(selectedBranchId, currentBranch?.name, selectedShift)`
    - _Bug_Condition: CashierAccountability calls ensureCurrentShiftSnapshots without selectedShift_
    - _Expected_Behavior: Accountability modal uses cashier's selected shift for snapshots_
    - _Preservation: When selectedShift matches auto-detected shift, behavior is unchanged_
    - _Requirements: 2.8_

- [x] 4. Fix accountability report display (Bugs 1 & 2)

  - [x] 4.1 Add `withdrawals` state and render withdrawals table in `src/pages/AccountabilityReport.jsx` (Bug 1)
    - Add `const [withdrawals, setWithdrawals] = useState([])` alongside existing `deposits` state
    - In `fetchAllData`, after `const withdrawalsData = filterByShift(allDayWith)`, add `setWithdrawals(withdrawalsData || [])`
    - Below the existing deposits table in the VAULT DEPOSITS section, add a "VAULT WITHDRAWALS (CASH OUT)" table with columns: #, CASHIER, AMOUNT, REASON, NOTES
    - Compute `totalWithdrawals = withdrawals.reduce((s, w) => s + parseFloat(w.amount || 0), 0)`
    - Display net vault total: `NET VAULT = totalDeposits - totalWithdrawals`
    - _Bug_Condition: isBugCondition_Bug1(report) where report.withdrawalsForShift.length > 0_
    - _Expected_Behavior: Vault section renders withdrawal rows and net vault total_
    - _Preservation: Deposits-only shifts render identically to before_
    - _Requirements: 2.1, 2.2, 2.3, 3.1_

  - [x] 4.2 Restructure summary section to show PO deduction breakdown in `src/pages/AccountabilityReport.jsx` (Bug 2)
    - Add `const expectedCash = netAccountability - totalChargeInvoices - totalExpenses - totalPurchases`
    - Restructure the summary right column to match paper form layout:
      - `TOTAL ACCOUNTABILITY: ₱X`
      - `Less: D. Charge Invoices: ₱Y`
      - `Less: E. Expenses: ₱Z`
      - `Less: F. Purchases: ₱W`
      - `= EXPECTED CASH: ₱(X - Y - Z - W)`
      - `TOTAL REMITTANCE: ₱R`
      - `SHORT/OVER: ₱(R - Expected)`
    - _Bug_Condition: isBugCondition_Bug2(report) where report.chargeInvoicesForShift.length > 0_
    - _Expected_Behavior: Summary shows CI deduction as labeled line item with full breakdown_
    - _Preservation: shortOver formula produces same mathematical result_
    - _Requirements: 2.4, 2.5, 3.2, 3.6_

- [x] 5. Add PO liter-based entry mode (Bug 5)

  - [x] 5.1 Add `poEntryMode` and `poLitersInput` state to `src/pages/POS.jsx`
    - Add `const [poEntryMode, setPoEntryMode] = useState('amount')` — default to current behavior
    - Add `const [poLitersInput, setPoLitersInput] = useState('')`
    - Add toggle UI (segmented control): "₱ Amount" | "Liters" above or beside the amount input in the PO form
    - When mode is "amount": show existing `poAmount` input, auto-calculate liters as `amount / price_per_liter`
    - When mode is "liters": show `poLitersInput` input, auto-calculate amount as `liters * price_per_liter` and display it
    - _Bug_Condition: isBugCondition_Bug5(poInput) where poInput.entryMode = "liters"_
    - _Expected_Behavior: Liter entry calculates amount = liters * price_per_liter_
    - _Preservation: Amount entry mode unchanged — liters = amount / price_per_liter with same precision_
    - _Requirements: 2.9, 3.5_

  - [x] 5.2 Update `handleCreatePO` to handle both entry modes
    - When `poEntryMode === 'liters'`: compute `poAmount = parseFloat(poLitersInput) * parseFloat(poPump.price_per_liter)` and `poLiters = parseFloat(poLitersInput)`
    - When `poEntryMode === 'amount'`: keep existing logic (`poLiters = poAmount / poPump.price_per_liter`)
    - Validate: in liters mode, require `poLitersInput > 0` and a pump selection
    - Reset `poEntryMode` to 'amount' and `poLitersInput` to '' after successful PO creation
    - _Bug_Condition: poEntryMode = "liters" with valid liters input_
    - _Expected_Behavior: Database record has amount = liters * price_per_liter and liters = input liters_
    - _Preservation: Amount mode produces identical database records to original code_
    - _Requirements: 2.9, 3.5_

- [x] 6. Verify fixes

  - [x] 6.1 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Accountability Report Missing Data & Shift Override
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied for all five bugs
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7, 2.8, 2.9_

  - [x] 6.2 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Report Layout, Shift Behavior, and PO Entry Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
