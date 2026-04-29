import { supabase } from '../lib/supabase'
import { getCurrentShift } from '../utils/shiftConfig'
import { format } from 'date-fns'

/**
 * Ensure shift snapshots exist for the current shift
 * Called when POS loads or when accountability is viewed
 * This function handles shift transitions automatically:
 * - If current shift is different from open snapshot, it closes the old and opens new
 * - Uses previous shift's ending_reading as new shift's beginning_reading
 *
 * @param {string} branchId - The branch UUID
 * @param {string} branchName - The branch name (used for shift schedule lookup)
 * @param {number|null} shiftNumber - Explicit shift number from cashier selection.
 *   When provided, skips auto-detection/transition and ensures snapshots for this specific shift.
 *   When null, uses existing auto-detection behavior.
 */
export async function ensureCurrentShiftSnapshots(branchId, branchName, shiftNumber = null) {
  if (!branchId) return { success: false, error: 'No branch ID' }

  try {
    // When an explicit shift number is provided, skip the auto-detect RPC
    // (which uses wall-clock time and may auto-close/transition shifts).
    // Instead, go directly to create_shift_snapshots for the specified shift.
    if (shiftNumber) {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await supabase.rpc('create_shift_snapshots', {
        p_branch_id: branchId,
        p_shift_date: today,
        p_shift_number: shiftNumber
      })
      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true, snapshotsCreated: data }
    }

    // No explicit shift — use existing auto-detection behavior:
    // Call the database function that handles everything:
    // 1. Detects if shift has changed
    // 2. Updates ending_reading on old shift
    // 3. Closes old shift
    // 4. Creates new shift with beginning_reading = old ending_reading
    const { data, error } = await supabase.rpc('ensure_current_shift_snapshots', {
      p_branch_id: branchId,
      p_branch_name: branchName || 'Manolo'
    })

    if (error) {
      console.error('Error ensuring shift snapshots:', error)
      // Fallback to old method if new function doesn't exist yet
      const currentShift = shiftNumber || getCurrentShift(branchName)
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: fallbackData, error: fallbackError } = await supabase.rpc('create_shift_snapshots', {
        p_branch_id: branchId,
        p_shift_date: today,
        p_shift_number: currentShift
      })
      if (fallbackError) {
        return { success: false, error: fallbackError.message }
      }
      return { success: true, snapshotsCreated: fallbackData }
    }

    return { success: true, snapshotsCreated: data }
  } catch (err) {
    console.error('Shift snapshot error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Update ending readings for all open snapshots
 * Called periodically or before viewing accountability
 */
export async function updateShiftReadings(branchId = null) {
  try {
    const { data, error } = await supabase.rpc('update_shift_snapshot_readings', {
      p_branch_id: branchId
    })

    if (error) {
      console.error('Error updating shift readings:', error)
      return { success: false, error: error.message }
    }

    return { success: true, updated: data }
  } catch (err) {
    console.error('Update readings error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Get shift snapshots for a specific date and shift
 */
export async function getShiftSnapshots(branchId, shiftDate, shiftNumber) {
  try {
    let query = supabase
      .from('shift_pump_snapshots')
      .select('*, pumps(pump_name, pump_number, fuel_type, category)')
      .eq('shift_date', shiftDate)
      .eq('shift_number', shiftNumber)
      .order('created_at')

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching shift snapshots:', error)
      return { success: false, error: error.message, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (err) {
    console.error('Get snapshots error:', err)
    return { success: false, error: err.message, data: [] }
  }
}

/**
 * Transition to a new shift (close current, open new)
 */
export async function transitionShift(branchId, newShiftDate, newShiftNumber) {
  try {
    const { data, error } = await supabase.rpc('transition_shift', {
      p_branch_id: branchId,
      p_new_shift_date: newShiftDate,
      p_new_shift_number: newShiftNumber
    })

    if (error) {
      console.error('Error transitioning shift:', error)
      return { success: false, error: error.message }
    }

    return { success: true, snapshotsCreated: data }
  } catch (err) {
    console.error('Transition shift error:', err)
    return { success: false, error: err.message }
  }
}
