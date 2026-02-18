import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { useAuditStore } from './auditStore'

// Track initialization outside of store to avoid any persist/hydration issues
let _initStarted = false

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // Auth mode: 'none' | 'admin' | 'cashier'
      mode: 'none',
      // Admin (Supabase auth)
      adminUser: null,
      adminProfile: null,
      // Cashier (QR/PIN auth)
      cashier: null,
      attendanceId: null,
      // UI state
      loading: true,
      error: null,

      initialize: async () => {
        // StrictMode calls this twice. Only first call should run.
        // Using module-level flag so it's never affected by hydration or state merging.
        if (_initStarted) return
        _initStarted = true

        // Safety timeout — if getSession() hangs, force loading off after 5s
        const safetyTimer = setTimeout(() => {
          if (get().loading) {
            console.warn('Auth init timed out, forcing loading false')
            set({ loading: false })
          }
        }, 5000)

        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            const newMode = get().cashier ? 'cashier' : 'admin'
            // Single atomic set — auth data + loading in one call
            set({ adminUser: session.user, adminProfile: profile, mode: newMode, loading: false })
          } else {
            // No session — clear admin mode, keep cashier if active
            set({ mode: get().cashier ? 'cashier' : 'none', loading: false })
          }

          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
              set({ adminUser: null, adminProfile: null, mode: 'none', cashier: null, attendanceId: null })
            } else if (event === 'SIGNED_IN' && session?.user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single()
              set({ adminUser: session.user, adminProfile: profile, mode: 'admin' })
            }
          })
        } catch (error) {
          console.error('Auth initialization error:', error)
          set({ error: error.message, loading: false })
        } finally {
          clearTimeout(safetyTimer)
        }
      },

      // Admin login (email + password)
      adminSignIn: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          if (error) throw error
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single()
          set({ adminUser: data.user, adminProfile: profile, mode: 'admin', loading: false })
          useAuditStore.getState().logAction({
            action: 'login',
            entityType: 'auth',
            description: `Admin login: ${email}`,
          })
          return { success: true }
        } catch (error) {
          set({ error: error.message, loading: false })
          return { success: false, error: error.message }
        }
      },

      // Cashier login via QR token
      cashierLoginByToken: async (token) => {
        set({ loading: true, error: null })
        try {
          const { data, error } = await supabase
            .from('cashiers')
            .select('*, branches(name)')
            .eq('qr_token', token)
            .eq('is_active', true)
            .single()
          if (error || !data) throw new Error('Invalid QR code or inactive cashier')

          const { data: att } = await supabase
            .from('attendance')
            .insert({
              cashier_id: data.id,
              branch_id: data.branch_id || null,
              shift_date: new Date().toISOString().split('T')[0],
              check_in: new Date().toISOString(),
            })
            .select()
            .single()

          set({
            cashier: data,
            attendanceId: att?.id || null,
            mode: 'cashier',
            loading: false,
          })
          useAuditStore.getState().logAction({
            action: 'login',
            entityType: 'auth',
            description: `Cashier check-in: ${data.full_name}`,
            cashierId: data.id,
            cashierName: data.full_name,
            branchId: data.branch_id,
            branchName: data.branches?.name,
          })
          return { success: true, cashier: data }
        } catch (error) {
          set({ error: error.message, loading: false })
          return { success: false, error: error.message }
        }
      },

      // Cashier check-out (end shift)
      cashierCheckOut: async () => {
        const { attendanceId, cashier } = get()
        if (attendanceId) {
          await supabase
            .from('attendance')
            .update({ check_out: new Date().toISOString(), status: 'checked_out' })
            .eq('id', attendanceId)
        }
        if (cashier) {
          useAuditStore.getState().logAction({
            action: 'checkout',
            entityType: 'auth',
            description: `Cashier check-out: ${cashier.full_name}`,
            cashierId: cashier.id,
            cashierName: cashier.full_name,
            branchId: cashier.branch_id,
            branchName: cashier.branches?.name,
          })
        }
        set({ cashier: null, attendanceId: null, mode: get().adminUser ? 'admin' : 'none' })
      },

      // Switch from cashier mode back to admin
      switchToAdmin: async () => {
        const { attendanceId } = get()
        if (attendanceId) {
          await supabase
            .from('attendance')
            .update({ check_out: new Date().toISOString(), status: 'checked_out' })
            .eq('id', attendanceId)
        }
        set({ cashier: null, attendanceId: null, mode: 'admin' })
      },

      // Full sign out
      signOut: async () => {
        const { attendanceId } = get()
        if (attendanceId) {
          await supabase
            .from('attendance')
            .update({ check_out: new Date().toISOString(), status: 'checked_out' })
            .eq('id', attendanceId)
        }
        await supabase.auth.signOut()
        set({ adminUser: null, adminProfile: null, cashier: null, attendanceId: null, mode: 'none' })
      },

      clearError: () => set({ error: null }),

      isAdmin: () => get().mode === 'admin' && get().adminUser,
      isCashier: () => get().mode === 'cashier' && get().cashier,
    }),
    {
      name: 'macky-pos-auth',
      partialize: (state) => ({
        cashier: state.cashier,
        attendanceId: state.attendanceId,
        mode: state.mode,
      }),
    }
  )
)
