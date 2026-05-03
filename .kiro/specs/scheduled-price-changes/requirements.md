# Requirements Document

## Introduction

The Scheduled Price Changes feature enables administrators to schedule future fuel price changes in advance. When the scheduled time is reached, the system automatically applies the new prices to all configured pumps. This eliminates the need for manual price updates during shift changes and ensures consistent pricing across all branches.

## Glossary

- **Admin**: A user with administrative privileges who can manage pump configurations and schedule price changes
- **Scheduler**: The system component responsible for monitoring scheduled price changes and triggering automatic price updates
- **Price_Change_Schedule**: A record containing the target date/time and new prices for one or more pumps
- **Pump**: A fuel dispensing unit with a configurable price per liter
- **POS_Terminal**: The Point of Sale interface used by cashiers to record fuel sales
- **Pump_Management_Page**: The administrative interface for configuring pumps and managing price schedules (located at /admin/pump-management)
- **Branch**: A physical location with one or more pumps
- **Active_Schedule**: A price change schedule that has not yet been executed or cancelled
- **Executed_Schedule**: A price change schedule that has been successfully applied
- **Cancelled_Schedule**: A price change schedule that was cancelled before execution

## Requirements

### Requirement 1: Schedule Price Changes

**User Story:** As an admin, I want to schedule future price changes in advance, so that prices update automatically without manual intervention during shift changes.

#### Acceptance Criteria

1. WHEN an admin accesses the Pump_Management_Page, THE System SHALL display a "Schedule Price Change" button
2. WHEN an admin clicks "Schedule Price Change", THE System SHALL display a form with fields for target date, target time, and price per liter for each pump
3. WHEN an admin submits a valid price change schedule, THE System SHALL create a Price_Change_Schedule record with status "pending"
4. THE System SHALL validate that the scheduled datetime is in the future (at least 1 minute from current time)
5. THE System SHALL validate that all price values are positive numbers with up to 2 decimal places
6. IF the scheduled datetime is in the past, THEN THE System SHALL reject the schedule and display an error message "Scheduled time must be in the future"
7. THE System SHALL allow scheduling price changes for individual pumps or all pumps in a branch
8. WHEN a Price_Change_Schedule is created, THE System SHALL log an audit entry with the admin's identity, scheduled time, and price changes

### Requirement 2: Automatic Price Application

**User Story:** As an admin, I want the system to automatically apply scheduled price changes at the specified time, so that I don't need to manually update prices during off-hours.

#### Acceptance Criteria

1. THE Scheduler SHALL check for pending Price_Change_Schedule records every 60 seconds
2. WHEN the current time reaches or exceeds a Price_Change_Schedule's scheduled time, THE Scheduler SHALL execute the price change
3. WHEN executing a price change, THE System SHALL update the price_per_liter field for all pumps specified in the Price_Change_Schedule
4. WHEN a price change is executed, THE System SHALL update the Price_Change_Schedule status to "executed"
5. WHEN a price change is executed, THE System SHALL record the actual execution timestamp
6. WHEN a price change is executed, THE System SHALL log an audit entry with the old prices, new prices, and execution timestamp
7. IF a price change execution fails, THEN THE System SHALL update the Price_Change_Schedule status to "failed" and log the error details
8. WHEN a price change execution fails, THE System SHALL send a notification to all admin users

### Requirement 3: Real-Time Price Updates in POS

**User Story:** As a cashier, I want the POS terminal to automatically reflect new prices when they change, so that I always charge customers the correct current price.

#### Acceptance Criteria

1. WHEN a pump's price_per_liter is updated, THE System SHALL broadcast a real-time update event to all connected POS_Terminal instances
2. WHEN a POS_Terminal receives a price update event, THE System SHALL refresh the displayed prices within 5 seconds
3. WHEN a POS_Terminal displays pump prices, THE System SHALL always fetch the current price_per_liter from the database
4. THE System SHALL ensure that any sale recorded after a price change uses the new price_per_liter value
5. WHEN a price change occurs during an active shift, THE System SHALL not affect sales already recorded in that shift (historical data remains unchanged)

### Requirement 4: View and Manage Scheduled Changes

**User Story:** As an admin, I want to view all scheduled price changes, so that I can track upcoming changes and avoid scheduling conflicts.

#### Acceptance Criteria

1. WHEN an admin accesses the Pump_Management_Page, THE System SHALL display a "Scheduled Changes" section
2. THE System SHALL display all Active_Schedule records sorted by scheduled time (earliest first)
3. FOR ALL Active_Schedule records, THE System SHALL display the scheduled datetime, affected pumps, new prices, and the admin who created the schedule
4. THE System SHALL display Executed_Schedule records from the past 30 days
5. THE System SHALL display Cancelled_Schedule records from the past 7 days
6. WHEN displaying a schedule, THE System SHALL show a countdown timer for pending schedules (e.g., "in 2 hours 15 minutes")
7. THE System SHALL allow filtering schedules by status (pending, executed, cancelled, failed)
8. THE System SHALL allow filtering schedules by branch

### Requirement 5: Edit Scheduled Changes

**User Story:** As an admin, I want to edit scheduled price changes before they execute, so that I can correct mistakes or adjust to market conditions.

#### Acceptance Criteria

1. WHEN an admin views an Active_Schedule, THE System SHALL display an "Edit" button
2. WHEN an admin clicks "Edit" on an Active_Schedule, THE System SHALL display a form pre-filled with the current schedule details
3. WHEN an admin submits edited schedule details, THE System SHALL validate that the new scheduled datetime is in the future
4. WHEN an admin submits edited schedule details, THE System SHALL update the Price_Change_Schedule record
5. WHEN a schedule is edited, THE System SHALL log an audit entry with the old values, new values, and the admin's identity
6. THE System SHALL prevent editing a Price_Change_Schedule within 5 minutes of its scheduled execution time
7. IF an admin attempts to edit a schedule within 5 minutes of execution, THEN THE System SHALL display an error message "Cannot edit schedule within 5 minutes of execution time"

### Requirement 6: Cancel Scheduled Changes

**User Story:** As an admin, I want to cancel scheduled price changes, so that I can prevent unwanted price updates.

#### Acceptance Criteria

1. WHEN an admin views an Active_Schedule, THE System SHALL display a "Cancel" button
2. WHEN an admin clicks "Cancel", THE System SHALL display a confirmation dialog with the schedule details
3. WHEN an admin confirms cancellation, THE System SHALL update the Price_Change_Schedule status to "cancelled"
4. WHEN a schedule is cancelled, THE System SHALL record the cancellation timestamp and the admin's identity
5. WHEN a schedule is cancelled, THE System SHALL log an audit entry
6. THE System SHALL allow cancelling a Price_Change_Schedule up to 1 minute before its scheduled execution time
7. THE Scheduler SHALL skip Price_Change_Schedule records with status "cancelled"

### Requirement 7: Multi-Branch Support

**User Story:** As an admin, I want to schedule price changes for specific branches, so that different locations can have different pricing schedules.

#### Acceptance Criteria

1. WHEN creating a Price_Change_Schedule, THE System SHALL require the admin to select one or more branches
2. THE System SHALL allow creating a schedule that applies to all branches
3. WHEN executing a price change, THE System SHALL only update pumps belonging to the branches specified in the Price_Change_Schedule
4. THE System SHALL allow different branches to have overlapping price change schedules
5. WHEN displaying scheduled changes, THE System SHALL show which branches are affected by each schedule
6. WHERE an admin has access to multiple branches, THE System SHALL allow filtering schedules by branch

### Requirement 8: Schedule Conflict Detection

**User Story:** As an admin, I want to be warned about scheduling conflicts, so that I can avoid creating multiple overlapping price changes.

#### Acceptance Criteria

1. WHEN an admin creates a Price_Change_Schedule, THE System SHALL check for existing Active_Schedule records for the same pumps within 10 minutes of the new scheduled time
2. IF a scheduling conflict is detected, THEN THE System SHALL display a warning message listing the conflicting schedules
3. THE System SHALL allow the admin to proceed with creating the schedule despite the warning
4. WHEN a conflict warning is displayed, THE System SHALL show the details of conflicting schedules (scheduled time, prices, created by)
5. THE System SHALL not prevent creating overlapping schedules (warning only, not blocking)

### Requirement 9: Audit Trail and History

**User Story:** As an admin, I want to view a complete history of all price changes, so that I can track pricing decisions and troubleshoot issues.

#### Acceptance Criteria

1. WHEN a Price_Change_Schedule is created, edited, cancelled, or executed, THE System SHALL create an audit log entry
2. THE System SHALL record the admin's identity, timestamp, action type, old values, and new values in each audit entry
3. WHEN an admin views the audit log, THE System SHALL display all price change related events
4. THE System SHALL allow filtering audit entries by date range, branch, pump, and admin user
5. THE System SHALL retain audit entries for at least 365 days
6. WHEN displaying audit entries, THE System SHALL show the actual execution time versus the scheduled time for executed schedules

### Requirement 10: Scheduler Reliability and Error Handling

**User Story:** As an admin, I want the scheduler to be reliable and handle errors gracefully, so that price changes execute correctly even during system issues.

#### Acceptance Criteria

1. THE Scheduler SHALL continue checking for pending schedules even if individual executions fail
2. IF the Scheduler process stops, THEN THE System SHALL automatically restart it within 60 seconds
3. WHEN the Scheduler restarts, THE System SHALL immediately check for any missed schedules (scheduled time in the past but status still "pending")
4. WHEN a missed schedule is detected, THE System SHALL execute it immediately and log a warning about the delayed execution
5. THE Scheduler SHALL process schedules in chronological order (earliest scheduled time first)
6. IF multiple schedules are scheduled for the same time, THEN THE Scheduler SHALL execute them sequentially
7. THE System SHALL ensure that only one Scheduler instance runs at a time (prevent duplicate executions)
8. WHEN a database connection error occurs, THE Scheduler SHALL retry the operation up to 3 times with exponential backoff (1s, 2s, 4s)

### Requirement 11: Notification System

**User Story:** As an admin, I want to receive notifications about scheduled price changes, so that I stay informed about pricing updates.

#### Acceptance Criteria

1. WHEN a Price_Change_Schedule is executed successfully, THE System SHALL create a notification for all admin users
2. WHEN a Price_Change_Schedule execution fails, THE System SHALL create a high-priority notification for all admin users
3. WHEN a Price_Change_Schedule is scheduled to execute within 1 hour, THE System SHALL create a reminder notification for the admin who created it
4. THE System SHALL display notifications in the admin dashboard
5. THE System SHALL allow admins to mark notifications as read
6. THE System SHALL retain notifications for 30 days

### Requirement 12: Bulk Price Change Scheduling

**User Story:** As an admin, I want to schedule the same price change for multiple pumps at once, so that I can efficiently update prices across all fuel types.

#### Acceptance Criteria

1. WHEN creating a Price_Change_Schedule, THE System SHALL allow selecting multiple pumps
2. WHEN creating a Price_Change_Schedule, THE System SHALL allow selecting all pumps of a specific fuel type
3. WHEN creating a Price_Change_Schedule, THE System SHALL allow selecting all pumps in a branch
4. THE System SHALL display a summary showing how many pumps will be affected before the admin confirms
5. WHEN a bulk schedule is created, THE System SHALL create a single Price_Change_Schedule record that references all selected pumps
6. WHEN executing a bulk schedule, THE System SHALL update all selected pumps atomically (all succeed or all fail)
7. IF any pump update fails during bulk execution, THEN THE System SHALL roll back all changes and mark the schedule as "failed"
