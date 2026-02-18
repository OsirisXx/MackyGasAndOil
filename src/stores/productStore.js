import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useProductStore = create((set, get) => ({
  products: [],
  loading: false,
  error: null,

  fetchProducts: async () => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('category')
        .order('name')
      if (error) throw error
      // Filter active products client-side (in case is_active column doesn't exist)
      const activeProducts = data?.filter(p => p.is_active !== false) || []
      set({ products: activeProducts })
    } catch (error) {
      console.error('Failed to fetch products:', error)
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  addProduct: async (product) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single()
      if (error) throw error
      set(state => ({ products: [...state.products, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  updateProduct: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      set(state => ({
        products: state.products.map(p => p.id === id ? data : p)
      }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },
}))
