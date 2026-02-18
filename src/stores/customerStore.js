import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useCustomerStore = create((set, get) => ({
  customers: [],
  loading: false,
  error: null,

  fetchCustomers: async () => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      set({ customers: data })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  addCustomer: async (customer) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert(customer)
        .select()
        .single()
      if (error) throw error
      set(state => ({ customers: [...state.customers, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  updateCustomer: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      set(state => ({
        customers: state.customers.map(c => c.id === id ? data : c)
      }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteCustomer: async (id) => {
    try {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
      set(state => ({
        customers: state.customers.filter(c => c.id !== id)
      }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },
}))
