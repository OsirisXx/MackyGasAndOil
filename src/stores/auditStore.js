import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'

export const useAuditStore = create((set, get) => ({
  logs: [],
  loading: false,
  totalCount: 0,

  // Log an action (call this from any page/component)
  logAction: async ({
    action,
    entityType,
    entityId = null,
    description = null,
    oldValues = null,
    newValues = null,
    metadata = null,
    branchId = null,
    branchName = null,
    cashierId = null,
    cashierName = null,
  }) => {
    try {
      // Get current user info from authStore
      const authState = useAuthStore.getState()
      const adminUser = authState.adminUser
      const adminProfile = authState.adminProfile
      const cashier = authState.cashier

      // Determine user info - prefer passed values, fallback to current session
      const userId = adminUser?.id || null
      const userEmail = adminUser?.email || adminProfile?.email || null
      const finalCashierId = cashierId || cashier?.id || null
      const finalCashierName = cashierName || cashier?.full_name || null

      const { error } = await supabase.from('audit_logs').insert({
        user_id: userId,
        user_email: userEmail,
        action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        old_values: oldValues,
        new_values: newValues,
        metadata,
        branch_id: branchId,
        branch_name: branchName,
        cashier_id: finalCashierId,
        cashier_name: finalCashierName,
      })
      if (error) console.warn('Audit log failed:', error.message)
    } catch (e) {
      console.warn('Audit log error:', e)
    }
  },

  // Fetch audit logs with pagination and filters
  fetchLogs: async ({ page = 1, limit = 50, entityType = null, action = null, branchId = null, startDate = null, endDate = null } = {}) => {
    set({ loading: true })
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1)

      if (entityType) query = query.eq('entity_type', entityType)
      if (action) query = query.eq('action', action)
      if (branchId) query = query.eq('branch_id', branchId)
      if (startDate) query = query.gte('created_at', startDate + 'T00:00:00')
      if (endDate) query = query.lte('created_at', endDate + 'T23:59:59')

      const { data, count, error } = await query
      if (error) throw error
      set({ logs: data || [], totalCount: count || 0, loading: false })
    } catch (e) {
      console.error('Failed to fetch audit logs:', e)
      set({ logs: [], loading: false })
    }
  },
}))

// Helper function for easy logging (can be imported directly)
export const logAudit = async (action, entityType, description, options = {}) => {
  const store = useAuditStore.getState()
  await store.logAction({
    action,
    entityType,
    description,
    ...options,
  })
}
