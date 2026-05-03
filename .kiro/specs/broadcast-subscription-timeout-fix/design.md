# Broadcast Subscription Timeout Fix - Bugfix Design

## Overview

The broadcast subscription for price change updates fails to establish a stable WebSocket connection due to React's double-mounting behavior in development mode (React 18+). The subscription is created, immediately cleaned up during re-mount, and the guard condition `if (channelRef.current) return` prevents re-subscription, leaving the POS terminal without real-time price updates.

The fix involves implementing a more resilient subscription approach that:
1. Removes the guard condition that prevents re-subscription
2. Ensures proper cleanup of existing subscriptions before creating new ones
3. Handles React's double-mounting gracefully by allowing re-subscription
4. Maintains connection stability across component lifecycle events

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when React's double-mounting causes premature cleanup and the guard condition prevents re-subscription
- **Property (P)**: The desired behavior - WebSocket subscription remains stable and receives broadcast messages despite React's mounting behavior
- **Preservation**: Existing toast notification, fetchPumps refresh, cleanup behavior, and early return logic must remain unchanged
- **channelRef**: A React useRef that stores the Supabase realtime channel instance
- **Double-mounting**: React 18+ behavior in development where components mount, unmount, and remount to detect side effects
- **Guard condition**: The `if (channelRef.current) return` check that prevents duplicate subscriptions but also blocks re-subscription after cleanup

## Bug Details

### Bug Condition

The bug manifests when the POS component mounts in React 18+ development mode. The useEffect hook creates a subscription, React's double-mounting triggers the cleanup function before the WebSocket is fully established, the cleanup sets `channelRef.current = null`, and the guard condition `if (channelRef.current) return` prevents re-subscription on the second mount.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ComponentMountEvent
  OUTPUT: boolean
  
  RETURN input.isReactStrictMode == true
         AND input.mountPhase == "second_mount"
         AND channelRef.current == null
         AND guardConditionExists == true
         AND websocketConnectionState == "TIMED_OUT"
END FUNCTION
```

### Examples

- **Example 1**: POS component mounts → subscription created → React triggers cleanup → channelRef set to null → second mount blocked by guard → subscription status: TIMED_OUT
- **Example 2**: User navigates to POS page → subscription starts → console shows "SUBSCRIBED" → immediately shows "WebSocket is closed before the connection is established" → no price updates received
- **Example 3**: Scheduled price change executes → Edge Function broadcasts message → POS terminal has no active subscription → no toast notification → prices not updated → user must manually refresh
- **Edge case**: In production build (no double-mounting) → subscription works correctly → demonstrates the issue is specifically related to React's development behavior

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Toast notification display with message "⚠️ PRICE UPDATE: X pump price(s) have been changed" must continue to work exactly as before
- fetchPumps() call with 100ms delay must continue to refresh pump data in the background
- Cleanup function must continue to call supabase.removeChannel() when component unmounts
- Early return when no branch_id/selectedBranchId must continue to skip subscription creation
- Console logging for subscription status must continue to provide debugging information

**Scope:**
All inputs that do NOT involve the subscription establishment phase should be completely unaffected by this fix. This includes:
- Broadcast message handling logic (toast, fetchPumps)
- Cleanup behavior on actual component unmount (navigation away)
- Early return logic for missing branch IDs
- All other POS component functionality (sales, shift management, etc.)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is:

1. **Guard Condition Prevents Re-subscription**: The `if (channelRef.current) return` check is too aggressive - it prevents duplicate subscriptions but also blocks legitimate re-subscription after React's cleanup phase sets channelRef to null

2. **Premature Cleanup Timing**: React's double-mounting triggers the cleanup function before the WebSocket connection is fully established (status transitions from CHANNEL_STATE.joining to CHANNEL_STATE.joined), causing the connection to close prematurely

3. **Lack of Cleanup Before Re-subscription**: The current code doesn't clean up existing subscriptions before creating new ones when the effect re-runs (e.g., when branch_id changes), which could lead to memory leaks or duplicate subscriptions

4. **WebSocket Connection State Not Considered**: The guard condition only checks if channelRef exists, not whether the connection is actually healthy (SUBSCRIBED vs TIMED_OUT vs CLOSED)

## Correctness Properties

Property 1: Bug Condition - Stable WebSocket Subscription

_For any_ component mount event where React's double-mounting behavior occurs (isReactStrictMode == true), the fixed subscription logic SHALL establish and maintain a stable WebSocket connection that successfully receives broadcast messages, regardless of cleanup and re-mount cycles.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Broadcast Handling Behavior

_For any_ broadcast message received after the fix is applied, the system SHALL produce exactly the same behavior as the original code, preserving the toast notification display, fetchPumps refresh call, console logging, and all other message handling logic.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/pages/POS.jsx`

**Function**: `useEffect` hook for broadcast subscription (lines ~153-207)

**Specific Changes**:

1. **Remove Guard Condition**: Delete the `if (channelRef.current) return` check that prevents re-subscription
   - This allows the effect to re-run and create a new subscription after cleanup
   - Prevents the "stuck without subscription" state after React's double-mounting

2. **Add Cleanup Before Subscription**: Before creating a new channel, check if channelRef.current exists and clean it up
   - Prevents memory leaks when the effect re-runs (e.g., branch_id changes)
   - Ensures only one active subscription exists at a time
   - Pattern: `if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }`

3. **Maintain Existing Early Return**: Keep the `if (!cashier?.branch_id && !selectedBranchId) return` check
   - This is a valid guard for missing required data
   - Should remain at the top of the effect

4. **Preserve All Existing Logic**: Keep all other code unchanged
   - Channel creation with `.channel(\`price-updates-${branchId}\`)`
   - Broadcast event handler with toast and fetchPumps
   - Subscribe callback with status logging
   - Cleanup function with removeChannel and null assignment

5. **Update Console Logging**: Modify the "Channel already exists" log to "Cleaning up existing channel before re-subscribing"
   - Provides better debugging information about the new behavior
   - Helps developers understand the fix during troubleshooting

### Implementation Pattern

```javascript
useEffect(() => {
  // Early return for missing data (PRESERVED)
  if (!cashier?.branch_id && !selectedBranchId) return
  
  // Clean up existing subscription before creating new one (NEW)
  if (channelRef.current) {
    console.log('[Broadcast] Cleaning up existing channel before re-subscribing')
    supabase.removeChannel(channelRef.current)
    channelRef.current = null
  }

  const branchId = cashier?.branch_id || selectedBranchId
  console.log('[Broadcast] Subscribing to price change broadcasts for branch:', branchId)

  // Create subscription (PRESERVED)
  const channel = supabase
    .channel(`price-updates-${branchId}`)
    .on('broadcast', { event: 'price_change' }, (payload) => {
      // ... existing handler logic (PRESERVED)
    })
    .subscribe((status) => {
      // ... existing status logging (PRESERVED)
    })

  channelRef.current = channel

  // Cleanup function (PRESERVED)
  return () => {
    console.log('[Broadcast] Cleaning up price change subscription')
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }
}, [cashier?.branch_id, selectedBranchId])
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate React's double-mounting behavior and verify that the subscription fails on unfixed code. Use React Testing Library's StrictMode wrapper to trigger double-mounting. Monitor WebSocket connection state and subscription status.

**Test Cases**:
1. **Double-Mount Subscription Test**: Mount POS component in StrictMode → verify subscription is created → verify cleanup runs → verify second mount is blocked by guard condition → verify final status is TIMED_OUT (will fail on unfixed code)
2. **WebSocket Connection State Test**: Monitor WebSocket state transitions during mount → verify connection closes before reaching "joined" state → verify channelRef is null after cleanup (will fail on unfixed code)
3. **Broadcast Message Reception Test**: Mount component → wait for subscription → trigger broadcast from Edge Function → verify no message received (will fail on unfixed code)
4. **Guard Condition Blocking Test**: Set channelRef.current to a closed channel → trigger re-mount → verify guard condition prevents new subscription creation (will fail on unfixed code)

**Expected Counterexamples**:
- Subscription status transitions from "SUBSCRIBED" to "TIMED_OUT" during double-mounting
- Console shows "WebSocket is closed before the connection is established"
- channelRef.current is null after second mount attempt
- Broadcast messages are not received by the component
- Possible causes: guard condition blocking re-subscription, premature cleanup timing, lack of cleanup before re-subscription

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := subscriptionEffect_fixed(input)
  ASSERT result.websocketState == "SUBSCRIBED"
  ASSERT result.channelRef != null
  ASSERT result.canReceiveBroadcasts == true
END FOR
```

**Test Plan**: After implementing the fix, run the same tests on the fixed code and verify:
- Subscription remains stable after double-mounting
- WebSocket connection state is "SUBSCRIBED"
- Broadcast messages are successfully received
- channelRef.current contains a valid channel instance

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT subscriptionEffect_original(input) = subscriptionEffect_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for broadcast message handling, cleanup, and early returns, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Broadcast Message Handling Preservation**: Observe that toast notification and fetchPumps call work correctly on unfixed code when a message is received, then write test to verify this continues after fix
2. **Cleanup Behavior Preservation**: Observe that removeChannel is called and channelRef is set to null on unmount in unfixed code, then write test to verify this continues after fix
3. **Early Return Preservation**: Observe that subscription is not created when branch_id is missing in unfixed code, then write test to verify this continues after fix
4. **Console Logging Preservation**: Observe that all console.log statements execute correctly in unfixed code, then write test to verify this continues after fix (except for the updated "Cleaning up existing channel" message)

### Unit Tests

- Test that subscription is created when component mounts with valid branch_id
- Test that subscription is cleaned up when component unmounts
- Test that subscription is not created when branch_id is missing (early return)
- Test that existing subscription is cleaned up before creating new one when branch_id changes
- Test that broadcast message handler displays toast notification
- Test that broadcast message handler calls fetchPumps with correct branch_id
- Test that subscription status logging works correctly

### Property-Based Tests

- Generate random mount/unmount sequences and verify subscription state remains consistent
- Generate random branch_id changes and verify only one subscription exists at a time
- Generate random broadcast payloads and verify toast notification and fetchPumps are always called
- Test across many scenarios that cleanup always removes channel and sets channelRef to null

### Integration Tests

- Test full POS component lifecycle with subscription in StrictMode
- Test that scheduled price changes trigger broadcast messages that are received by POS
- Test that multiple POS terminals (different branches) receive only their own broadcasts
- Test that subscription survives branch_id changes without memory leaks
- Test that visual feedback (toast) appears when broadcast is received
- Test that pump prices update in UI after broadcast is received

### Manual Testing Checklist

After implementing the fix, perform these manual tests:

1. **Development Mode Test**:
   - Open POS page in development mode
   - Check browser console for subscription status
   - Verify no "TIMED_OUT" or "WebSocket is closed" errors
   - Verify "[Broadcast] Successfully subscribed" message appears

2. **Broadcast Reception Test**:
   - Trigger a scheduled price change (or manually call Edge Function)
   - Verify toast notification appears with price update message
   - Verify pump prices update in the UI without page refresh
   - Verify console shows "[Broadcast] Price change notification received"

3. **Branch Switching Test**:
   - Switch between branches in POS
   - Verify old subscription is cleaned up
   - Verify new subscription is created for new branch
   - Verify no duplicate subscriptions exist

4. **Navigation Test**:
   - Navigate away from POS page
   - Verify cleanup function runs
   - Verify subscription is removed
   - Navigate back to POS
   - Verify new subscription is created successfully

5. **Production Build Test**:
   - Build application for production
   - Test subscription in production mode (no double-mounting)
   - Verify subscription works correctly
   - Verify no regressions from development mode fix
