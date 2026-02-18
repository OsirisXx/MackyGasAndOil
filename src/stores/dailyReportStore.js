import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useDailyReportStore = create((set, get) => ({
  currentReport: null,
  reports: [],
  fuelReadings: [],
  chargeInvoices: [],
  deposits: [],
  checks: [],
  expenses: [],
  purchases: [],
  productSales: [],
  loading: false,
  error: null,

  // Create or fetch daily report for a given date and shift
  fetchOrCreateReport: async (reportDate, shiftId, cashierId) => {
    set({ loading: true, error: null })
    try {
      // Try to find existing
      let { data, error } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('report_date', reportDate)
        .eq('shift_id', shiftId)
        .single()

      if (error && error.code === 'PGRST116') {
        // Not found, create new
        const { data: newReport, error: createError } = await supabase
          .from('daily_reports')
          .insert({ report_date: reportDate, shift_id: shiftId, cashier_id: cashierId })
          .select()
          .single()
        if (createError) throw createError
        data = newReport
      } else if (error) {
        throw error
      }

      set({ currentReport: data })
      // Load related data
      await get().fetchRelatedData(data.id)
      return data
    } catch (error) {
      set({ error: error.message })
      return null
    } finally {
      set({ loading: false })
    }
  },

  fetchReports: async (startDate, endDate) => {
    set({ loading: true })
    try {
      let query = supabase
        .from('daily_reports')
        .select('*, shifts(*)')
        .order('report_date', { ascending: false })

      if (startDate) query = query.gte('report_date', startDate)
      if (endDate) query = query.lte('report_date', endDate)

      const { data, error } = await query
      if (error) throw error
      set({ reports: data })
    } catch (error) {
      set({ error: error.message })
    } finally {
      set({ loading: false })
    }
  },

  fetchRelatedData: async (reportId) => {
    try {
      const [readings, invoices, deps, chks, exps, purch, prodSales] = await Promise.all([
        supabase.from('fuel_readings').select('*, fuel_types(*)').eq('daily_report_id', reportId),
        supabase.from('charge_invoices').select('*').eq('daily_report_id', reportId).order('created_at'),
        supabase.from('deposits').select('*').eq('daily_report_id', reportId).order('deposit_number'),
        supabase.from('checks').select('*').eq('daily_report_id', reportId),
        supabase.from('expenses').select('*').eq('daily_report_id', reportId),
        supabase.from('purchases_disbursements').select('*').eq('daily_report_id', reportId),
        supabase.from('product_sales').select('*').eq('daily_report_id', reportId),
      ])
      set({
        fuelReadings: readings.data || [],
        chargeInvoices: invoices.data || [],
        deposits: deps.data || [],
        checks: chks.data || [],
        expenses: exps.data || [],
        purchases: purch.data || [],
        productSales: prodSales.data || [],
      })
    } catch (error) {
      set({ error: error.message })
    }
  },

  // Update daily report totals
  updateReportTotals: async (reportId, totals) => {
    try {
      const { error } = await supabase
        .from('daily_reports')
        .update(totals)
        .eq('id', reportId)
      if (error) throw error
      set(state => ({
        currentReport: state.currentReport ? { ...state.currentReport, ...totals } : null
      }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Fuel Readings CRUD
  saveFuelReading: async (reading) => {
    try {
      const { data, error } = await supabase
        .from('fuel_readings')
        .upsert(reading, { onConflict: 'daily_report_id,fuel_type_id' })
        .select('*, fuel_types(*)')
        .single()
      if (error) throw error
      set(state => {
        const readings = [...state.fuelReadings]
        const idx = readings.findIndex(r => r.fuel_type_id === data.fuel_type_id)
        if (idx >= 0) readings[idx] = data
        else readings.push(data)
        return { fuelReadings: readings }
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Charge Invoices CRUD
  addChargeInvoice: async (invoice) => {
    try {
      const { data, error } = await supabase
        .from('charge_invoices')
        .insert(invoice)
        .select()
        .single()
      if (error) throw error
      set(state => ({ chargeInvoices: [...state.chargeInvoices, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteChargeInvoice: async (id) => {
    try {
      const { error } = await supabase.from('charge_invoices').delete().eq('id', id)
      if (error) throw error
      set(state => ({ chargeInvoices: state.chargeInvoices.filter(i => i.id !== id) }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Deposits CRUD
  addDeposit: async (deposit) => {
    try {
      const { data, error } = await supabase
        .from('deposits')
        .insert(deposit)
        .select()
        .single()
      if (error) throw error
      set(state => ({ deposits: [...state.deposits, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteDeposit: async (id) => {
    try {
      const { error } = await supabase.from('deposits').delete().eq('id', id)
      if (error) throw error
      set(state => ({ deposits: state.deposits.filter(d => d.id !== id) }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Checks CRUD
  addCheck: async (check) => {
    try {
      const { data, error } = await supabase.from('checks').insert(check).select().single()
      if (error) throw error
      set(state => ({ checks: [...state.checks, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteCheck: async (id) => {
    try {
      const { error } = await supabase.from('checks').delete().eq('id', id)
      if (error) throw error
      set(state => ({ checks: state.checks.filter(c => c.id !== id) }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Expenses CRUD
  addExpense: async (expense) => {
    try {
      const { data, error } = await supabase.from('expenses').insert(expense).select().single()
      if (error) throw error
      set(state => ({ expenses: [...state.expenses, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteExpense: async (id) => {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (error) throw error
      set(state => ({ expenses: state.expenses.filter(e => e.id !== id) }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Purchases/Disbursements CRUD
  addPurchase: async (purchase) => {
    try {
      const { data, error } = await supabase
        .from('purchases_disbursements')
        .insert(purchase)
        .select()
        .single()
      if (error) throw error
      set(state => ({ purchases: [...state.purchases, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deletePurchase: async (id) => {
    try {
      const { error } = await supabase.from('purchases_disbursements').delete().eq('id', id)
      if (error) throw error
      set(state => ({ purchases: state.purchases.filter(p => p.id !== id) }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  // Product Sales CRUD
  addProductSale: async (sale) => {
    try {
      const { data, error } = await supabase
        .from('product_sales')
        .insert(sale)
        .select()
        .single()
      if (error) throw error
      set(state => ({ productSales: [...state.productSales, data] }))
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  deleteProductSale: async (id) => {
    try {
      const { error } = await supabase.from('product_sales').delete().eq('id', id)
      if (error) throw error
      set(state => ({ productSales: state.productSales.filter(s => s.id !== id) }))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  clearCurrentReport: () => set({
    currentReport: null,
    fuelReadings: [],
    chargeInvoices: [],
    deposits: [],
    checks: [],
    expenses: [],
    purchases: [],
    productSales: [],
  }),
}))
