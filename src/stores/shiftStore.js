import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useShiftStore = create((set, get) => ({
  currentShift: null,
  shifts: [],
  loading: false,
  error: null,

  fetchShifts: async (date) => {
    if (get()._fetching) return
    set({ _fetching: true, loading: true })
    try {
      let query = supabase.from('shifts').select('*, profiles(full_name)').order('shift_date', { ascending: false })
      if (date) query = query.eq('shift_date', date)
      const { data, error } = await query
      if (error) throw error
      set({ shifts: data, loading: false, _fetching: false, error: null })
    } catch (error) {
      set({ error: error.message, loading: false, _fetching: false })
    }
  },

  openShift: async (shiftNumber, shiftDate, cashierId) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          shift_number: shiftNumber,
          shift_date: shiftDate,
          cashier_id: cashierId,
          started_at: new Date().toISOString(),
          status: 'open',
        })
        .select('*, profiles(full_name)')
        .single()
      if (error) throw error
      set({ currentShift: data, loading: false })
      return { success: true, data }
    } catch (error) {
      set({ error: error.message, loading: false })
      return { success: false, error: error.message }
    }
  },

  closeShift: async (shiftId) => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .update({ status: 'closed', ended_at: new Date().toISOString() })
        .eq('id', shiftId)
        .select()
        .single()
      if (error) throw error
      set({ currentShift: null })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  getOpenShift: async (date) => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*, profiles(full_name)')
        .eq('shift_date', date)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      set({ currentShift: data })
      return data
    } catch (error) {
      set({ error: error.message })
      return null
    }
  },
}))
