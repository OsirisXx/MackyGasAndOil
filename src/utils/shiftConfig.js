// Branch-specific shift times configuration
// Actual station branches: Manolo, Sankanan, Patulangan, Balingasag

export const BRANCH_SHIFTS = {
  // Manolo, Sankanan, Patulangan - same times (4am, 12pm, 8pm)
  'Manolo': [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  'Sankanan': [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  'Patulangan': [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  // Balingasag - different times (5am, 1pm, 9pm)
  'Balingasag': [
    { number: 1, label: '1st', startTime: '5:00 AM', endTime: '1:00 PM' },
    { number: 2, label: '2nd', startTime: '1:00 PM', endTime: '9:00 PM' },
    { number: 3, label: '3rd', startTime: '9:00 PM', endTime: '5:00 AM' },
  ],
}

/**
 * Get shifts for a specific branch
 * @param {string} branchName - Name of the branch (exact match)
 * @returns {Array} Array of shift objects
 */
export function getShiftsForBranch(branchName) {
  if (!branchName) return BRANCH_SHIFTS['Manolo'] // Default to Manolo times

  // Exact match
  if (BRANCH_SHIFTS[branchName]) {
    return BRANCH_SHIFTS[branchName]
  }

  // Fallback to Manolo times (4am, 12pm, 8pm)
  return BRANCH_SHIFTS['Manolo']
}

/**
 * Format shift time range for display
 * @param {Object} shift - Shift object with startTime and endTime
 * @returns {string} Formatted time range
 */
export function formatShiftTime(shift) {
  return `${shift.startTime} - ${shift.endTime}`
}

/**
 * Get current shift number based on current time
 * @param {string} branchName - Name of the branch
 * @returns {number} Current shift number (1, 2, or 3)
 */
export function getCurrentShift(branchName) {
  const shifts = getShiftsForBranch(branchName)
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMinute

  // Parse time string (e.g., "4:00 AM") to minutes since midnight
  const parseTime = (timeStr) => {
    const [time, period] = timeStr.split(' ')
    let [hours, minutes] = time.split(':').map(Number)
    
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    
    return hours * 60 + minutes
  }

  // Check each shift
  for (const shift of shifts) {
    const startMinutes = parseTime(shift.startTime)
    const endMinutes = parseTime(shift.endTime)

    // Handle shifts that cross midnight (e.g., 8:00 PM - 4:00 AM)
    if (endMinutes < startMinutes) {
      // Shift crosses midnight
      if (currentTimeInMinutes >= startMinutes || currentTimeInMinutes < endMinutes) {
        return shift.number
      }
    } else {
      // Normal shift within same day
      if (currentTimeInMinutes >= startMinutes && currentTimeInMinutes < endMinutes) {
        return shift.number
      }
    }
  }

  // Fallback to shift 1 if no match (shouldn't happen)
  return 1
}
