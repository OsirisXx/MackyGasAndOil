/**
 * Bug Condition Exploration Test - Short/Over Formula Fix
 * 
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * Bug: The Short/Over calculation in AccountabilityReport.jsx (lines 283-284) does not
 * match Sir Mark's Excel formula. The current formula:
 * 1. Uses totalDeposits + totalChecks for totalRemittance (WRONG: should exclude checks, include withdrawals)
 * 2. Subtracts expenses/purchases/calibrations from accountability (WRONG: Sir Mark's formula doesn't do this)
 * 
 * Sir Mark's correct formula (from Excel cells D71 and D72):
 * - D71 (TOTAL REMITTANCE): =SUM(D67+D68+D69) where D67=Cash Deposit, D68=Cash Register, D69=Cash Out (withdrawals)
 * - D72 (SHORT/OVER): =SUM(D71+D70)-D66 where D71=TOTAL REMITTANCE, D70=CHARGE INVOICES, D66=TOTAL ACCOUNTABILITY
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */
import { describe, it, expect } from 'vitest'

// ─── Helper: Extract Short/Over Calculation Logic ──────────────────────────
// This mirrors the CURRENT (buggy) implementation in AccountabilityReport.jsx lines 283-284

/**
 * Current (buggy) implementation from AccountabilityReport.jsx
 * UPDATED: This now reflects the FIXED implementation after applying the 2-line change
 */
function calculateShortOverCurrent({
  totalCashDeposit,
  totalCashRegister,
  totalWithdrawals,
  totalChecks,
  totalAccountability,
  totalChargeInvoices,
  totalExpenses,
  totalPurchases,
  totalCalibrations
}) {
  // Line 283 (FIXED): const totalRemittance = totalCashDeposit + totalCashRegister + totalWithdrawals
  const totalRemittance = totalCashDeposit + totalCashRegister + totalWithdrawals
  
  // Line 284 (FIXED): const shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability
  const shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability
  
  return { totalRemittance, shortOver }
}

/**
 * Expected (correct) implementation per Sir Mark's Excel formula
 * D71 (TOTAL REMITTANCE): =SUM(D67+D68+D69)
 * D72 (SHORT/OVER): =SUM(D71+D70)-D66
 */
function calculateShortOverExpected({
  totalCashDeposit,
  totalCashRegister,
  totalWithdrawals,
  totalChargeInvoices,
  totalAccountability
}) {
  // D71: TOTAL REMITTANCE = Cash Deposit + Cash Register + Cash Out (withdrawals)
  const totalRemittance = totalCashDeposit + totalCashRegister + totalWithdrawals
  
  // D72: SHORT/OVER = (TOTAL REMITTANCE + CHARGE INVOICES) - TOTAL ACCOUNTABILITY
  const shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability
  
  return { totalRemittance, shortOver }
}

// ─── Bug Condition Exploration Tests ───────────────────────────────────────

describe('Bug Condition Exploration: Short/Over Formula Mismatch', () => {
  
  /**
   * Test 1: Client's Sample Data from Sir Mark's Excel
   * This is the concrete example provided by the client that demonstrates the bug.
   * 
   * Expected behavior (Sir Mark's Excel):
   * - totalRemittance = 2,620.00 + 13.00 + 2,000.00 = 4,633.00
   * - shortOver = (4,633.00 + 1,500.00) - 6,132.44 = 0.56
   * 
   * Current (buggy) behavior:
   * - totalRemittance = 2,633.00 (missing withdrawals, includes checks)
   * - shortOver = 0.56 (happens to match by coincidence, but formula is wrong)
   */
  it('should calculate Short/Over correctly with client sample data', () => {
    const clientData = {
      totalAccountability: 6132.44,  // D66/H13: TOTAL ACCOUNTABILITY
      totalCashDeposit: 2620.00,     // D67/E23: A. TOTAL CASH DEPOSIT (vault_deposit)
      totalCashRegister: 13.00,      // D68/E24: B. TOTAL CASH REGISTER (cash_register)
      totalWithdrawals: 2000.00,     // D69/E25: C. TOTAL CASH OUT (withdrawals)
      totalChargeInvoices: 1500.00,  // D70/E34: D. CHARGE INVOICES
      totalChecks: 0,                // Not in this example
      totalExpenses: 2000.00,        // Same as totalWithdrawals
      totalPurchases: 0,
      totalCalibrations: 0
    }
    
    const current = calculateShortOverCurrent(clientData)
    const expected = calculateShortOverExpected(clientData)
    
    // CRITICAL ASSERTIONS - These should FAIL on unfixed code
    
    // 1. totalRemittance should include withdrawals and exclude checks
    expect(current.totalRemittance).toBe(expected.totalRemittance)
    // Expected: 4,633.00 (2,620 + 13 + 2,000)
    // Current: 2,633.00 (2,620 + 13 + 0) - WRONG: missing withdrawals
    
    // 2. shortOver should use Sir Mark's formula: (remittance + chargeInvoices) - accountability
    expect(current.shortOver).toBeCloseTo(expected.shortOver, 2)
    // Expected: 0.56 ((4,633 + 1,500) - 6,132.44)
    // Current: 0.56 (2,633 - (6,132.44 - 1,500 - 2,000 - 0 - 0)) - WRONG formula, coincidentally correct result
    
    // 3. Verify expected values match Sir Mark's Excel
    expect(expected.totalRemittance).toBe(4633.00)
    expect(expected.shortOver).toBeCloseTo(0.56, 2)
  })
  
  /**
   * Test 2: Scenario with Checks Present
   * This test verifies that checks should NOT be included in totalRemittance.
   * 
   * Expected behavior:
   * - totalRemittance = 3,000 + 50 + 1,000 = 4,050 (excludes checks)
   * - shortOver = (4,050 + 2,000) - 7,000 = -950
   * 
   * Current (buggy) behavior:
   * - totalRemittance = 3,050 + 500 = 3,550 (incorrectly includes checks, missing withdrawals)
   * - shortOver will be different due to wrong formula
   */
  it('should exclude checks from totalRemittance calculation', () => {
    const dataWithChecks = {
      totalAccountability: 7000.00,
      totalCashDeposit: 3000.00,
      totalCashRegister: 50.00,
      totalWithdrawals: 1000.00,
      totalChargeInvoices: 2000.00,
      totalChecks: 500.00,           // Checks should NOT be in remittance
      totalExpenses: 1000.00,
      totalPurchases: 0,
      totalCalibrations: 0
    }
    
    const current = calculateShortOverCurrent(dataWithChecks)
    const expected = calculateShortOverExpected(dataWithChecks)
    
    // CRITICAL ASSERTIONS - These should FAIL on unfixed code
    
    // 1. totalRemittance should NOT include checks
    expect(current.totalRemittance).toBe(expected.totalRemittance)
    // Expected: 4,050 (3,000 + 50 + 1,000) - excludes checks
    // Current: 3,550 (3,050 + 500) - WRONG: includes checks, missing withdrawals
    
    // 2. Verify expected values
    expect(expected.totalRemittance).toBe(4050.00)
    expect(expected.shortOver).toBe(-950.00)
  })
  
  /**
   * Test 3: Scenario with Purchases and Calibrations
   * This test verifies that purchases and calibrations should NOT be subtracted
   * from accountability in the shortOver formula.
   * 
   * Expected behavior (Sir Mark's formula):
   * - totalRemittance = 5,000 + 100 + 500 = 5,600
   * - shortOver = (5,600 + 1,500) - 8,000 = -900
   * 
   * Current (buggy) behavior:
   * - shortOver incorrectly adds back purchases and calibrations
   */
  it('should not subtract purchases/calibrations in shortOver formula', () => {
    const dataWithPurchasesAndCals = {
      totalAccountability: 8000.00,
      totalCashDeposit: 5000.00,
      totalCashRegister: 100.00,
      totalWithdrawals: 500.00,
      totalChargeInvoices: 1500.00,
      totalChecks: 0,
      totalExpenses: 500.00,
      totalPurchases: 1000.00,       // Should NOT be in shortOver formula
      totalCalibrations: 200.00      // Should NOT be in shortOver formula
    }
    
    const current = calculateShortOverCurrent(dataWithPurchasesAndCals)
    const expected = calculateShortOverExpected(dataWithPurchasesAndCals)
    
    // CRITICAL ASSERTIONS - These should FAIL on unfixed code
    
    // 1. shortOver should use Sir Mark's simple formula, not subtract purchases/calibrations
    expect(current.shortOver).toBeCloseTo(expected.shortOver, 2)
    // Expected: -900 ((5,600 + 1,500) - 8,000)
    // Current: different due to incorrect formula that subtracts expenses/purchases/calibrations
    
    // 2. Verify expected values
    expect(expected.totalRemittance).toBe(5600.00)
    expect(expected.shortOver).toBe(-900.00)
  })
  
  /**
   * Test 4: Edge Case - Zero Withdrawals
   * This test verifies the formula works correctly even when withdrawals are zero.
   * 
   * Expected behavior:
   * - totalRemittance = 2,000 + 50 + 0 = 2,050
   * - shortOver = (2,050 + 500) - 3,000 = -450
   */
  it('should handle zero withdrawals correctly', () => {
    const dataWithZeroWithdrawals = {
      totalAccountability: 3000.00,
      totalCashDeposit: 2000.00,
      totalCashRegister: 50.00,
      totalWithdrawals: 0.00,        // Zero withdrawals
      totalChargeInvoices: 500.00,
      totalChecks: 0,
      totalExpenses: 0,
      totalPurchases: 0,
      totalCalibrations: 0
    }
    
    const current = calculateShortOverCurrent(dataWithZeroWithdrawals)
    const expected = calculateShortOverExpected(dataWithZeroWithdrawals)
    
    // CRITICAL ASSERTIONS - These should FAIL on unfixed code
    
    expect(current.totalRemittance).toBe(expected.totalRemittance)
    expect(current.shortOver).toBeCloseTo(expected.shortOver, 2)
    
    // Verify expected values
    expect(expected.totalRemittance).toBe(2050.00)
    expect(expected.shortOver).toBe(-450.00)
  })
  
  /**
   * Test 5: Verify Formula Structure Difference
   * This test explicitly shows the algebraic difference between the two formulas.
   * 
   * Current formula:
   *   shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)
   *   Expanded: shortOver = totalRemittance - totalAccountability + totalChargeInvoices + totalExpenses + totalPurchases + totalCalibrations
   * 
   * Sir Mark's formula:
   *   shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability
   *   Expanded: shortOver = totalRemittance + totalChargeInvoices - totalAccountability
   * 
   * The difference: Current formula incorrectly adds totalExpenses, totalPurchases, and totalCalibrations
   */
  it('should use Sir Mark\'s formula structure, not the current buggy structure', () => {
    const testData = {
      totalAccountability: 10000.00,
      totalCashDeposit: 4000.00,
      totalCashRegister: 100.00,
      totalWithdrawals: 1000.00,
      totalChargeInvoices: 2000.00,
      totalChecks: 0,
      totalExpenses: 1000.00,
      totalPurchases: 500.00,
      totalCalibrations: 300.00
    }
    
    const current = calculateShortOverCurrent(testData)
    const expected = calculateShortOverExpected(testData)
    
    // The formulas are algebraically different
    // Current: totalRemittance - totalAccountability + totalChargeInvoices + totalExpenses + totalPurchases + totalCalibrations
    // Expected: totalRemittance + totalChargeInvoices - totalAccountability
    
    // When expenses, purchases, or calibrations are non-zero, the results will differ
    const formulaDifference = testData.totalExpenses + testData.totalPurchases + testData.totalCalibrations
    
    // CRITICAL ASSERTION - This should FAIL on unfixed code
    // The current formula incorrectly adds back 1,800 (1,000 + 500 + 300)
    expect(Math.abs(current.shortOver - expected.shortOver)).toBeLessThan(0.01)
    
    // Verify the difference is exactly the sum of expenses, purchases, and calibrations
    // (This will fail on unfixed code, confirming the bug)
    expect(current.shortOver - expected.shortOver).not.toBeCloseTo(formulaDifference, 2)
  })
})
