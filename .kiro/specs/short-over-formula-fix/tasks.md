# Implementation Plan

## Overview
This task list implements the fix for the Short/Over formula to match Sir Mark's Excel template. The fix involves updating two lines in `src/pages/AccountabilityReport.jsx` (lines 283-284) to use the correct formula from Excel cells D71 and D72.

---

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Short/Over Formula Mismatch with Sir Mark's Excel
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Test with client's concrete sample data and additional scenarios to ensure reproducibility
  - Test implementation details from Bug Condition in design:
    - Current formula incorrectly uses `totalDeposits + totalChecks` for totalRemittance
    - Current formula incorrectly subtracts expenses/purchases/calibrations from accountability
    - Sir Mark's formula: `totalRemittance = totalCashDeposit + totalCashRegister + totalWithdrawals`
    - Sir Mark's formula: `shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability`
  - The test assertions should match the Expected Behavior Properties from design:
    - totalRemittance should equal sum of cash deposit, cash register, and withdrawals (Excel D71)
    - shortOver should equal (totalRemittance + totalChargeInvoices) - totalAccountability (Excel D72)
  - Test with client's sample data: totalAccountability=6,132.44, totalCashDeposit=2,620.00, totalCashRegister=13.00, totalWithdrawals=2,000.00, totalChargeInvoices=1,500.00
  - Expected: totalRemittance=4,633.00, shortOver=0.56
  - Test with checks present to verify they are excluded from remittance
  - Test with purchases/calibrations to verify they are not subtracted in shortOver formula
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Other Calculations Remain Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (all other calculations)
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - totalAccountability calculation (fuel + oil/lubes + accessories + services + miscellaneous)
    - netAccountability calculation (totalAccountability - totalCalibrations)
    - expectedCash calculation (netAccountability - totalChargeInvoices - totalExpenses - totalPurchases)
    - All other financial calculations (totalFuelSales, totalOilLubes, totalAccessories, totalServices, totalMiscellaneous)
    - Checks and GCash deposits still tracked and displayed separately
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix Short/Over formula to match Sir Mark's Excel

  - [x] 3.1 Update totalRemittance calculation (Line 283)
    - Change from: `const totalRemittance = totalDeposits + totalChecks`
    - Change to: `const totalRemittance = totalCashDeposit + totalCashRegister + totalWithdrawals`
    - Rationale: Match Sir Mark's Excel D71 formula: =SUM(D67+D68+D69)
      - D67 = A. TOTAL CASH DEPOSIT (vault_deposit)
      - D68 = B. TOTAL CASH REGISTER (cash_register)
      - D69 = C. TOTAL CASH OUT (withdrawals)
    - This excludes checks and includes withdrawals per Sir Mark's business logic
    - _Bug_Condition: isBugCondition(input) where current formula uses totalDeposits + totalChecks_
    - _Expected_Behavior: totalRemittance = totalCashDeposit + totalCashRegister + totalWithdrawals (Excel D71)_
    - _Preservation: All other calculations remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Update shortOver calculation (Line 284)
    - Change from: `const shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)`
    - Change to: `const shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability`
    - Rationale: Match Sir Mark's Excel D72 formula: =SUM(D71+D70)-D66
      - D71 = TOTAL REMITTANCE
      - D70 = CHARGE INVOICES
      - D66 = TOTAL ACCOUNTABILITY
    - This removes incorrect subtraction of expenses/purchases/calibrations
    - _Bug_Condition: isBugCondition(input) where current formula subtracts expenses/purchases/calibrations_
    - _Expected_Behavior: shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability (Excel D72)_
    - _Preservation: All other calculations remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Short/Over Formula Matches Sir Mark's Excel
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify with client's sample data:
      - totalRemittance should equal 4,633.00 (2,620 + 13 + 2,000)
      - shortOver should equal 0.56 ((4,633 + 1,500) - 6,132.44)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Other Calculations Remain Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - Verify:
      - totalAccountability calculation unchanged
      - netAccountability calculation unchanged
      - expectedCash calculation unchanged
      - All other financial calculations unchanged
      - Checks and GCash still tracked and displayed separately
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run all tests (bug condition + preservation)
  - Verify Short/Over calculation matches Sir Mark's Excel for all test cases
  - Verify no regressions in other calculations
  - Test with client's sample data to confirm 0.56 result
  - Ask the user if questions arise or if additional verification is needed
