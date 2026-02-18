import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useFuelStore = create((set, get) => ({
  fuelTypes: [],
  loading: false,
  error: null,

  fetchFuelTypes: async () => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('fuel_types')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      set({ fuelTypes: data })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  updateFuelPrice: async (fuelTypeId, newPrice, changedBy) => {
    try {
      const fuelType = get().fuelTypes.find(f => f.id === fuelTypeId)
      if (!fuelType) return { success: false, error: 'Fuel type not found' }

      // Log price change
      await supabase.from('fuel_price_history').insert({
        fuel_type_id: fuelTypeId,
        old_price: fuelType.current_price,
        new_price: newPrice,
        changed_by: changedBy,
      })

      const { error } = await supabase
        .from('fuel_types')
        .update({ current_price: newPrice })
        .eq('id', fuelTypeId)
      if (error) throw error

      await get().fetchFuelTypes()
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },
}))
