# Implementation Plan: Scheduled Price Changes

## Overview

This implementation plan breaks down the Scheduled Price Changes feature into discrete, actionable coding tasks. The feature enables administrators to schedule future fuel price changes that execute automatically at specified times. The implementation follows a bottom-up approach: database layer first, then backend scheduler, and finally frontend components.

**Technology Stack:**
- Database: PostgreSQL (Supabase)
- Backend: Supabase Edge Functions (TypeScript/Deno)
- Frontend: React with existing patterns (Zustand stores, Supabase client)
- Testing: Vitest with fast-check for property-based testing

**Implementation Strategy:**
1. Create database schema and functions for robust data management
2. Implement scheduler Edge Function with error handling and recovery
3. Build React components following existing UI patterns
4. Integrate with existing PumpManagement page
5. Add real-time subscription updates to POS
6. Implement comprehensive property-based tests

## Tasks

- [x] 1. Create database schema and migrations
  - [x] 1.1 Create price_change_schedules table with constraints
    - Write SQL migration file `supabase/26_scheduled_price_changes.sql`
    - Create table with all fields: id, scheduled_at, status, pump_ids, price_changes (JSONB), branch_id, created_by, executed_at, cancelled_at, error_message, notes
    - Add CHECK constraints: status IN ('pending', 'executed', 'cancelled', 'failed'), future_schedule (scheduled_at > created_at), valid_pump_ids (array_length > 0)
    - Create indexes: idx_schedules_status, idx_schedules_scheduled_at, idx_schedules_branch
    - _Requirements: 1.3, 2.4, 6.3, 9.1_

  - [x] 1.2 Create notifications table for admin alerts
    - Add notifications table to same migration file
    - Create table with fields: id, user_id (nullable for broadcast), type, title, message, entity_type, entity_id, is_read, read_at, created_at, expires_at
    - Add CHECK constraint: type IN ('info', 'warning', 'error', 'success')
    - Create indexes: idx_notifications_user, idx_notifications_unread, idx_notifications_created
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 1.3 Write property test for schedule creation validity
    - **Property 1: Schedule Creation Validity**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.7, 1.8**
    - Create test file `src/__tests__/scheduled-price-changes-property-1.test.js`
    - Generate random valid schedule inputs (future datetime, positive prices with max 2 decimals, non-empty pump list)
    - Verify database record created with status 'pending'
    - Verify audit log entry exists
    - Use fast-check with minimum 100 iterations

- [x] 2. Implement database functions for schedule execution
  - [x] 2.1 Create execute_price_change_schedule function
    - Add function to migration file
    - Implement transaction with FOR UPDATE lock on schedule record
    - Loop through pump_ids array and update each pump's price_per_liter
    - Store old prices in JSONB for audit trail
    - Update schedule status to 'executed' with timestamp
    - Create audit log entry with old/new prices
    - Create success notification for admins
    - Handle exceptions: rollback, mark as 'failed', create error notification
    - Return JSONB result with success status and details
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 12.6, 12.7_

  - [x] 2.2 Create check_schedule_conflicts function
    - Add function to migration file
    - Accept parameters: p_scheduled_at, p_pump_ids array, p_exclude_schedule_id (optional)
    - Query price_change_schedules for pending schedules with overlapping pump_ids
    - Filter by time window: ABS(scheduled_at - p_scheduled_at) <= 10 minutes
    - Return table with: schedule_id, scheduled_at, pump_ids, created_by_name, time_diff_minutes
    - Use PostgreSQL array overlap operator (&&) for pump_ids comparison
    - _Requirements: 8.1, 8.2, 8.4_

  - [ ]* 2.3 Write property test for schedule execution atomicity
    - **Property 2: Schedule Execution Atomicity**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 12.6, 12.7**
    - Create test file `src/__tests__/scheduled-price-changes-property-2.test.js`
    - Generate random pending schedules with multiple pumps
    - Execute schedule via execute_price_change_schedule function
    - Verify either ALL pumps updated OR NO pumps updated (atomicity)
    - Verify status is 'executed' on success or 'failed' on error
    - Verify audit log entry created in both cases
    - Test with intentional failures (invalid pump IDs) to verify rollback

- [ ] 3. Checkpoint - Database layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create Supabase Edge Function for scheduler
  - [x] 4.1 Create scheduler Edge Function structure
    - Create directory `supabase/functions/price-change-scheduler/`
    - Create `index.ts` with Deno serve handler
    - Import Supabase client with service role key from environment
    - Set up basic error handling and JSON response structure
    - _Requirements: 2.1, 10.1_

  - [x] 4.2 Implement schedule polling and execution logic
    - Query price_change_schedules for pending records where scheduled_at <= now()
    - Order by scheduled_at ascending (process earliest first)
    - Loop through due schedules and call execute_price_change_schedule RPC
    - Collect results (success/failure) for each schedule
    - Return summary JSON with processed count and results array
    - _Requirements: 2.1, 2.2, 10.5, 10.6_

  - [x] 4.3 Add missed schedule detection and recovery
    - On function start, check for schedules with scheduled_at in past and status still 'pending'
    - Execute missed schedules immediately
    - Log warning in audit trail about delayed execution
    - Ensure function continues processing even if individual executions fail
    - _Requirements: 10.3, 10.4, 10.1_

  - [x] 4.4 Configure cron schedule for Edge Function
    - Create `supabase/functions/price-change-scheduler/cron.yml`
    - Set schedule to run every 60 seconds: `"* * * * *"`
    - Configure function name and schedule mapping
    - _Requirements: 2.1_

  - [ ]* 4.5 Write integration test for scheduler execution
    - Create test file `src/__tests__/scheduled-price-changes-scheduler.test.js`
    - Mock Supabase Edge Function environment
    - Create test schedules with past scheduled_at times
    - Invoke scheduler function
    - Verify schedules executed and status updated
    - Verify notifications created
    - Test error handling with invalid pump IDs

- [ ] 5. Checkpoint - Scheduler complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create React components for schedule management
  - [x] 6.1 Create SchedulePriceChangeForm component
    - Create file `src/components/SchedulePriceChangeForm.jsx`
    - Accept props: branchId, pumps, onSuccess, onCancel, editingSchedule (optional)
    - Implement state: scheduledDate, scheduledTime, pumpSelectionMode, selectedPumpIds, priceChanges (Map), notes, conflicts
    - Create form UI with date/time pickers, pump selection (individual/all/by-fuel-type), price inputs per pump
    - Implement validateDateTime: ensure scheduled time is at least 1 minute in future
    - Implement validatePrices: ensure all prices are positive with max 2 decimals
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.7_

  - [x] 6.2 Add conflict detection to schedule form
    - Implement checkConflicts method that calls check_schedule_conflicts RPC
    - Trigger conflict check when scheduled time or pump selection changes
    - Display warning banner if conflicts detected, showing conflicting schedule details
    - Allow user to proceed despite warning (non-blocking)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 6.3 Implement form submission and validation
    - Implement handleSubmit method
    - Combine scheduledDate and scheduledTime into ISO 8601 timestamp
    - Build price_changes JSONB object from priceChanges Map
    - Call Supabase insert on price_change_schedules table
    - Handle validation errors and display inline error messages
    - Call onSuccess callback and reset form on success
    - _Requirements: 1.3, 1.6, 1.8_

  - [ ]* 6.4 Write property test for edit validation consistency
    - **Property 4: Edit Validation Consistency**
    - **Validates: Requirements 5.3, 5.6, 5.5**
    - Create test file `src/__tests__/scheduled-price-changes-property-4.test.js`
    - Generate random schedule edits with various time offsets from execution
    - Verify edits rejected if new scheduled time < 5 minutes in future
    - Verify edits accepted if new scheduled time >= 5 minutes in future
    - Verify audit log created for successful edits

- [x] 7. Create ScheduleList component
  - [x] 7.1 Create ScheduleList component structure
    - Create file `src/components/ScheduleList.jsx`
    - Accept props: branchId, onEdit, onRefresh
    - Implement state: schedules, statusFilter, branchFilter
    - Create UI with filter controls (status dropdown, branch dropdown)
    - _Requirements: 4.1, 4.7, 4.8_

  - [x] 7.2 Implement schedule fetching and display
    - Implement fetchSchedules method with Supabase query
    - Apply filters: status, branch_id
    - Order by scheduled_at ascending for pending, descending for executed/cancelled
    - Display schedule cards with: scheduled datetime, affected pumps, new prices, created by, status badge
    - Show countdown timer for pending schedules using calculateCountdown method
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 7.3 Add cancel schedule functionality
    - Add "Cancel" button to pending schedule cards
    - Implement handleCancel method with confirmation dialog
    - Check if schedule is within 1 minute of execution (reject if true)
    - Update schedule record: status='cancelled', cancelled_at=now(), cancelled_by/cancelled_by_name
    - Refresh schedule list after cancellation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.4 Add real-time subscription for schedule updates
    - Implement subscribeToUpdates method using Supabase realtime
    - Subscribe to price_change_schedules table changes (INSERT, UPDATE)
    - Automatically refresh schedule list when changes detected
    - Clean up subscription on component unmount
    - _Requirements: 3.1, 3.2_

  - [ ]* 7.5 Write property test for cancellation validity
    - **Property 5: Cancellation Validity**
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.6**
    - Create test file `src/__tests__/scheduled-price-changes-property-5.test.js`
    - Generate random schedules with various time offsets from current time
    - Verify cancellation succeeds if >1 minute before execution
    - Verify cancellation rejected if <=1 minute before execution
    - Verify audit log created for successful cancellations

- [-] 8. Integrate schedule components into PumpManagement page
  - [x] 8.1 Add schedule UI section to PumpManagement page
    - Open `src/pages/PumpManagement.jsx`
    - Add state: showScheduleForm, editingSchedule, schedules
    - Add "Schedule Price Change" button in header section
    - Add collapsible "Scheduled Changes" section below pump list
    - Render SchedulePriceChangeForm when showScheduleForm is true
    - Render ScheduleList component in scheduled changes section
    - _Requirements: 1.1, 4.1_

  - [x] 8.2 Wire up schedule form callbacks
    - Implement onSuccess callback: close form, refresh schedule list, show success toast
    - Implement onCancel callback: close form, clear editingSchedule
    - Implement onEdit callback from ScheduleList: set editingSchedule, open form
    - Pass current branchId and pumps array to form component
    - _Requirements: 1.3, 5.1, 5.2, 5.4_

  - [ ]* 8.3 Write property test for branch isolation
    - **Property 6: Branch Isolation**
    - **Validates: Requirements 7.3, 7.4**
    - Create test file `src/__tests__/scheduled-price-changes-property-6.test.js`
    - Create schedules targeting specific branches
    - Execute schedules
    - Verify only pumps in target branches updated
    - Verify pumps in other branches unchanged

- [ ] 9. Checkpoint - Admin UI complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Add real-time price updates to POS page
  - [x] 10.1 Add pump price subscription to POS component
    - Open `src/pages/POS.jsx`
    - Add useEffect hook to subscribe to pumps table changes
    - Subscribe to UPDATE events on pumps table filtered by branch_id
    - When price_per_liter changes, call fetchPumps to refresh pump data
    - Display toast notification: "Pump prices updated"
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 10.2 Add offline/reconnection handling
    - Use existing useConnectionStatus hook to detect connection status
    - On reconnection (isConnected changes from false to true), refetch all pump prices
    - Display warning banner if realtime subscription fails: "Real-time updates unavailable, prices may be delayed"
    - Implement fallback polling every 30 seconds if subscription unavailable
    - _Requirements: 3.2_

  - [ ]* 10.3 Write property test for price propagation correctness
    - **Property 3: Price Propagation Correctness**
    - **Validates: Requirements 3.4, 3.5**
    - Create test file `src/__tests__/scheduled-price-changes-property-3.test.js`
    - Create sales before price change with old price
    - Execute price change schedule
    - Create sales after price change with new price
    - Verify sales before use old price_per_liter
    - Verify sales after use new price_per_liter
    - Verify historical sales remain unchanged

- [ ] 11. Implement notification system for admins
  - [ ] 11.1 Create NotificationBell component
    - Create file `src/components/NotificationBell.jsx`
    - Display bell icon with unread count badge
    - Fetch unread notifications count on mount
    - Subscribe to notifications table for real-time updates
    - Show dropdown with recent notifications on click
    - _Requirements: 11.4, 11.5_

  - [ ] 11.2 Add notification display and mark as read
    - Render notification list in dropdown: title, message, timestamp, type icon
    - Color-code by type: info (blue), warning (amber), error (red), success (green)
    - Add "Mark as read" button for each notification
    - Update is_read and read_at fields on click
    - Filter out expired notifications (expires_at < now())
    - _Requirements: 11.4, 11.5, 11.6_

  - [ ] 11.3 Add NotificationBell to admin layout
    - Open `src/components/Layout.jsx` or admin header component
    - Add NotificationBell component to header navigation
    - Position near user profile or settings icon
    - Ensure only visible to admin users (check user role)
    - _Requirements: 11.4_

  - [ ] 11.4 Create notification triggers in scheduler
    - Update scheduler Edge Function to create notifications
    - On successful execution: create 'success' notification for all admins (user_id = NULL)
    - On failed execution: create 'error' notification for all admins
    - On schedule created: create 'info' notification for creator
    - One hour before execution: create 'warning' reminder notification for creator
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 12. Add edit schedule functionality
  - [x] 12.1 Add edit mode to SchedulePriceChangeForm
    - Check if editingSchedule prop is provided
    - Pre-fill form fields with existing schedule data
    - Parse scheduled_at into separate date and time fields
    - Populate selectedPumpIds and priceChanges from existing schedule
    - Change form title to "Edit Scheduled Price Change"
    - _Requirements: 5.1, 5.2_

  - [x] 12.2 Implement schedule update logic
    - Modify handleSubmit to detect edit mode (editingSchedule exists)
    - Use Supabase update instead of insert for edit mode
    - Validate new scheduled time is at least 5 minutes in future
    - Reject edit if within 5 minutes of execution with error message
    - Create audit log entry with old and new values
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 12.3 Add "Edit" button to ScheduleList
    - Add "Edit" button to pending schedule cards
    - Disable edit button if schedule is within 5 minutes of execution
    - Show tooltip on disabled button: "Cannot edit within 5 minutes of execution"
    - Call onEdit callback with schedule data when clicked
    - _Requirements: 5.1, 5.6, 5.7_

- [x] 13. Implement bulk price change scheduling
  - [x] 13.1 Add bulk selection modes to schedule form
    - Add radio buttons for pump selection mode: "Individual", "All Pumps", "By Fuel Type"
    - For "All Pumps" mode: auto-select all pumps in branch
    - For "By Fuel Type" mode: add fuel type dropdown, auto-select matching pumps
    - Display summary: "X pumps will be affected" before submission
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 13.2 Add bulk price input option
    - Add toggle: "Set same price for all selected pumps"
    - When enabled, show single price input that applies to all selected pumps
    - When disabled, show individual price input for each selected pump
    - Update priceChanges Map based on toggle state
    - _Requirements: 12.1, 12.5_

  - [x] 13.3 Ensure atomic bulk updates in database function
    - Verify execute_price_change_schedule function uses transaction
    - Ensure all pump updates succeed or all fail together
    - Test with intentional failure (invalid pump ID) to verify rollback
    - _Requirements: 12.6, 12.7_

- [ ] 14. Add comprehensive audit trail
  - [ ] 14.1 Create audit log entries for all schedule operations
    - On schedule create: log with action='create', entity_type='price_change_schedule'
    - On schedule edit: log with action='update', include old and new values
    - On schedule cancel: log with action='cancel', include cancelled_by
    - On schedule execute: log with action='execute', include old/new prices
    - On schedule fail: log with action='error', include error message
    - _Requirements: 9.1, 9.2_

  - [ ] 14.2 Add audit log filtering for price changes
    - Open audit log page (if exists) or create audit log view
    - Add filter option for entity_type='price_change_schedule'
    - Display schedule-specific fields: scheduled_at, executed_at, pump_count
    - Show old vs new prices in audit detail view
    - _Requirements: 9.3, 9.4, 9.6_

  - [ ]* 14.3 Write property test for audit completeness
    - **Property 8: Audit Completeness**
    - **Validates: Requirements 9.1, 9.2, 9.6**
    - Create test file `src/__tests__/scheduled-price-changes-property-8.test.js`
    - Perform various schedule operations (create, edit, cancel, execute)
    - Verify audit log entry exists for each operation
    - Verify audit log contains: operation type, timestamp, user identity, old values (for updates), new values
    - Verify audit log retention (entries exist for at least 365 days)

- [x] 15. Add error handling and user feedback
  - [x] 15.1 Add client-side validation with error messages
    - Validate scheduled datetime is at least 1 minute in future
    - Validate all prices are positive numbers with max 2 decimals
    - Validate at least one pump selected
    - Display inline error messages below each field
    - Disable submit button until all validations pass
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 15.2 Add server-side error handling
    - Wrap all Supabase calls in try-catch blocks
    - Display user-friendly error messages via toast notifications
    - Log detailed errors to console for debugging
    - Handle specific error cases: permission denied, network error, validation error
    - _Requirements: 2.7, 10.8_

  - [x] 15.3 Add loading states and optimistic updates
    - Show loading spinner during schedule creation/update/cancellation
    - Disable form inputs while submitting
    - Show skeleton loaders while fetching schedules
    - Implement optimistic UI updates: immediately update schedule list before server confirmation
    - Rollback optimistic updates if server request fails
    - _Requirements: User experience_

- [ ] 16. Checkpoint - Feature complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Write property-based tests for conflict detection
  - [ ]* 17.1 Write property test for conflict detection accuracy
    - **Property 7: Conflict Detection Accuracy**
    - **Validates: Requirements 8.1, 8.2, 8.4**
    - Create test file `src/__tests__/scheduled-price-changes-property-7.test.js`
    - Generate pairs of schedules with varying time differences and pump overlaps
    - Verify conflict detected if within 10 minutes AND overlapping pumps
    - Verify no conflict if >10 minutes apart OR no overlapping pumps
    - Test boundary cases: exactly 10 minutes apart, partial pump overlap

- [ ] 18. Integration testing and final validation
  - [ ]* 18.1 Write end-to-end integration tests
    - Create test file `src/__tests__/scheduled-price-changes-integration.test.js`
    - Test complete lifecycle: create → edit → execute → verify POS update
    - Test error scenario: create schedule with invalid pump → verify failure notification
    - Test concurrent operations: multiple admins creating schedules simultaneously
    - Test scheduler recovery: missed schedule detection and immediate execution

  - [ ]* 18.2 Write performance tests
    - Create test file `src/__tests__/scheduled-price-changes-performance.test.js`
    - Test bulk schedule execution: 10+ schedules at same time
    - Test large pump sets: schedule with 50+ pumps
    - Verify execution completes within acceptable time (<5 seconds for bulk, <60 seconds for 10+ schedules)
    - Verify no deadlocks or race conditions

- [ ] 19. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and allow for user feedback
- Property tests validate universal correctness properties from the design document
- Integration tests validate end-to-end workflows and error scenarios
- The implementation follows existing codebase patterns (React components, Zustand stores, Supabase client)
- All database operations use transactions to ensure atomicity
- Real-time updates leverage existing Supabase realtime infrastructure
- Audit trail provides complete traceability for all schedule operations
