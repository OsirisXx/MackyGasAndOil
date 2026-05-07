# Design Document: Cash Deposit Shift Filter

## Overview

This design document specifies the technical implementation for adding shift-based filtering to the Cash Deposits page (`/admin/cash-deposits`). The feature enables administrators to filter deposits by shift (1st, 2nd, 3rd, or All Shifts) using branch-specific shift configurations. The implementation handles midnight-crossing shifts and integrates seamlessly with existing filter logic.

### Goals

- Add shift filter dropdown to the Cash Deposits page filters section
- Filter deposits based on their timestamp falling within shift time ranges
- Support branch-specific shift configurations (Manolo/Sankanan/Patulangan: 4AM-12PM-8PM, Balingasag: 5AM-1PM-9PM)
- Handle midnight-crossing shifts correctly (Shift 3 spans midnight)
- Maintain compatibility with existing filters (date, cashier, branch, deposit type)

### Non-Goals

- Modifying the database schema (deposits already have `deposit_date` timestamp)
- Adding shift tracking to deposit records (filtering is computed client-side)
- Changing shift configurations (using existing `shiftConfig.js`)
- Modifying the Accountability Report page (separate feature)

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CashDeposits.jsx                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Filter Controls                         │  │
│  │  [Date] [Cashier] [Branch] [Type] [Shift] [Deleted] │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           fetchDeposits()                            │  │
│  │  • Fetch all deposits for selected date             │  │
│  │  • Apply existing filters (branch, cashier, type)   │  │
│  │  • Store in deposits state                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      filterDepositsByShift()                         │  │
│  │  • Get branch-specific shift config                 │  │
│  │  • Convert deposit timestamps to local time         │  │
│  │  • Check if timestamp falls in shift range          │  │
│  │  • Return filtered deposits                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Render Deposits Table                        │  │
│  │  • Display filtered deposits                         │  │
│  │  • Update summary cards with filtered totals        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   shiftConfig.js      │
              │  • getShiftsForBranch │
              │  • BRANCH_SHIFTS      │
              └───────────────────────┘
```

### Component Integration

The shift filter integrates with the existing `CashDeposits.jsx` component by:

1. **Adding State**: New `selectedShift` state variable (default: 'all')
2. **UI Addition**: Shift dropdown in the filters section
3. **Filtering Logic**: Client-side filtering function applied after data fetch
4. **Summary Updates**: Filtered deposits used for summary card calculations

### Data Flow

```
User selects shift → selectedShift state updates → 
filterDepositsByShift() runs → filtered deposits rendered → 
summary cards recalculated
```

## Components and Interfaces

### Modified Component: CashDeposits.jsx

#### New State Variables

```javascript
const [selectedShift, setSelectedShift] = useState('all') // 'all' | '1' | '2' | '3'
```

#### New UI Element: Shift Filter Dropdown

Location: Inside the filters grid, after the "Deposit Type" filter

```jsx
<div>
  <label className="block text-xs font-medium text-gray-500 mb-1">Shift</label>
  <select
    value={selectedShift}
    onChange={(e) => setSelectedShift(e.target.value)}
    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
  >
    <option value="all">All Shifts</option>
    <option value="1">1st Shift</option>
    <option value="2">2nd Shift</option>
    <option value="3">3rd Shift</option>
  </select>
</div>
```

#### Modified Rendering Logic

Replace direct `deposits` usage with `filteredDeposits`:

```javascript
// Compute filtered deposits based on selected shift
const filteredDeposits = useMemo(() => {
  if (selectedShift === 'all') return deposits
  return filterDepositsByShift(deposits, selectedShift, selectedDate, selectedBranch)
}, [deposits, selectedShift, selectedDate, selectedBranch])

// Use filteredDeposits for:
// - Summary card calculations (totalDeposits)
// - Table rendering
// - Deposit count display
```

### New Utility Function: filterDepositsByShift

Location: Inside `CashDeposits.jsx` (could be extracted to utils later)

```javascript
/**
 * Filter deposits by shift based on deposit timestamp
 * @param {Array} deposits - Array of deposit objects
 * @param {string} shiftNumber - '1', '2', or '3'
 * @param {string} selectedDate - Date string in 'yyyy-MM-dd' format
 * @param {Object} selectedBranch - Branch object with name property
 * @returns {Array} Filtered deposits
 */
function filterDepositsByShift(deposits, shiftNumber, selectedDate, selectedBranch) {
  const shifts = getShiftsForBranch(selectedBranch?.name)
  const shift = shifts.find(s => s.number === parseInt(shiftNumber))
  
  if (!shift) return deposits

  return deposits.filter(deposit => {
    return isDepositInShift(deposit.deposit_date, shift, selectedDate)
  })
}
```

### New Utility Function: isDepositInShift

```javascript
/**
 * Check if a deposit timestamp falls within a shift's time range
 * @param {string} depositTimestamp - ISO timestamp (UTC) from deposit_date
 * @param {Object} shift - Shift config object with startTime and endTime
 * @param {string} selectedDate - Date string in 'yyyy-MM-dd' format
 * @returns {boolean} True if deposit is in shift
 */
function isDepositInShift(depositTimestamp, shift, selectedDate) {
  // Convert UTC timestamp to local Date object
  const depositDate = new Date(depositTimestamp)
  
  // Parse selected date
  const [year, month, day] = selectedDate.split('-').map(Number)
  
  // Parse shift times
  const { startHour, startMinute } = parseShiftTime(shift.startTime)
  const { endHour, endMinute } = parseShiftTime(shift.endTime)
  
  // Create shift boundary timestamps
  const shiftStart = new Date(year, month - 1, day, startHour, startMinute, 0, 0)
  let shiftEnd = new Date(year, month - 1, day, endHour, endMinute, 0, 0)
  
  // Handle midnight crossing: if end time < start time, shift crosses midnight
  if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
    // Shift ends on the next day
    shiftEnd = new Date(year, month - 1, day + 1, endHour, endMinute, 0, 0)
  }
  
  // Check if deposit falls within shift range
  return depositDate >= shiftStart && depositDate < shiftEnd
}
```

### New Utility Function: parseShiftTime

```javascript
/**
 * Parse shift time string to hour and minute
 * @param {string} timeStr - Time string like "4:00 AM" or "12:00 PM"
 * @returns {Object} { startHour, startMinute }
 */
function parseShiftTime(timeStr) {
  const [time, period] = timeStr.split(' ')
  let [hours, minutes] = time.split(':').map(Number)
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12
  }
  if (period === 'AM' && hours === 12) {
    hours = 0
  }
  
  return { startHour: hours, startMinute: minutes }
}
```

## Data Models

### Existing Data Model: cash_deposits

No changes to the database schema. The existing `deposit_date` field (timestamptz) is sufficient.

```sql
-- Existing schema (no changes)
CREATE TABLE cash_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid REFERENCES cashiers(id),
  branch_id uuid REFERENCES branches(id),
  amount numeric(10,2) NOT NULL,
  deposit_type text NOT NULL,
  deposit_date timestamptz NOT NULL, -- Used for shift filtering
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
```

### Shift Configuration Model

Existing model from `src/utils/shiftConfig.js`:

```javascript
{
  number: 1,           // Shift number (1, 2, or 3)
  label: '1st',        // Display label
  startTime: '4:00 AM', // Start time string
  endTime: '12:00 PM'   // End time string
}
```

## Shift Time Comparison Algorithm

### Algorithm Overview

The shift filtering algorithm determines if a deposit's timestamp falls within a shift's time range, accounting for midnight-crossing shifts.

### Algorithm Steps

1. **Parse Deposit Timestamp**: Convert UTC timestamp to local Date object
2. **Parse Shift Times**: Convert shift time strings to 24-hour format
3. **Create Shift Boundaries**: Build Date objects for shift start and end
4. **Handle Midnight Crossing**: If end time < start time, add 1 day to end date
5. **Compare Timestamps**: Check if deposit timestamp is within [start, end)

### Pseudocode

```
function isDepositInShift(depositTimestamp, shift, selectedDate):
  depositDate = new Date(depositTimestamp)  // UTC to local
  
  [year, month, day] = parse(selectedDate)
  
  {startHour, startMinute} = parseShiftTime(shift.startTime)
  {endHour, endMinute} = parseShiftTime(shift.endTime)
  
  shiftStart = Date(year, month-1, day, startHour, startMinute)
  shiftEnd = Date(year, month-1, day, endHour, endMinute)
  
  if endHour < startHour:  // Midnight crossing
    shiftEnd = Date(year, month-1, day+1, endHour, endMinute)
  
  return depositDate >= shiftStart AND depositDate < shiftEnd
```

### Example: Midnight Crossing Shift

**Scenario**: Shift 3 in Manolo (8:00 PM - 4:00 AM), selected date: 2024-01-15

```
shiftStart = 2024-01-15 20:00:00 (8:00 PM)
shiftEnd   = 2024-01-16 04:00:00 (4:00 AM next day)

Deposit at 2024-01-15 22:30:00 → IN SHIFT (between start and end)
Deposit at 2024-01-16 02:00:00 → IN SHIFT (before end on next day)
Deposit at 2024-01-16 05:00:00 → NOT IN SHIFT (after end)
```

### Example: Same-Day Shift

**Scenario**: Shift 1 in Manolo (4:00 AM - 12:00 PM), selected date: 2024-01-15

```
shiftStart = 2024-01-15 04:00:00 (4:00 AM)
shiftEnd   = 2024-01-15 12:00:00 (12:00 PM same day)

Deposit at 2024-01-15 08:30:00 → IN SHIFT
Deposit at 2024-01-15 13:00:00 → NOT IN SHIFT
```

## Handling Midnight-Crossing Shifts

### Problem Statement

Shift 3 crosses midnight:
- Manolo/Sankanan/Patulangan: 8:00 PM → 4:00 AM
- Balingasag: 9:00 PM → 5:00 AM

When a user selects a date (e.g., Jan 15) and Shift 3, they expect to see:
- Deposits from 8:00 PM on Jan 15
- Deposits until 3:59:59 AM on Jan 16

### Solution

The `isDepositInShift` function detects midnight crossing by comparing end hour to start hour:

```javascript
if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
  // Shift crosses midnight - add 1 day to end date
  shiftEnd = new Date(year, month - 1, day + 1, endHour, endMinute, 0, 0)
}
```

### Edge Cases

1. **Deposit exactly at shift start**: Included (>= comparison)
2. **Deposit exactly at shift end**: Excluded (< comparison)
3. **Deposit on next day within shift**: Included (midnight crossing handled)
4. **Deposit on next day after shift**: Excluded (outside range)

## State Management

### State Variables

```javascript
// Existing state
const [deposits, setDeposits] = useState([])
const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
const [selectedCashier, setSelectedCashier] = useState('')
const [selectedType, setSelectedType] = useState('')
const [showDeleted, setShowDeleted] = useState(false)

// New state
const [selectedShift, setSelectedShift] = useState('all')
```

### State Persistence Rules

The `selectedShift` state persists when other filters change:

- ✅ Date filter changes → shift selection maintained
- ✅ Cashier filter changes → shift selection maintained
- ✅ Branch filter changes → shift selection maintained
- ✅ Deposit type filter changes → shift selection maintained
- ✅ Show deleted toggle → shift selection maintained

### State Reset Rules

The `selectedShift` state does NOT reset automatically. Users must manually change it.

## Integration with Existing Filter Logic

### Filter Execution Order

1. **Database Query Filters** (applied in `fetchDeposits`):
   - Branch filter (`branch_id`)
   - Date filter (`deposit_date` range)
   - Cashier filter (`cashier_id`)
   - Deposit type filter (`deposit_type`)
   - Deleted filter (`deleted_at`)

2. **Client-Side Filters** (applied after fetch):
   - Shift filter (new)

### Why Client-Side Filtering?

Shift filtering is done client-side because:
- Shift configurations are branch-specific and stored in JavaScript
- Shift time ranges require complex date arithmetic
- Database doesn't have shift boundary information
- All deposits for the date are already fetched
- Performance impact is minimal (filtering in-memory array)

### Filter Combination Example

User selects:
- Date: 2024-01-15
- Branch: Manolo
- Cashier: John Doe
- Deposit Type: Vault Deposit
- Shift: 2nd

**Execution**:
1. Fetch deposits from database with branch, date, cashier, type filters
2. Apply shift filter client-side to filter by 12:00 PM - 8:00 PM range
3. Render filtered results

## Error Handling

### Invalid Shift Configuration

```javascript
function filterDepositsByShift(deposits, shiftNumber, selectedDate, selectedBranch) {
  const shifts = getShiftsForBranch(selectedBranch?.name)
  const shift = shifts.find(s => s.number === parseInt(shiftNumber))
  
  if (!shift) {
    console.warn(`Shift ${shiftNumber} not found for branch ${selectedBranch?.name}`)
    return deposits // Return unfiltered if shift not found
  }
  
  // ... filtering logic
}
```

### Invalid Date Format

```javascript
function isDepositInShift(depositTimestamp, shift, selectedDate) {
  try {
    const depositDate = new Date(depositTimestamp)
    if (isNaN(depositDate.getTime())) {
      console.error('Invalid deposit timestamp:', depositTimestamp)
      return false
    }
    
    // ... comparison logic
  } catch (error) {
    console.error('Error parsing deposit timestamp:', error)
    return false
  }
}
```

### Missing Branch Configuration

```javascript
// In filterDepositsByShift
const shifts = getShiftsForBranch(selectedBranch?.name)
// getShiftsForBranch returns Manolo shifts as default if branch not found
```

### Empty Deposits Array

```javascript
// No special handling needed - filter on empty array returns empty array
const filteredDeposits = useMemo(() => {
  if (selectedShift === 'all') return deposits
  return filterDepositsByShift(deposits, selectedShift, selectedDate, selectedBranch)
}, [deposits, selectedShift, selectedDate, selectedBranch])
// If deposits is [], filteredDeposits will be []
```

## Testing Strategy

### Unit Tests

Unit tests should verify specific examples and edge cases:

1. **Shift Time Parsing**
   - Test `parseShiftTime` with various time formats
   - Verify 12-hour to 24-hour conversion
   - Test AM/PM handling

2. **Midnight Crossing Detection**
   - Test shift with end time < start time
   - Test shift with end time > start time
   - Test shift with end time = start time

3. **Deposit Filtering**
   - Test deposit at shift start (included)
   - Test deposit at shift end (excluded)
   - Test deposit before shift (excluded)
   - Test deposit after shift (excluded)

4. **Branch Configuration**
   - Test Manolo shift times
   - Test Balingasag shift times
   - Test unknown branch (defaults to Manolo)

5. **Edge Cases**
   - Empty deposits array
   - Invalid deposit timestamp
   - Missing shift configuration
   - Null/undefined branch

### Integration Tests

Integration tests should verify the complete filtering workflow:

1. **Filter Combination**
   - Test shift filter with date filter
   - Test shift filter with cashier filter
   - Test shift filter with branch filter
   - Test shift filter with deposit type filter

2. **State Persistence**
   - Change date, verify shift selection maintained
   - Change cashier, verify shift selection maintained
   - Change branch, verify shift selection maintained

3. **UI Updates**
   - Verify summary cards update with filtered totals
   - Verify table shows only filtered deposits
   - Verify deposit count updates

### Manual Testing Checklist

- [ ] Select "All Shifts" - verify all deposits shown
- [ ] Select "1st Shift" - verify only 1st shift deposits shown
- [ ] Select "2nd Shift" - verify only 2nd shift deposits shown
- [ ] Select "3rd Shift" - verify midnight-crossing deposits shown
- [ ] Change date while shift selected - verify shift maintained
- [ ] Change branch - verify shift times update correctly
- [ ] Test with Manolo branch (4AM-12PM-8PM)
- [ ] Test with Balingasag branch (5AM-1PM-9PM)
- [ ] Verify summary cards show filtered totals
- [ ] Verify no deposits message when no matches

## Implementation Notes

### Performance Considerations

- **Client-side filtering**: Filtering happens in-memory on already-fetched data
- **useMemo optimization**: Filtered deposits computed only when dependencies change
- **No additional database queries**: Shift filter doesn't trigger new fetches

### Browser Compatibility

- **Date parsing**: Uses standard JavaScript Date constructor (widely supported)
- **Time zone handling**: Relies on browser's local time zone
- **Array methods**: Uses standard filter/find methods (ES5+)

### Future Enhancements

Potential improvements not included in this design:

1. **Server-side filtering**: Move shift filtering to database query (requires schema changes)
2. **Shift tracking**: Add `shift_number` column to deposits table
3. **Time zone configuration**: Allow explicit time zone selection
4. **Shift filter presets**: Save common filter combinations
5. **Export filtered data**: Download filtered deposits as CSV

## References

- **Requirements Document**: `.kiro/specs/cash-deposit-shift-filter/requirements.md`
- **Existing Component**: `src/pages/CashDeposits.jsx`
- **Shift Configuration**: `src/utils/shiftConfig.js`
- **Similar Implementation**: `src/pages/AccountabilityReport.jsx` (uses shift filtering for sales)
