import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

export const useBranchStore = create(
  persist(
    (set, get) => ({
      branches: [],
      selectedBranchId: null, // null = "All Branches"
      loading: false,
      lastFetch: 0,
      initialized: true,

      fetchBranches: async (force = false) => {
        // Prevent redundant fetches within 5 seconds
        const now = Date.now()
        if (!force && get().branches.length > 0 && now - get().lastFetch < 5000) {
          if (!get().initialized) set({ initialized: true })
          return
        }
        // Removed loading guard — it was silently dropping fetch calls during navigation
        
        set({ loading: true })
        try {
          const { data, error } = await supabase
            .from('branches')
            .select('*')
            .eq('is_active', true)
            .order('name')
          if (error) {
            console.warn('branches table not available yet:', error.message)
            set({ branches: [], loading: false, lastFetch: now, initialized: true })
            return
          }
          set({ branches: data || [], loading: false, lastFetch: now, initialized: true })
        } catch (e) {
          console.warn('Failed to fetch branches:', e)
          set({ branches: [], loading: false, lastFetch: now, initialized: true })
        }
      },

      setSelectedBranch: (branchId) => set({ selectedBranchId: branchId }),

      // Helper: get the selected branch object
      getSelectedBranch: () => {
        const { branches, selectedBranchId } = get()
        return branches.find(b => b.id === selectedBranchId) || null
      },

      // Helper: apply branch filter to a supabase query builder
      // Usage: const query = applyBranchFilter(supabase.from('cash_sales').select('*'))
      applyBranchFilter: (query) => {
        const { selectedBranchId } = get()
        if (selectedBranchId) return query.eq('branch_id', selectedBranchId)
        return query
      },
    }),
    {
      name: 'macky-pos-branch',
      partialize: (state) => ({
        branches: state.branches,
      }),
    }
  )
)

// Fetch branches on app start
useBranchStore.getState().fetchBranches()
