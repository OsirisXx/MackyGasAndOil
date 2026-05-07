# Requirements Document

## Introduction

This document specifies the requirements for adding shift filtering functionality to the Cash Deposits page at /admin/cash-deposits. The feature will allow users to filter deposits by shift (1st, 2nd, 3rd, or All Shifts) to reduce confusion when reviewing deposits across different shifts. The shift filtering will use branch-specific shift configurations and handle deposits that cross midnight boundaries.

## Glossary

- **Cash_Deposits_Page**: The administrative page at /admin/cash-deposits that displays cash deposits and withdrawals
- **Shift_Filter**: A dropdown UI control that allows users to select which shift's deposits to display
- **Shift_Configuration**: Branch-specific time ranges that define when each shift operates (stored in src/utils/shiftConfig.js)
- **Deposit_Timestamp**: The deposit_date field (timestamptz in UTC) that records when a deposit was made
- **Local_Time**: The deposit timestamp converted from UTC to the local timezone for shift comparison
- **Midnight_Crossing_Shift**: A shift whose time range spans across midnight (e.g., Shift 3: 8PM-4AM or 9PM-5AM)
- **Branch**: A gas station location with specific shift time configurations (Manolo, Sankanan, Patulangan, Balingasag)

## Requirements

### Requirement 1: Shift Filter UI Component

**User Story:** As an administrator, I want to see a shift filter dropdown in the filters section, so that I can select which shift's deposits to view.

#### Acceptance Criteria

1. THE Cash_Deposits_Page SHALL display a Shift_Filter dropdown in the existing filters section
2. THE Shift_Filter SHALL include the options "All Shifts", "1st", "2nd", and "3rd"
3. THE Shift_Filter SHALL default to "All Shifts" when the page loads
4. THE Shift_Filter SHALL be positioned alongside existing filters (Date, Cashier, Branch, Deposit Type)
5. THE Shift_Filter SHALL maintain consistent styling with other filter controls

### Requirement 2: Branch-Specific Shift Configuration

**User Story:** As an administrator, I want the shift filter to use branch-specific shift times, so that deposits are correctly categorized for each branch's operating schedule.

#### Acceptance Criteria

1. WHEN a branch is selected, THE Cash_Deposits_Page SHALL retrieve shift configurations using getShiftsForBranch from src/utils/shiftConfig.js
2. THE Cash_Deposits_Page SHALL use Manolo shift times (4AM-12PM, 12PM-8PM, 8PM-4AM) for Manolo, Sankanan, and Patulangan branches
3. THE Cash_Deposits_Page SHALL use Balingasag shift times (5AM-1PM, 1PM-9PM, 9PM-5AM) for Balingasag branch
4. WHEN no branch is selected, THE Cash_Deposits_Page SHALL use Manolo shift times as the default configuration

### Requirement 3: Deposit Filtering by Shift

**User Story:** As an administrator, I want deposits filtered based on their timestamp falling within the selected shift's time range, so that I only see deposits relevant to that shift.

#### Acceptance Criteria

1. WHEN "All Shifts" is selected, THE Cash_Deposits_Page SHALL display all deposits for the selected date
2. WHEN a specific shift is selected, THE Cash_Deposits_Page SHALL display only deposits whose Deposit_Timestamp falls within that shift's time range
3. THE Cash_Deposits_Page SHALL convert Deposit_Timestamp from UTC to Local_Time before comparing against shift time ranges
4. THE Cash_Deposits_Page SHALL filter deposits in JavaScript after fetching all deposits for the selected date
5. THE Shift_Filter SHALL work in combination with existing filters (date, cashier, branch, deposit type)

### Requirement 4: Midnight Crossing Shift Handling

**User Story:** As an administrator, I want deposits from shifts that cross midnight to be correctly filtered, so that late-night deposits appear in the correct shift.

#### Acceptance Criteria

1. WHEN a Midnight_Crossing_Shift is selected, THE Cash_Deposits_Page SHALL correctly identify deposits that fall within the shift's time range across the midnight boundary
2. FOR Shift 3 in Manolo/Sankanan/Patulangan (8PM-4AM), THE Cash_Deposits_Page SHALL include deposits from 8PM on the selected date through 3:59:59AM on the next date
3. FOR Shift 3 in Balingasag (9PM-5AM), THE Cash_Deposits_Page SHALL include deposits from 9PM on the selected date through 4:59:59AM on the next date
4. THE Cash_Deposits_Page SHALL handle the date boundary correctly when comparing timestamps against shift ranges

### Requirement 5: Shift Time Comparison Logic

**User Story:** As a developer, I want a reusable function to determine if a timestamp falls within a shift's time range, so that the filtering logic is consistent and maintainable.

#### Acceptance Criteria

1. THE Cash_Deposits_Page SHALL implement a function that accepts a Deposit_Timestamp, shift configuration, and selected date
2. THE function SHALL return true if the Deposit_Timestamp falls within the shift's time range, false otherwise
3. THE function SHALL parse shift time strings (e.g., "4:00 AM", "12:00 PM") into comparable time values
4. THE function SHALL handle both same-day shifts and Midnight_Crossing_Shift scenarios
5. THE function SHALL account for the selected date when determining shift boundaries

### Requirement 6: Filter State Persistence

**User Story:** As an administrator, I want the shift filter selection to persist when I change other filters, so that I don't have to reselect my shift preference repeatedly.

#### Acceptance Criteria

1. WHEN the user changes the Date filter, THE Cash_Deposits_Page SHALL maintain the selected shift value
2. WHEN the user changes the Cashier filter, THE Cash_Deposits_Page SHALL maintain the selected shift value
3. WHEN the user changes the Branch filter, THE Cash_Deposits_Page SHALL maintain the selected shift value
4. WHEN the user changes the Deposit Type filter, THE Cash_Deposits_Page SHALL maintain the selected shift value
5. THE Cash_Deposits_Page SHALL re-apply the shift filter whenever deposits are re-fetched

### Requirement 7: Visual Feedback and User Experience

**User Story:** As an administrator, I want clear visual feedback when a shift filter is active, so that I understand which deposits are being displayed.

#### Acceptance Criteria

1. WHEN a specific shift is selected, THE Cash_Deposits_Page SHALL display the filtered deposit count in the summary cards
2. THE Cash_Deposits_Page SHALL update the "Total Deposits" summary card to reflect only the filtered deposits
3. THE Cash_Deposits_Page SHALL update the deposits table to show only the filtered deposits
4. WHEN no deposits match the selected shift filter, THE Cash_Deposits_Page SHALL display a message indicating no deposits were found for that shift
5. THE Cash_Deposits_Page SHALL maintain responsive behavior during filter changes without blocking the UI
