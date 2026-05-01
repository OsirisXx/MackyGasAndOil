# Bugfix Requirements Document

## Introduction

Multiple bugs were discovered during dry run of the Macky Oil & Gas station management system. These bugs affect the accountability report accuracy, shift management behavior, and PO entry workflow. The issues cause discrepancies between the system's accountability report and the manual paper form used by cashiers, and the auto-shift behavior disrupts cashier workflows. Five distinct bugs are addressed:

1. Vault Deposits section missing withdrawals (cash out) in the accountability report
2. PO (Purchase Orders / Charge Invoices) not properly deducted or displayed in the accountability report
3. Automatic shift change triggered by time instead of manual cashier action
4. Shift selection on login needs to fully override auto-shift detection
5. PO entry lacks a liter-based input option for liter-denominated purchase orders

## Bug Analysis

### Current Behavior (Defect)

**Bug 1 — Vault Deposits missing withdrawals:**

1.1 WHEN a cashier makes vault withdrawals (cash out) during a shift THEN the system fetches the withdrawal data (`withdrawalsData = filterByShift(allDayWith)`) but never stores it in component state or renders it in the Vault Deposits section of the accountability report

1.2 WHEN viewing the accountability report for a shift that has withdrawals THEN the system only displays deposits in the VAULT DEPOSITS table and shows "No vault deposits this shift" if there are no deposits, even when withdrawals exist

1.3 WHEN the `filterByShift` function filters deposits or withdrawals by `shift_number` and `shift_date` columns AND those columns are NULL (records created before migration 23 backfill) THEN the primary filter returns 0 results and falls back to time-based filtering using `created_at` which may not match the `deposit_date` column used by the cash_deposits table

**Bug 2 — PO not deducted from cash sales display:**

1.4 WHEN viewing the accountability report THEN the system shows "Total Sales" as `netAccountability` (total fuel + products - calibrations) but does not separately display the PO/Charge Invoice deduction from cash, making it impossible for cashiers to reconcile with their manual paper form which shows the PO deduction explicitly

1.5 WHEN the `filterByShift` function filters purchase orders by `shift_number` and `shift_date` columns AND those columns are NULL (pre-migration-23 records) THEN the charge invoice total may be incorrect because the time-based fallback filter may not capture all POs for the shift

**Bug 3 — Auto shift change:**

1.6 WHEN a cashier stays logged in past the time boundary of their current shift THEN the `ensureCurrentShiftSnapshots` function automatically detects a different shift number via `getCurrentShift()`, closes the old shift's pump snapshots, and creates new shift snapshots — effectively forcing a shift transition without cashier consent

1.7 WHEN the POS page loads or the accountability report is viewed THEN `ensureCurrentShiftSnapshots` is called which uses `getCurrentShift(branchName)` to determine the shift based on current wall-clock time, overriding the cashier's manually selected shift

**Bug 4 — Shift selection on login not fully respected:**

1.8 WHEN a cashier selects a shift on the POS login gate AND the `ensureCurrentShiftSnapshots` function is called (on POS load or accountability view) THEN the function uses `getCurrentShift(branchName)` (time-based auto-detection) instead of the cashier's `selectedShift`, potentially creating snapshots for the wrong shift

**Bug 5 — PO missing liter-based entry option:**

1.9 WHEN a cashier creates a PO where the customer ordered a specific number of liters THEN the system only allows entering a peso amount and auto-calculates liters as `amount / price_per_liter`, with no option to enter liters directly and have the amount calculated as `liters * price_per_liter`

### Expected Behavior (Correct)

**Bug 1 — Vault Deposits should include withdrawals:**

2.1 WHEN a cashier makes vault withdrawals during a shift THEN the system SHALL store the filtered withdrawal data in component state and render it in the accountability report alongside deposits, showing both deposits and withdrawals (cash out) in the VAULT DEPOSITS section

2.2 WHEN viewing the accountability report for a shift THEN the system SHALL display a separate withdrawals table (or combined vault activity table) showing each withdrawal with cashier name, amount, reason, and notes, and SHALL show a net vault total (deposits minus withdrawals)

2.3 WHEN filtering deposits or withdrawals by shift THEN the system SHALL correctly handle records where `shift_number`/`shift_date` columns are NULL by using the `deposit_date` or `withdrawal_date` column (not just `created_at`) in the time-based fallback filter

**Bug 2 — PO deduction should be visible in accountability:**

2.4 WHEN viewing the accountability report THEN the system SHALL display the Charge Invoice (PO) total as a clearly labeled deduction line item so cashiers can see how POs reduce the expected cash remittance, matching the paper form layout (Total Accountability - D. Charge Invoices - E. Expenses - F. Purchases = expected cash)

2.5 WHEN filtering purchase orders by shift THEN the system SHALL correctly handle records where `shift_number`/`shift_date` columns are NULL by using the `created_at` timestamp in the time-based fallback filter, ensuring all POs for the shift are captured

**Bug 3 — Shift should not auto-change:**

2.6 WHEN a cashier has selected a shift on the POS login gate THEN the system SHALL keep the cashier on that selected shift regardless of wall-clock time, and SHALL NOT automatically close the shift or create new shift snapshots based on time boundaries

2.7 WHEN `ensureCurrentShiftSnapshots` is called THEN the system SHALL use the cashier's manually selected shift number instead of the time-based `getCurrentShift()` result, so that pump snapshots are created/maintained for the correct shift

**Bug 4 — Shift selection should fully override auto-detection:**

2.8 WHEN a cashier selects a shift on the POS login gate and confirms it THEN the system SHALL pass the selected shift number to all shift-related functions including `ensureCurrentShiftSnapshots`, ensuring snapshots, sales, deposits, withdrawals, and POs are all recorded under the cashier's chosen shift

**Bug 5 — PO should support liter-based entry:**

2.9 WHEN a cashier creates a PO THEN the system SHALL provide an input mode toggle allowing entry by either peso amount or liters, where selecting "liters" mode allows entering a liter quantity and auto-calculates the peso amount as `liters * price_per_liter`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN viewing the accountability report for a shift with only deposits and no withdrawals THEN the system SHALL CONTINUE TO display the deposits correctly with the same layout and totals as before

3.2 WHEN the short/over calculation is performed THEN the system SHALL CONTINUE TO use the formula `shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)` with the same mathematical result

3.3 WHEN a cashier records a cash sale, deposit, withdrawal, or PO THEN the system SHALL CONTINUE TO save the `shift_date` and `shift_number` columns on the record

3.4 WHEN a cashier selects a shift and confirms it on the POS login gate THEN the system SHALL CONTINUE TO display the shift selection UI with the same look and feel, and SHALL CONTINUE TO allow changing shifts via the change-shift dialog

3.5 WHEN a cashier creates a PO by entering a peso amount (the current default mode) THEN the system SHALL CONTINUE TO auto-calculate liters as `amount / price_per_liter` with the same precision and behavior

3.6 WHEN the accountability report prints THEN the system SHALL CONTINUE TO produce a printable layout matching the paper form structure with all existing sections intact

3.7 WHEN records have valid `shift_number` and `shift_date` columns THEN the `filterByShift` function SHALL CONTINUE TO use column-based filtering as the primary method before falling back to time-based filtering

3.8 WHEN viewing the charge invoices detail section (page 2 of the report) THEN the system SHALL CONTINUE TO display individual PO line items with customer name, plate number, fuel type, liters, and amount

---

## Bug Condition Derivation

### Bug 1: Vault Withdrawals Not Displayed

```pascal
FUNCTION isBugCondition_Bug1(report)
  INPUT: report of type AccountabilityReportView
  OUTPUT: boolean
  
  // Bug triggers when there are withdrawals for the shift
  RETURN report.withdrawalsForShift.length > 0
END FUNCTION

// Property: Fix Checking - Withdrawals must be rendered
FOR ALL report WHERE isBugCondition_Bug1(report) DO
  rendered ← renderAccountabilityReport'(report)
  ASSERT rendered.vaultSection.containsWithdrawals = true
  ASSERT rendered.vaultSection.withdrawalTotal = SUM(report.withdrawalsForShift.amount)
END FOR

// Property: Preservation Checking
FOR ALL report WHERE NOT isBugCondition_Bug1(report) DO
  ASSERT renderAccountabilityReport(report) = renderAccountabilityReport'(report)
END FOR
```

### Bug 2: PO Deduction Not Visible

```pascal
FUNCTION isBugCondition_Bug2(report)
  INPUT: report of type AccountabilityReportView
  OUTPUT: boolean
  
  // Bug triggers when there are charge invoices (POs) for the shift
  RETURN report.chargeInvoicesForShift.length > 0
END FUNCTION

// Property: Fix Checking - PO deduction must be clearly displayed
FOR ALL report WHERE isBugCondition_Bug2(report) DO
  rendered ← renderAccountabilityReport'(report)
  ASSERT rendered.summarySection.showsChargeInvoiceDeduction = true
  ASSERT rendered.summarySection.netCashExpected = totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations
END FOR

// Property: Preservation Checking
FOR ALL report WHERE NOT isBugCondition_Bug2(report) DO
  ASSERT renderAccountabilityReport(report).shortOver = renderAccountabilityReport'(report).shortOver
END FOR
```

### Bug 3: Auto Shift Change

```pascal
FUNCTION isBugCondition_Bug3(shiftContext)
  INPUT: shiftContext of type ShiftContext
  OUTPUT: boolean
  
  // Bug triggers when wall-clock time is past the selected shift's time boundary
  RETURN getCurrentShift(shiftContext.branchName) ≠ shiftContext.selectedShift
END FUNCTION

// Property: Fix Checking - Selected shift must be preserved
FOR ALL ctx WHERE isBugCondition_Bug3(ctx) DO
  result ← ensureCurrentShiftSnapshots'(ctx.branchId, ctx.branchName, ctx.selectedShift)
  ASSERT result.shiftNumber = ctx.selectedShift
  ASSERT no_auto_close(ctx.selectedShift)
END FOR

// Property: Preservation Checking
FOR ALL ctx WHERE NOT isBugCondition_Bug3(ctx) DO
  ASSERT ensureCurrentShiftSnapshots(ctx) = ensureCurrentShiftSnapshots'(ctx)
END FOR
```

### Bug 4: Shift Selection Not Passed to Snapshot Functions

```pascal
FUNCTION isBugCondition_Bug4(posContext)
  INPUT: posContext of type POSContext
  OUTPUT: boolean
  
  // Bug triggers when cashier selected a shift different from auto-detected
  RETURN posContext.selectedShift ≠ getCurrentShift(posContext.branchName)
END FUNCTION

// Property: Fix Checking - Selected shift must be used for snapshots
FOR ALL ctx WHERE isBugCondition_Bug4(ctx) DO
  snapshots ← ensureCurrentShiftSnapshots'(ctx.branchId, ctx.branchName, ctx.selectedShift)
  ASSERT snapshots.shiftNumber = ctx.selectedShift
END FOR

// Property: Preservation Checking
FOR ALL ctx WHERE NOT isBugCondition_Bug4(ctx) DO
  ASSERT ensureCurrentShiftSnapshots(ctx) = ensureCurrentShiftSnapshots'(ctx)
END FOR
```

### Bug 5: PO Liter-Based Entry

```pascal
FUNCTION isBugCondition_Bug5(poInput)
  INPUT: poInput of type POCreationInput
  OUTPUT: boolean
  
  // Bug triggers when the PO is liter-denominated (customer orders by liters)
  RETURN poInput.entryMode = "liters"
END FUNCTION

// Property: Fix Checking - Liter entry must calculate amount correctly
FOR ALL po WHERE isBugCondition_Bug5(po) DO
  result ← createPO'(po)
  ASSERT result.amount = po.liters * po.pricePerLiter
  ASSERT result.liters = po.liters
END FOR

// Property: Preservation Checking - Amount entry mode unchanged
FOR ALL po WHERE NOT isBugCondition_Bug5(po) DO
  ASSERT createPO(po) = createPO'(po)
END FOR
```
