// Branch-specific shift times configuration
// Each branch has different shift start times

export const BRANCH_SHIFTS = {
  // Default shifts (used when branch not found or "All Branches")
  default: [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  // Manolo Fortich
  'Manolo': [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  // Sankanan
  'Sankanan': [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  // Patulangan
  'Patulangan': [
    { number: 1, label: '1st', startTime: '4:00 AM', endTime: '12:00 PM' },
    { number: 2, label: '2nd', startTime: '12:00 PM', endTime: '8:00 PM' },
    { number: 3, label: '3rd', startTime: '8:00 PM', endTime: '4:00 AM' },
  ],
  // Balingasag (different times)
  'Balingasag': [
    { number: 1, label: '1st', startTime: '5:00 AM', endTime: '1:00 PM' },
    { number: 2, label: '2nd', startTime: '1:00 PM', endTime: '9:00 PM' },
    { number: 3, label: '3rd', startTime: '9:00 PM', endTime: '5:00 AM' },
  ],
}

/**
 * Get shifts for a specific branch
 * @param {string} branchName - Name of the branch (partial match supported)
 * @returns {Array} Array of shift objects
 */
export function getShiftsForBranch(branchName) {
  if (!branchName) return BRANCH_SHIFTS.default

  // Try exact match first
  if (BRANCH_SHIFTS[branchName]) {
    return BRANCH_SHIFTS[branchName]
  }

  // Try partial match (case-insensitive)
  const lowerName = branchName.toLowerCase()
  for (const key of Object.keys(BRANCH_SHIFTS)) {
    if (key !== 'default' && lowerName.includes(key.toLowerCase())) {
      return BRANCH_SHIFTS[key]
    }
  }

  return BRANCH_SHIFTS.default
}

/**
 * Format shift time range for display
 * @param {Object} shift - Shift object with startTime and endTime
 * @returns {string} Formatted time range
 */
export function formatShiftTime(shift) {
  return `${shift.startTime} - ${shift.endTime}`
}
