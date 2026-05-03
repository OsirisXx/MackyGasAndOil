# POS Shift Persistence Fix - Bugfix Design

## Overview

The bug occurs when scheduled price changes trigger a broadcast notification that calls `fetchPumps()`, causing the POS component to re-render. During this re-render, the shift selection gate condition `if (!shiftConfirmed || selectedShift === null)` evaluates before React state is fully restored, causing the cashier to be kicked back to the shift selection screen.

The fix involves two key changes:
1. **Replace toast notification with a centered alert modal** that displays old → new prices for each updated pump
2. **Prevent shift selection gate from triggering during price updates** by adding a flag that bypasses the gate when a price update is in progress

This approach ensures cashiers are properly informed about price changes through a prominent modal while maintaining their active POS session without interruption.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a price change broadcast is received and `fetchPumps()` causes a re-render that evaluates the shift selection gate
- **Property (P)**: The desired behavior - cashiers should see a price change alert modal and remain on the POS terminal without being kicked to shift selection
- **Preservation**: Existing shift selection behavior for initial login, manual shift changes, and checkout must remain unchanged
- **Shift Selection Gate**: The conditional check `if (!shiftConfirmed || selectedShift === null)` that determines whether to show the shift selection screen
- **Price Change Broadcast**: The Supabase realtime broadcast sent by the Edge Function when scheduled price changes are executed
- **fetchPumps()**: The Zustand store function that queries the database for updated pump prices and updates the `pumps` state array
- **sessionStorage**: Browser storage used to persist `selectedShift` and `shiftConfirmed` values across re-renders

## Bug Details

### Bug Condition

The bug manifests when a scheduled price change broadcast is received while a cashier is actively using the POS terminal. The broadcast handler calls `fetchPumps()` which updates the Zustand store, triggering a React re-render. During this re-render, the shift selection gate evaluates before state is fully restored, causing `shiftConfirmed` or `selectedShift` to be temporarily null/false, which redirects the cashier to the shift selection screen.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type BroadcastEvent
  OUTPUT: boolean
  
  RETURN input.event === 'price_change'
         AND cashierIsLoggedIn()
         AND shiftIsConfirmed()
         AND fetchPumps() is called
         AND componentReRenders()
         AND shiftSelectionGateEvaluatesBeforeStateRestoration()
END FUNCTION
```

### Examples

- **Example 1**: Cashier is recording a fuel sale when a scheduled price change executes at 6:00 AM. The broadcast triggers `fetchPumps()`, causing a re-render. The shift selection gate evaluates with `shiftConfirmed = false` temporarily, kicking the cashier back to shift selection. **Expected**: Cashier sees a price change alert modal and continues working.

- **Example 2**: Cashier is viewing today's transactions when multiple pump prices update simultaneously. The broadcast handler calls `fetchPumps()`, the component re-renders, and the cashier is redirected to shift selection. **Expected**: Cashier sees a modal showing "Pump 1: ₱55.00 → ₱56.50, Pump 2: ₱54.00 → ₱55.00" and remains on the POS screen.

- **Example 3**: Cashier is in the middle of creating a purchase order when a price change occurs. The PO form state is lost when they're kicked to shift selection. **Expected**: Cashier sees the price alert modal, dismisses it, and continues filling out the PO form without losing any data.

- **Edge Case**: Cashier receives a price change broadcast immediately after logging in but before confirming their shift. **Expected**: The shift selection screen should still be shown (no bypass), and the price change alert should be queued to display after shift confirmation.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Initial shift selection flow when cashier first logs in must continue to work exactly as before
- Manual shift change dialog and audit logging must remain unchanged
- Shift checkout and sessionStorage clearing must continue to work
- All transaction recording (sales, POs, deposits, withdrawals) must continue with correct shift information
- sessionStorage persistence of `selectedShift` and `shiftConfirmed` must continue to work
- Component mount initialization from sessionStorage must remain unchanged

**Scope:**
All inputs that do NOT involve price change broadcasts should be completely unaffected by this fix. This includes:
- Initial POS component mount and shift selection
- Manual shift changes via the change shift dialog
- Cashier checkout and session end
- All transaction operations (sales, POs, vault operations, calibrations)
- Other broadcast events or realtime updates

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **React Re-render Timing Issue**: When `fetchPumps()` updates the Zustand store, React schedules a re-render. During this re-render, the shift selection gate condition evaluates before the `useState` hooks have fully restored their values from the initial state functions that read from sessionStorage. This creates a race condition where `shiftConfirmed` or `selectedShift` are temporarily null/false.

2. **Store Update Triggers Full Component Re-evaluation**: The `usePumpStore` hook subscription causes the entire POS component to re-evaluate when `pumps` state changes. This full re-evaluation means the shift selection gate at the top of the component runs again, and if state restoration hasn't completed, the gate condition fails.

3. **No Bypass Mechanism for Price Updates**: The current implementation has no way to distinguish between "cashier hasn't selected a shift yet" and "cashier has a confirmed shift but a price update is happening". The shift selection gate treats both scenarios identically.

4. **Toast Notification Insufficient**: The current toast notification is easy to miss and doesn't ensure the cashier sees the important price change information. A centered modal is needed to guarantee visibility and acknowledgment.

## Correctness Properties

Property 1: Bug Condition - Price Change Alert Modal Display

_For any_ broadcast event where a price change occurs (`event === 'price_change'`) and the cashier has a confirmed shift (`shiftConfirmed === true` and `selectedShift !== null`), the fixed POS component SHALL display a centered alert modal showing the old and new prices for each updated pump, and SHALL NOT redirect the cashier to the shift selection screen.

**Validates: Requirements 2.1, 2.2, 2.5, 2.6**

Property 2: Preservation - Initial Shift Selection Behavior

_For any_ POS component mount where the cashier has NOT confirmed a shift (`shiftConfirmed === false` or `selectedShift === null`) and no price update is in progress, the fixed code SHALL display the shift selection screen exactly as the original code does, preserving the initial login flow.

**Validates: Requirements 3.1, 3.2, 3.3, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/pages/POS.jsx`

**Function**: `POS` component (main component body and broadcast subscription effect)

**Specific Changes**:

1. **Add Price Update State Flag**: Add a new state variable `isPriceUpdateInProgress` to track when a price update broadcast is being processed. This flag will be used to bypass the shift selection gate during price updates.
   - Add: `const [isPriceUpdateInProgress, setIsPriceUpdateInProgress] = useState(false)`
   - This flag prevents the shift selection gate from triggering during price updates

2. **Add Price Change Alert Modal State**: Add state variables to control the price change alert modal and store the price change details.
   - Add: `const [showPriceChangeAlert, setShowPriceChangeAlert] = useState(false)`
   - Add: `const [priceChanges, setPriceChanges] = useState([])` // Array of { pumpName, oldPrice, newPrice }
   - These states manage the modal display and content

3. **Modify Broadcast Handler**: Update the broadcast subscription effect to:
   - Set `isPriceUpdateInProgress = true` before calling `fetchPumps()`
   - Capture old pump prices before the update
   - Call `fetchPumps()` to get new prices
   - Compare old vs new prices to build the `priceChanges` array
   - Set `showPriceChangeAlert = true` to display the modal
   - Set `isPriceUpdateInProgress = false` after the update completes
   - Remove the toast notification (replaced by modal)

4. **Modify Shift Selection Gate**: Update the shift selection gate condition to bypass when a price update is in progress:
   - Change: `if (!shiftConfirmed || selectedShift === null)` 
   - To: `if ((!shiftConfirmed || selectedShift === null) && !isPriceUpdateInProgress)`
   - This ensures the gate doesn't trigger during price updates

5. **Add Price Change Alert Modal Component**: Add a new modal component that displays when `showPriceChangeAlert === true`:
   - Centered modal with backdrop
   - Title: "⚠️ Price Update Alert"
   - List of price changes: "Pump 1 (Diesel): ₱55.00 → ₱56.50"
   - Informational message: "Prices have been updated. Please check the new prices before making sales."
   - "Acknowledge" button that closes the modal (`setShowPriceChangeAlert(false)`)
   - Modal should be non-blocking (cashier can dismiss and continue working)

### Implementation Details

**Broadcast Handler Pseudocode:**
```javascript
useEffect(() => {
  // ... existing subscription setup ...
  
  const channel = supabase
    .channel(`price-updates-${branchId}`)
    .on('broadcast', { event: 'price_change' }, async (payload) => {
      console.log('[Broadcast] Price change notification received:', payload)
      
      // Set flag to bypass shift selection gate
      setIsPriceUpdateInProgress(true)
      
      // Capture old prices before update
      const oldPrices = pumps.map(p => ({ 
        id: p.id, 
        name: p.pump_name, 
        price: p.price_per_liter 
      }))
      
      // Fetch updated pump prices
      await fetchPumps(branchId)
      
      // Wait for state to update, then compare prices
      setTimeout(() => {
        const updatedPumps = usePumpStore.getState().pumps
        const changes = []
        
        oldPrices.forEach(oldPump => {
          const newPump = updatedPumps.find(p => p.id === oldPump.id)
          if (newPump && parseFloat(newPump.price_per_liter) !== parseFloat(oldPump.price)) {
            changes.push({
              pumpName: oldPump.name,
              fuelType: newPump.fuel_type,
              oldPrice: parseFloat(oldPump.price),
              newPrice: parseFloat(newPump.price_per_liter)
            })
          }
        })
        
        if (changes.length > 0) {
          setPriceChanges(changes)
          setShowPriceChangeAlert(true)
        }
        
        // Clear flag after update completes
        setIsPriceUpdateInProgress(false)
      }, 100)
    })
    .subscribe()
  
  // ... existing cleanup ...
}, [cashier?.branch_id, selectedBranchId, pumps])
```

**Modal Component JSX:**
```jsx
{showPriceChangeAlert && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h3 className="font-bold text-gray-800 text-lg">Price Update Alert</h3>
      </div>
      
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-amber-800 font-medium mb-3">
          The following pump prices have been updated:
        </p>
        <div className="space-y-2">
          {priceChanges.map((change, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                {change.pumpName} ({change.fuelType})
              </span>
              <span className="text-amber-700 font-bold">
                ₱{change.oldPrice.toFixed(2)} → ₱{change.newPrice.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      <p className="text-xs text-gray-600 mb-4">
        Please check the new prices before making sales. This is an informational alert only - you can continue working.
      </p>
      
      <button
        onClick={() => setShowPriceChangeAlert(false)}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors">
        Acknowledge & Continue
      </button>
    </div>
  </div>
)}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate price change broadcasts while a cashier is logged in with a confirmed shift. Run these tests on the UNFIXED code to observe the cashier being kicked to shift selection. Verify that the shift selection gate evaluates incorrectly during re-renders.

**Test Cases**:
1. **Active Session Price Update Test**: Simulate a cashier with confirmed shift receiving a price change broadcast (will fail on unfixed code - cashier gets kicked to shift selection)
2. **Mid-Transaction Price Update Test**: Simulate a price change broadcast while cashier is filling out a sale form (will fail on unfixed code - form state is lost)
3. **Multiple Pump Price Update Test**: Simulate a broadcast that updates 3+ pump prices simultaneously (will fail on unfixed code - cashier is redirected)
4. **Price Update During PO Creation Test**: Simulate a price change while cashier is creating a purchase order (will fail on unfixed code - PO form is lost)

**Expected Counterexamples**:
- Cashier is redirected to shift selection screen when price change broadcast is received
- Shift selection gate evaluates with `shiftConfirmed = false` or `selectedShift = null` during re-render
- Possible causes: React re-render timing issue, store update triggers full component re-evaluation, no bypass mechanism for price updates

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handlePriceChangeBroadcast_fixed(input)
  ASSERT priceChangeAlertModalIsDisplayed(result)
  ASSERT cashierRemainsOnPOSScreen(result)
  ASSERT oldAndNewPricesAreShown(result)
  ASSERT cashierCanDismissAndContinue(result)
END FOR
```

**Test Plan**: After implementing the fix, simulate price change broadcasts and verify:
1. Price change alert modal is displayed with correct old → new prices
2. Cashier remains on POS terminal screen (not kicked to shift selection)
3. Modal is informational only (doesn't block operations)
4. Cashier can dismiss modal and continue working
5. `isPriceUpdateInProgress` flag correctly bypasses shift selection gate

**Test Cases**:
1. **Single Pump Price Update**: Verify modal shows "Pump 1: ₱55.00 → ₱56.50"
2. **Multiple Pump Price Update**: Verify modal shows all updated pumps with old → new prices
3. **Price Update During Active Sale**: Verify cashier can dismiss modal and complete the sale
4. **Price Update During PO Creation**: Verify PO form state is preserved after dismissing modal
5. **Rapid Sequential Price Updates**: Verify multiple broadcasts are handled correctly

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleShiftSelection_original(input) = handleShiftSelection_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for shift selection, manual shift changes, and checkout, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Initial Shift Selection Preservation**: Observe that cashiers without confirmed shifts see the shift selection screen on unfixed code, then verify this continues after fix
2. **Manual Shift Change Preservation**: Observe that manual shift change dialog works correctly on unfixed code, then verify this continues after fix
3. **Checkout Preservation**: Observe that shift checkout clears sessionStorage on unfixed code, then verify this continues after fix
4. **Transaction Recording Preservation**: Observe that sales, POs, deposits, and withdrawals record correct shift information on unfixed code, then verify this continues after fix
5. **sessionStorage Persistence Preservation**: Observe that `selectedShift` and `shiftConfirmed` are saved to sessionStorage on unfixed code, then verify this continues after fix

### Unit Tests

- Test `isPriceUpdateInProgress` flag correctly bypasses shift selection gate
- Test price change alert modal displays with correct data structure
- Test modal dismiss functionality clears state correctly
- Test broadcast handler captures old prices before update
- Test price comparison logic correctly identifies changed pumps
- Test edge case: price update broadcast when cashier hasn't confirmed shift yet (should not bypass gate)

### Property-Based Tests

- Generate random pump price updates and verify modal always displays correct old → new prices
- Generate random cashier states (confirmed shift, unconfirmed shift) and verify shift selection gate behaves correctly
- Generate random sequences of broadcasts and verify `isPriceUpdateInProgress` flag is always cleared after updates
- Test that all non-price-update scenarios continue to work across many random inputs

### Integration Tests

- Test full flow: cashier logs in → confirms shift → receives price update broadcast → sees modal → dismisses → continues working
- Test price update during active transaction: start sale → receive broadcast → see modal → dismiss → complete sale
- Test multiple price updates in sequence: receive broadcast 1 → dismiss modal → receive broadcast 2 → dismiss modal
- Test price update immediately after shift confirmation: confirm shift → immediately receive broadcast → see modal (not shift selection)
- Test that visual feedback (modal animation, backdrop) works correctly across different screen sizes
