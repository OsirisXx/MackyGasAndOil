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
