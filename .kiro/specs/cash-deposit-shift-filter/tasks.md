# Implementation Plan: Cash Deposit Shift Filter

## Overview

This implementation adds shift-based filtering to the Cash Deposits page (`src/pages/CashDeposits.jsx`). The feature allows administrators to filter deposits by shift (1st, 2nd, 3rd, or All Shifts) using branch-specific shift configurations from `src/utils/shiftConfig.js`. The implementation handles midnight-crossing shifts (Shift 3) and integrates with existing filter logic through client-side filtering.

## Tasks

- [x] 1. Add shift filter state and UI component
  - Add `selectedShift` state variable (default: 'all')
  - Add shift filter dropdown in the filters section after "Deposit Type"
  - Include options: "All Shifts", "1st Shift", "2nd Shift", "3rd Shift"
  - Import `getShiftsForBranch` from `src/utils/shiftConfig.js`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Implement shift time parsing utility function
  - [x] 2.1 Create `parseShiftTime` function inside CashDeposits.jsx
    - Parse time strings like "4:00 AM" or "12:00 PM"
    - Convert 12-hour format to 24-hour format
    - Return object with `startHour` and `startMinute` properties
    - Handle AM/PM conversion (12 AM = 0, 12 PM = 12, PM adds 12 to hours)
    - _Requirements: 5.3_

  - [ ]* 2.2 Write unit tests for parseShiftTime
    - Test various time formats ("4:00 AM", "12:00 PM", "8:00 PM")
    - Test 12-hour to 24-hour conversion
    - Test AM/PM handling edge cases (12:00 AM, 12:00 PM)
    - _Requirements: 5.3_

- [ ] 3. Implement deposit-in-shift checking logic
  - [x] 3.1 Create `isDepositInShift` function inside CashDeposits.jsx
    - Accept depositTimestamp (UTC), shift config, and selectedDate
    - Convert UTC timestamp to local Date object
    - Parse selectedDate to extract year, month, day
    - Use `parseShiftTime` to get shift start and end hours/minutes
    - Create Date objects for shift start and end boundaries
    - Detect midnight crossing: if endHour < startHour, add 1 day to shiftEnd
    - Return true if depositDate >= shiftStart AND depositDate < shiftEnd
    - Add error handling for invalid timestamps
    - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.4, 5.5_

  - [ ]* 3.2 Write unit tests for isDepositInShift
    - Test deposit at shift start (should be included)
    - Test deposit at shift end (should be excluded)
    - Test deposit before shift (should be excluded)
    - Test deposit after shift (should be excluded)
    - Test midnight-crossing shift (Shift 3: 8PM-4AM)
    - Test same-day shift (Shift 1: 4AM-12PM)
    - Test invalid deposit timestamp handling
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 4. Checkpoint - Ensure utility functions work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement deposit filtering by shift
  - [x] 5.1 Create `filterDepositsByShift` function inside CashDeposits.jsx
    - Accept deposits array, shiftNumber, selectedDate, and selectedBranch
    - Get branch-specific shifts using `getShiftsForBranch(selectedBranch?.name)`
    - Find the shift object matching the shiftNumber
    - Return unfiltered deposits if shift not found (with console warning)
    - Filter deposits using `isDepositInShift` for each deposit
    - Return filtered deposits array
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 5.2 Write unit tests for filterDepositsByShift
    - Test filtering with Manolo shift times (4AM-12PM-8PM)
    - Test filtering with Balingasag shift times (5AM-1PM-9PM)
    - Test with unknown branch (should default to Manolo)
    - Test with empty deposits array
    - Test with invalid shift configuration
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.2_

- [ ] 6. Integrate shift filtering with component rendering
  - [x] 6.1 Add useMemo hook for filtered deposits
    - Import `useMemo` from React
    - Create `filteredDeposits` computed value
    - Return `deposits` unchanged if selectedShift === 'all'
    - Otherwise call `filterDepositsByShift` with current state
    - Add dependencies: [deposits, selectedShift, selectedDate, selectedBranchId]
    - _Requirements: 3.1, 3.5, 6.5_

  - [x] 6.2 Update component to use filteredDeposits
    - Replace `deposits` with `filteredDeposits` in summary card calculations (totalDeposits)
    - Replace `deposits` with `filteredDeposits` in table rendering
    - Replace `deposits.length` with `filteredDeposits.length` in deposit count displays
    - Ensure withdrawals table remains unchanged (no shift filtering for withdrawals)
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 6.3 Write integration tests for shift filtering
    - Test "All Shifts" selection shows all deposits
    - Test "1st Shift" selection filters correctly
    - Test "2nd Shift" selection filters correctly
    - Test "3rd Shift" selection handles midnight crossing
    - Test shift filter combined with date filter
    - Test shift filter combined with cashier filter
    - Test shift filter combined with branch filter
    - Test shift filter combined with deposit type filter
    - _Requirements: 3.1, 3.5, 6.1, 6.2, 6.3, 6.4_

- [ ] 7. Checkpoint - Verify filtering works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Add visual feedback and empty state handling
  - Update "No deposits found" message to mention shift filter when active
  - Verify summary cards reflect filtered totals correctly
  - Ensure responsive behavior during filter changes
  - _Requirements: 7.4, 7.5_

- [ ] 9. Test state persistence across filter changes
  - [x] 9.1 Verify shift selection persists when date filter changes
    - _Requirements: 6.1_

  - [x] 9.2 Verify shift selection persists when cashier filter changes
    - _Requirements: 6.2_

  - [x] 9.3 Verify shift selection persists when branch filter changes
    - _Requirements: 6.3_

  - [x] 9.4 Verify shift selection persists when deposit type filter changes
    - _Requirements: 6.4_

- [ ] 10. Final checkpoint and manual testing
  - Ensure all tests pass, ask the user if questions arise.
  - Perform manual testing with different branches (Manolo, Balingasag)
  - Test midnight-crossing shifts with real data
  - Verify UI responsiveness and user experience

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The shift filter is implemented client-side (no database changes required)
- Existing `shiftConfig.js` provides branch-specific shift configurations
- Midnight-crossing shifts (Shift 3) require special handling in date comparison logic
