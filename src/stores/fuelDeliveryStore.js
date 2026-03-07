import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useFuelDeliveryStore = create((set, get) => ({
  tanks: [],
  deliveries: [],
  dailyInventory: [],
  reconciliations: [],
  loading: false,
  error: null,

  fetchTanks: async (branchId = null) => {
    set({ loading: true })
    try {
      let query = supabase
        .from('fuel_tanks')
        .select('*, fuel_types(name, short_code)')
        .eq('is_active', true)
        .order('tank_number')
      
      if (branchId) {
        query = query.eq('branch_id', branchId)
      }

      const { data, error } = await query
      if (error) throw error
      set({ tanks: data || [] })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  fetchDeliveries: async (branchId = null, startDate = null, endDate = null) => {
    set({ loading: true })
    try {
      let query = supabase
        .from('fuel_deliveries')
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code), cashiers(full_name)')
        .order('delivery_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (branchId) {
        query = query.eq('branch_id', branchId)
      }

      if (startDate) {
        query = query.gte('delivery_date', startDate)
      }

      if (endDate) {
        query = query.lte('delivery_date', endDate)
      }

      const { data, error } = await query.limit(100)
      if (error) throw error
      set({ deliveries: data || [] })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  createDelivery: async (deliveryData) => {
    try {
      const { data, error } = await supabase
        .from('fuel_deliveries')
        .insert(deliveryData)
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code)')
        .single()

      if (error) throw error
      
      set(state => ({
        deliveries: [data, ...state.deliveries]
      }))

      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  updateDelivery: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('fuel_deliveries')
        .update(updates)
        .eq('id', id)
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code)')
        .single()

      if (error) throw error

      set(state => ({
        deliveries: state.deliveries.map(d => d.id === id ? data : d)
      }))

      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  fetchDailyInventory: async (branchId = null, date = null) => {
    set({ loading: true })
    try {
      let query = supabase
        .from('daily_tank_inventory')
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code)')
        .order('inventory_date', { ascending: false })

      if (branchId) {
        query = query.eq('branch_id', branchId)
      }

      if (date) {
        query = query.eq('inventory_date', date)
      }

      const { data, error } = await query
      if (error) throw error
      set({ dailyInventory: data || [] })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  saveDailyInventory: async (inventoryData) => {
    try {
      const { data, error } = await supabase
        .from('daily_tank_inventory')
        .upsert(inventoryData, { onConflict: 'tank_id,inventory_date' })
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code)')
        .single()

      if (error) throw error

      set(state => {
        const existing = state.dailyInventory.findIndex(
          inv => inv.tank_id === data.tank_id && inv.inventory_date === data.inventory_date
        )
        if (existing >= 0) {
          const updated = [...state.dailyInventory]
          updated[existing] = data
          return { dailyInventory: updated }
        } else {
          return { dailyInventory: [data, ...state.dailyInventory] }
        }
      })

      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  fetchReconciliations: async (branchId = null, startDate = null, endDate = null) => {
    set({ loading: true })
    try {
      let query = supabase
        .from('fuel_reconciliation')
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code)')
        .order('reconciliation_date', { ascending: false })

      if (branchId) {
        query = query.eq('branch_id', branchId)
      }

      if (startDate) {
        query = query.gte('reconciliation_date', startDate)
      }

      if (endDate) {
        query = query.lte('reconciliation_date', endDate)
      }

      const { data, error } = await query.limit(100)
      if (error) throw error
      set({ reconciliations: data || [] })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  createReconciliation: async (reconData) => {
    try {
      const { data, error } = await supabase
        .from('fuel_reconciliation')
        .upsert(reconData, { onConflict: 'tank_id,reconciliation_date' })
        .select('*, fuel_tanks(tank_number, tank_name), fuel_types(name, short_code)')
        .single()

      if (error) throw error

      set(state => {
        const existing = state.reconciliations.findIndex(
          r => r.tank_id === data.tank_id && r.reconciliation_date === data.reconciliation_date
        )
        if (existing >= 0) {
          const updated = [...state.reconciliations]
          updated[existing] = data
          return { reconciliations: updated }
        } else {
          return { reconciliations: [data, ...state.reconciliations] }
        }
      })

      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },
}))
