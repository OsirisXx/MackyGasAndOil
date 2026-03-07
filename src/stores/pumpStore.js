import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const usePumpStore = create((set, get) => ({
  pumps: [],
  shiftReadings: [],
  loading: false,
  error: null,

  // Fetch all pumps for a branch
  fetchPumps: async (branchId = null) => {
    set({ loading: true, error: null })
    try {
      let query = supabase
        .from('pumps')
        .select('*, fuel_tanks(tank_name, tank_number)')
        .eq('is_active', true)
        .order('pump_number')

      if (branchId) {
        query = query.eq('branch_id', branchId)
      }

      const { data, error } = await query

      if (error) throw error
      set({ pumps: data || [], loading: false })
      return { success: true, data }
    } catch (error) {
      console.error('fetchPumps error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Create a new pump
  createPump: async (pumpData) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('pumps')
        .insert(pumpData)
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        pumps: [...state.pumps, data].sort((a, b) => a.pump_number - b.pump_number),
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('createPump error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Update a pump
  updatePump: async (pumpId, updates) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('pumps')
        .update(updates)
        .eq('id', pumpId)
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        pumps: state.pumps.map((p) => (p.id === pumpId ? data : p)),
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('updatePump error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Soft delete a pump (set is_active = false)
  deletePump: async (pumpId) => {
    set({ loading: true, error: null })
    try {
      // Check if pump has active shift readings today
      const { data: activeReadings } = await supabase
        .from('shift_pump_readings')
        .select('id')
        .eq('pump_id', pumpId)
        .eq('shift_date', new Date().toISOString().split('T')[0])
        .eq('status', 'open')

      if (activeReadings && activeReadings.length > 0) {
        throw new Error('Cannot delete pump with active shift readings. Please close the shift first.')
      }

      const { error } = await supabase
        .from('pumps')
        .update({ is_active: false })
        .eq('id', pumpId)

      if (error) throw error

      set((state) => ({
        pumps: state.pumps.filter((p) => p.id !== pumpId),
        loading: false,
      }))

      return { success: true }
    } catch (error) {
      console.error('deletePump error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Fetch shift readings for pumps
  fetchShiftReadings: async (branchId, shiftDate, shiftNumber) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('shift_pump_readings')
        .select(`
          *,
          pumps(pump_number, pump_name, fuel_type, price_per_liter),
          cashiers(full_name)
        `)
        .eq('branch_id', branchId || null)
        .eq('shift_date', shiftDate)
        .eq('shift_number', shiftNumber)
        .order('pumps(pump_number)')

      if (error) throw error
      set({ shiftReadings: data || [], loading: false })
      return { success: true, data }
    } catch (error) {
      console.error('fetchShiftReadings error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Get previous shift readings for handover
  getPreviousShiftReadings: async (branchId, shiftDate, shiftNumber) => {
    try {
      const { data, error } = await supabase.rpc('get_previous_shift_readings', {
        p_branch_id: branchId,
        p_shift_date: shiftDate,
        p_shift_number: shiftNumber,
      })

      if (error) throw error
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('getPreviousShiftReadings error:', error)
      return { success: false, error: error.message, data: [] }
    }
  },

  // Create shift readings with automatic handover
  createShiftReadingsWithHandover: async (branchId, shiftDate, shiftNumber, cashierId) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('create_shift_readings_with_handover', {
        p_branch_id: branchId,
        p_shift_date: shiftDate,
        p_shift_number: shiftNumber,
        p_cashier_id: cashierId,
      })

      if (error) throw error
      set({ shiftReadings: data || [], loading: false })
      return { success: true, data }
    } catch (error) {
      console.error('createShiftReadingsWithHandover error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Start tracking a pump (create shift reading)
  startPumpTracking: async (readingData) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('shift_pump_readings')
        .insert(readingData)
        .select(`
          *,
          pumps(pump_number, pump_name, fuel_type, price_per_liter),
          cashiers(full_name)
        `)
        .single()

      if (error) throw error

      set((state) => ({
        shiftReadings: [...state.shiftReadings, data],
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('startPumpTracking error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Update shift reading
  updateShiftReading: async (readingId, updates) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('shift_pump_readings')
        .update(updates)
        .eq('id', readingId)
        .select(`
          *,
          pumps(pump_number, pump_name, fuel_type, price_per_liter),
          cashiers(full_name)
        `)
        .single()

      if (error) throw error

      set((state) => ({
        shiftReadings: state.shiftReadings.map((r) => (r.id === readingId ? data : r)),
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('updateShiftReading error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Close shift for a pump
  closePumpShift: async (readingId, endingReading) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('shift_pump_readings')
        .update({
          ending_reading: endingReading,
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', readingId)
        .select(`
          *,
          pumps(pump_number, pump_name, fuel_type, price_per_liter),
          cashiers(full_name)
        `)
        .single()

      if (error) throw error

      set((state) => ({
        shiftReadings: state.shiftReadings.map((r) => (r.id === readingId ? data : r)),
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('closePumpShift error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Record fuel sale
  recordFuelSale: async (saleData) => {
    try {
      const { data, error } = await supabase
        .from('fuel_sales')
        .insert(saleData)
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('recordFuelSale error:', error)
      return { success: false, error: error.message }
    }
  },

  // Get fuel sales for a shift
  getFuelSales: async (branchId, shiftDate, shiftNumber) => {
    try {
      const { data, error } = await supabase
        .from('fuel_sales')
        .select(`
          *,
          pumps(pump_number, pump_name, fuel_type),
          cashiers(full_name)
        `)
        .eq('branch_id', branchId || null)
        .eq('shift_date', shiftDate)
        .eq('shift_number', shiftNumber)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('getFuelSales error:', error)
      return { success: false, error: error.message, data: [] }
    }
  },

  // ============================================================================
  // CONTINUOUS TRACKING FUNCTIONS (New System)
  // ============================================================================

  // Initialize pump reading (Admin only)
  initializePumpReading: async (pumpId, initialReading) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('initialize_pump_reading', {
        p_pump_id: pumpId,
        p_initial_reading: initialReading,
      })

      if (error) throw error

      // Update local state
      set((state) => ({
        pumps: state.pumps.map((p) => 
          p.id === pumpId 
            ? { ...p, initial_reading: initialReading, current_reading: initialReading, reading_initialized_at: new Date().toISOString() }
            : p
        ),
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('initializePumpReading error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Start shift tracking (creates snapshots for all pumps)
  startShiftTracking: async (branchId, shiftDate, shiftNumber, cashierId = null) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('start_shift_tracking', {
        p_branch_id: branchId,
        p_shift_date: shiftDate,
        p_shift_number: shiftNumber,
        p_cashier_id: cashierId,
      })

      if (error) throw error
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('startShiftTracking error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Close shift tracking (finalizes snapshots)
  closeShiftTracking: async (branchId, shiftDate, shiftNumber, cashierId = null) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('close_shift_tracking', {
        p_branch_id: branchId,
        p_shift_date: shiftDate,
        p_shift_number: shiftNumber,
        p_cashier_id: cashierId,
      })

      if (error) throw error
      set({ loading: false })
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('closeShiftTracking error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Adjust pump reading (Admin only)
  adjustPumpReading: async (pumpId, newReading, reason = null) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase.rpc('adjust_pump_reading', {
        p_pump_id: pumpId,
        p_new_reading: newReading,
        p_reason: reason,
      })

      if (error) throw error

      // Update local state
      set((state) => ({
        pumps: state.pumps.map((p) => 
          p.id === pumpId ? { ...p, current_reading: newReading } : p
        ),
        loading: false,
      }))

      return { success: true, data }
    } catch (error) {
      console.error('adjustPumpReading error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Fetch shift reading snapshots
  fetchShiftSnapshots: async (branchId, shiftDate, shiftNumber) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('shift_reading_snapshots')
        .select(`
          *,
          pumps(pump_number, pump_name, fuel_type, category, price_per_liter)
        `)
        .eq('branch_id', branchId)
        .eq('shift_date', shiftDate)
        .eq('shift_number', shiftNumber)
        .order('pumps(pump_number)')

      if (error) throw error
      set({ shiftReadings: data || [], loading: false })
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('fetchShiftSnapshots error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Fetch pump status view (includes current readings and shift info)
  fetchPumpStatus: async (branchId = null) => {
    set({ loading: true, error: null })
    try {
      let query = supabase
        .from('pump_status')
        .select('*')
        .order('pump_number')

      if (branchId) {
        query = query.eq('branch_id', branchId)
      }

      const { data, error } = await query

      if (error) throw error
      set({ pumps: data || [], loading: false })
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('fetchPumpStatus error:', error)
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  // Subscribe to real-time pump updates
  subscribeToPumpUpdates: (branchId, callback) => {
    const subscription = supabase
      .channel('pump-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pumps',
          filter: branchId ? `branch_id=eq.${branchId}` : undefined,
        },
        (payload) => {
          // Update local state
          set((state) => ({
            pumps: state.pumps.map((p) => 
              p.id === payload.new.id ? { ...p, ...payload.new } : p
            ),
          }))
          if (callback) callback(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  },
}))
