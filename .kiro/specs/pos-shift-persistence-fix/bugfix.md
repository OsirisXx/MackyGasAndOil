# Bugfix Requirements Document

## Introduction

When pump prices are updated via the scheduled price change system, the POS component receives a broadcast notification and calls `fetchPumps()` to refresh pump prices. This triggers a component re-render that causes the shift selection gate condition `if (!shiftConfirmed || selectedShift === null)` to evaluate before sessionStorage values are restored, resulting in the cashier being kicked back to the shift selection screen. This disrupts the cashier's workflow and forces them to re-select their shift to continue working.

The current implementation uses a toast notification to inform cashiers about price changes, but this is insufficient as it doesn't ensure the cashier sees and acknowledges the important price update information. A centered alert modal is needed to ensure cashiers are properly informed about price changes before continuing their work.

The bug affects cashiers during active POS sessions when scheduled price changes are executed. The impact is significant as it interrupts sales operations and creates confusion for cashiers who must repeatedly re-authenticate their shift selection.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a scheduled price change broadcast is received and `fetchPumps()` is called THEN the POS component re-renders and evaluates the shift selection gate before sessionStorage values are restored

1.2 WHEN the shift selection gate evaluates during the re-render THEN `shiftConfirmed` and `selectedShift` are temporarily null or false

1.3 WHEN `shiftConfirmed` is false or `selectedShift` is null during re-render THEN the cashier is redirected to the shift selection screen

1.4 WHEN the cashier is redirected to shift selection THEN they must re-select their shift to access the POS terminal again

1.5 WHEN `fetchPumps()` triggers a store update THEN the component may fully re-mount, causing state reset despite sessionStorage persistence

### Expected Behavior (Correct)

2.1 WHEN a scheduled price change broadcast is received THEN a centered alert modal SHALL appear to inform the cashier about the price changes

2.2 WHEN the price change alert modal is displayed THEN it SHALL show the old price and new price for each pump that was updated (e.g., "Pump 1: ₱55.00 → ₱56.50")

2.3 WHEN the price change alert is shown THEN it SHALL be informational only and not block POS operations

2.4 WHEN the cashier acknowledges or dismisses the price change alert THEN the modal SHALL close and pump prices SHALL be refreshed in the background

2.5 WHEN the price change alert is displayed THEN the cashier SHALL remain on the POS terminal screen (not be kicked to shift selection)

2.6 WHEN the alert modal is dismissed THEN the cashier SHALL be able to continue their workflow without re-selecting their shift

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a cashier first accesses the POS terminal without a confirmed shift THEN the system SHALL CONTINUE TO display the shift selection screen

3.2 WHEN a cashier manually changes their shift using the change shift dialog THEN the system SHALL CONTINUE TO update the shift selection and log the audit trail

3.3 WHEN a cashier ends their shift and checks out THEN the system SHALL CONTINUE TO clear the shift selection state

3.4 WHEN pump prices are updated via broadcast THEN the system SHALL CONTINUE TO refresh pump data in the store

3.5 WHEN the cashier performs sales, POs, deposits, or withdrawals THEN the system SHALL CONTINUE TO record transactions with the correct shift information

3.6 WHEN sessionStorage values are saved on state changes THEN the system SHALL CONTINUE TO persist `selectedShift` and `shiftConfirmed` to sessionStorage

3.7 WHEN the POS component mounts for the first time in a session THEN the system SHALL CONTINUE TO initialize state from sessionStorage if available
