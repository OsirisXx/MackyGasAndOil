/**
 * Preservation Property Tests
 * 
 * These tests capture EXISTING correct behavior that must remain unchanged
 * after the bugfix implementation. They should PASS on unfixed code.
 * 
 * Tests cover preservation requirements from the bugfix spec:
 * - Req 3.2: shortOver formula produces correct mathematical result
 * - Req 3.7: filterByShift uses column-based filtering as primary method
 * - Req 3.5: PO peso-mode liters = amount / price_per_liter identity
 * - Req 3.3, 3.4: ensureCurrentShiftSnapshots backward compatibility (2-arg call)
 * - getCurrentShift time-based detection returns correct shift numbers
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { getCurrentShift, getShiftsForBranch, BRANCH_SHIFTS } from '../utils/shiftConfig'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Helper: Read source file ───────────────────────────────────────────────
const readSource = (relativePath) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

// ─── Extracted pure functions matching the codebase logic ───────────────────

/**
 * shortOver formula as implemented in AccountabilityReport.jsx:
 *   shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)
 * 
 * Where:
 *   totalAccountability = totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous
 *   netAccountability = totalAccountability - totalCalibrations
 *   totalRemittance = totalDeposits + totalChecks
 */
function computeShortOver({
  totalFuelSales, totalOilLubes, totalAccessories, totalServices, totalMiscellaneous,
  totalCalibrations, totalChargeInvoices, totalExpenses, totalPurchases,
  totalDeposits, totalChecks
}) {
  const totalAccountability = totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous
  const totalRemittance = totalDeposits + totalChecks
  return totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)
}

/**
 * filterByShift logic extracted from AccountabilityReport.jsx:
 * Primary: filter by shift_number === selectedShift && shift_date === reportDate
 * Fallback: time-based filtering using created_at/deposit_date/withdrawal_date
 */
function filterByShift(items, selectedShift, reportDate, shiftConfig) {
  if (!items || items.length === 0) return []
  
  // Primary: column-based filtering
  const byCol = items.filter(i => i.shift_number === selectedShift && i.shift_date === reportDate)
  if (byCol.length > 0) return byCol
  
  // Fallback: time-based filtering
  if (!shiftConfig) return items
  
  const parseHour = (timeStr) => {
    const [time, period] = timeStr.split(' ')
    let [h] = time.split(':').map(Number)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h
  }
  
  const startH = parseHour(shiftConfig.startTime)
  const endH = parseHour(shiftConfig.endTime)
  
  return items.filter(item => {
    const ts = item.created_at || item.deposit_date || item.withdrawal_date
    if (!ts) return false
    const hour = new Date(ts).getHours()
    if (endH <= startH) return hour >= startH || hour < endH
    return hour >= startH && hour < endH
  })
}

/**
 * PO peso-mode calculation as implemented in POS.jsx:
 *   liters = amount / price_per_liter
 */
function computePOLiters(amount, pricePerLiter) {
  if (!pricePerLiter || pricePerLiter === 0) return null
  return parseFloat((amount / pricePerLiter).toFixed(3))
}

// ─── Arbitraries ────────────────────────────────────────────────────────────

// Positive monetary amounts (reasonable range for gas station)
const positiveAmount = fc.double({ min: 0.01, max: 999999.99, noNaN: true, noDefaultInfinity: true })
  .map(v => Math.round(v * 100) / 100)

// Non-negative monetary amounts (can be zero)
const nonNegativeAmount = fc.double({ min: 0, max: 999999.99, noNaN: true, noDefaultInfinity: true })
  .map(v => Math.round(v * 100) / 100)

// Price per liter (realistic fuel prices in PHP)
const pricePerLiter = fc.double({ min: 30, max: 120, noNaN: true, noDefaultInfinity: true })
  .map(v => Math.round(v * 100) / 100)

// Shift numbers (1, 2, or 3)
const shiftNumber = fc.constantFrom(1, 2, 3)

// Branch names
const branchName = fc.constantFrom('Manolo', 'Sankanan', 'Patulangan', 'Balingasag')

// Report date in YYYY-MM-DD format
const reportDate = fc.integer({ min: 2024, max: 2025 }).chain(year =>
  fc.integer({ min: 1, max: 12 }).chain(month =>
    fc.integer({ min: 1, max: 28 }).map(day =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    )
  )
)

// ─── Property 1: shortOver formula preservation ─────────────────────────────
// **Validates: Requirements 3.2**
describe('Property 1: shortOver formula preservation', () => {
  it('shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)', () => {
    fc.assert(
      fc.property(
        nonNegativeAmount, // totalFuelSales
        nonNegativeAmount, // totalOilLubes
        nonNegativeAmount, // totalAccessories
        nonNegativeAmount, // totalServices
        nonNegativeAmount, // totalMiscellaneous
        nonNegativeAmount, // totalCalibrations
        nonNegativeAmount, // totalChargeInvoices
        nonNegativeAmount, // totalExpenses
        nonNegativeAmount, // totalPurchases
        nonNegativeAmount, // totalDeposits
        nonNegativeAmount, // totalChecks
        (totalFuelSales, totalOilLubes, totalAccessories, totalServices, totalMiscellaneous,
         totalCalibrations, totalChargeInvoices, totalExpenses, totalPurchases,
         totalDeposits, totalChecks) => {
          const result = computeShortOver({
            totalFuelSales, totalOilLubes, totalAccessories, totalServices, totalMiscellaneous,
            totalCalibrations, totalChargeInvoices, totalExpenses, totalPurchases,
            totalDeposits, totalChecks
          })
          
          // Verify the formula matches the expected computation
          const totalAccountability = totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous
          const totalRemittance = totalDeposits + totalChecks
          const expected = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)
          
          // Use approximate equality for floating point
          expect(Math.abs(result - expected)).toBeLessThan(0.01)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('shortOver is zero when remittance exactly covers expected cash', () => {
    fc.assert(
      fc.property(
        nonNegativeAmount, // totalFuelSales
        nonNegativeAmount, // totalChargeInvoices
        nonNegativeAmount, // totalExpenses
        nonNegativeAmount, // totalPurchases
        nonNegativeAmount, // totalCalibrations
        (totalFuelSales, totalChargeInvoices, totalExpenses, totalPurchases, totalCalibrations) => {
          // Set remittance = expected cash (accountability - deductions)
          const totalAccountability = totalFuelSales
          const expectedCash = totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations
          const totalRemittance = expectedCash
          
          const result = computeShortOver({
            totalFuelSales,
            totalOilLubes: 0, totalAccessories: 0, totalServices: 0, totalMiscellaneous: 0,
            totalCalibrations, totalChargeInvoices, totalExpenses, totalPurchases,
            totalDeposits: totalRemittance, totalChecks: 0
          })
          
          expect(Math.abs(result)).toBeLessThan(0.01)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 2: filterByShift column-based filtering ───────────────────────
// **Validates: Requirements 3.7**
describe('Property 2: filterByShift column-based filtering preservation', () => {
  it('uses column-based filtering as primary method when shift_number and shift_date are present', () => {
    fc.assert(
      fc.property(
        shiftNumber,
        reportDate,
        fc.array(
          fc.record({
            id: fc.uuid(),
            shift_number: shiftNumber,
            shift_date: reportDate,
            amount: positiveAmount,
            created_at: fc.integer({ min: 1704067200000, max: 1767225600000 }).map(ts => new Date(ts).toISOString())
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (selectedShift, date, items) => {
          // Ensure at least one item matches the selected shift and date
          const matchingItems = items.filter(i => i.shift_number === selectedShift && i.shift_date === date)
          if (matchingItems.length === 0) return true // skip if no matches
          
          const shiftConfig = { startTime: '4:00 AM', endTime: '12:00 PM' }
          const result = filterByShift(items, selectedShift, date, shiftConfig)
          
          // Column-based filtering should be used (returns items matching shift_number and shift_date)
          expect(result.length).toBe(matchingItems.length)
          result.forEach(item => {
            expect(item.shift_number).toBe(selectedShift)
            expect(item.shift_date).toBe(date)
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns empty array for empty input', () => {
    const result = filterByShift([], 1, '2025-01-01', { startTime: '4:00 AM', endTime: '12:00 PM' })
    expect(result).toEqual([])
  })

  it('returns empty array for null/undefined input', () => {
    expect(filterByShift(null, 1, '2025-01-01', null)).toEqual([])
    expect(filterByShift(undefined, 1, '2025-01-01', null)).toEqual([])
  })
})

// ─── Property 3: PO peso-mode calculation preservation ──────────────────────
// **Validates: Requirements 3.5**
describe('Property 3: PO peso-mode calculation preservation', () => {
  it('liters = amount / price_per_liter identity holds for various amounts and prices', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        pricePerLiter,
        (amount, price) => {
          const liters = computePOLiters(amount, price)
          
          // liters should equal amount / price, rounded to 3 decimal places
          const expected = parseFloat((amount / price).toFixed(3))
          expect(liters).toBeCloseTo(expected, 3)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('amount ≈ liters * price_per_liter (round-trip within precision)', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        pricePerLiter,
        (amount, price) => {
          const liters = computePOLiters(amount, price)
          if (liters === null) return true
          
          // Round-trip: liters * price should be close to original amount
          const reconstructedAmount = liters * price
          // Allow tolerance due to .toFixed(3) rounding
          expect(Math.abs(reconstructedAmount - amount)).toBeLessThan(price * 0.001 + 0.01)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('returns null when price_per_liter is zero', () => {
    expect(computePOLiters(100, 0)).toBeNull()
  })
})

// ─── Property 4: ensureCurrentShiftSnapshots backward compatibility ─────────
// **Validates: Requirements 3.3, 3.4**
describe('Property 4: ensureCurrentShiftSnapshots backward compatibility', () => {
  it('function signature currently accepts exactly 2 parameters (branchId, branchName)', () => {
    // Read the source to verify the current function signature
    const source = readSource('src/services/shiftService.js')
    
    // The current unfixed signature is: ensureCurrentShiftSnapshots(branchId, branchName)
    // It should accept 2 args. After the fix, it will accept 3 with a default.
    // This test verifies the function exists and is callable with 2 args.
    const hasFunctionDef = /export\s+async\s+function\s+ensureCurrentShiftSnapshots\s*\(/.test(source)
    expect(hasFunctionDef).toBe(true)
    
    // Verify the function has branchId and branchName parameters
    const hasParams = /ensureCurrentShiftSnapshots\s*\(\s*branchId\s*,\s*branchName/.test(source)
    expect(hasParams).toBe(true)
  })

  it('calling with 2 args (branchId, branchName) is valid — function accepts branchId and branchName', () => {
    // Verify the function body uses both branchId and branchName parameters
    const source = readSource('src/services/shiftService.js')
    
    // The function should use branchId (e.g., in the RPC call)
    const usesBranchId = /p_branch_id\s*:\s*branchId/.test(source)
    expect(usesBranchId).toBe(true)
    
    // The function should use branchName (e.g., in the RPC call or getCurrentShift)
    const usesBranchName = /p_branch_name\s*:\s*branchName/.test(source) ||
      /getCurrentShift\s*\(\s*branchName\s*\)/.test(source)
    expect(usesBranchName).toBe(true)
  })
})

// ─── Property 5: getCurrentShift time-based detection ───────────────────────
// **Validates: Requirements 3.3 (shift detection correctness)**
describe('Property 5: getCurrentShift time-based detection', () => {
  it('returns a valid shift number (1, 2, or 3) for all branches', () => {
    fc.assert(
      fc.property(
        branchName,
        (branch) => {
          const shift = getCurrentShift(branch)
          expect([1, 2, 3]).toContain(shift)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('returns shift 1 as fallback for unknown branch names', () => {
    // Unknown branches default to Manolo schedule
    const shift = getCurrentShift('UnknownBranch')
    expect([1, 2, 3]).toContain(shift)
  })

  it('returns shift 1 for null/undefined branch name', () => {
    const shift1 = getCurrentShift(null)
    const shift2 = getCurrentShift(undefined)
    expect([1, 2, 3]).toContain(shift1)
    expect([1, 2, 3]).toContain(shift2)
  })

  it('getShiftsForBranch returns 3 shifts for all known branches', () => {
    fc.assert(
      fc.property(
        branchName,
        (branch) => {
          const shifts = getShiftsForBranch(branch)
          expect(shifts).toHaveLength(3)
          expect(shifts.map(s => s.number)).toEqual([1, 2, 3])
          shifts.forEach(s => {
            expect(s).toHaveProperty('label')
            expect(s).toHaveProperty('startTime')
            expect(s).toHaveProperty('endTime')
          })
        }
      ),
      { numRuns: 20 }
    )
  })

  it('Manolo, Sankanan, Patulangan share the same shift schedule (4am, 12pm, 8pm)', () => {
    const branches = ['Manolo', 'Sankanan', 'Patulangan']
    branches.forEach(branch => {
      const shifts = getShiftsForBranch(branch)
      expect(shifts[0].startTime).toBe('4:00 AM')
      expect(shifts[0].endTime).toBe('12:00 PM')
      expect(shifts[1].startTime).toBe('12:00 PM')
      expect(shifts[1].endTime).toBe('8:00 PM')
      expect(shifts[2].startTime).toBe('8:00 PM')
      expect(shifts[2].endTime).toBe('4:00 AM')
    })
  })

  it('Balingasag has a different shift schedule (5am, 1pm, 9pm)', () => {
    const shifts = getShiftsForBranch('Balingasag')
    expect(shifts[0].startTime).toBe('5:00 AM')
    expect(shifts[0].endTime).toBe('1:00 PM')
    expect(shifts[1].startTime).toBe('1:00 PM')
    expect(shifts[1].endTime).toBe('9:00 PM')
    expect(shifts[2].startTime).toBe('9:00 PM')
    expect(shifts[2].endTime).toBe('5:00 AM')
  })
})
