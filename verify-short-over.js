import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://obinxgdqklzwhhjkzpxu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaW54Z2Rxa2x6d2hoamt6cHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3MjU5NzcsImV4cCI6MjA1MTMwMTk3N30.sb_publishable_2KoBImVRHuoQ2GWmfMVWow_CzoMcVte'

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyShortOver() {
  console.log('🔍 Verifying Short/Over Calculation for Baslingasag, May 1, 2026, Shift 3\n')

  try {
    // Get branch ID for Baslingasag
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .ilike('name', '%baslingasag%')
    
    if (!branches || branches.length === 0) {
      console.error('❌ Branch "Baslingasag" not found')
      return
    }

    const branchId = branches[0].id
    console.log(`✅ Found branch: ${branches[0].name} (ID: ${branchId})`)

    const reportDate = '2026-05-01'
    const selectedShift = 3

    // Date range for the day
    const start = new Date(2026, 4, 1, 0, 0, 0, 0).toISOString()
    const end = new Date(2026, 4, 1, 23, 59, 59, 999).toISOString()

    console.log(`📅 Date: ${reportDate}, Shift: ${selectedShift}\n`)

    // Fetch all data needed for calculation
    const [
      { data: pumpsData },
      { data: allDaySales },
      { data: allDayCi },
      { data: allDayDep },
      { data: allDayWith },
      { data: chk },
      { data: pur },
      { data: cal }
    ] = await Promise.all([
      supabase.from('pumps').select('*').eq('is_active', true).eq('branch_id', branchId),
      supabase.from('cash_sales').select('*').gte('created_at', start).lte('created_at', end).eq('branch_id', branchId),
      supabase.from('purchase_orders').select('*, fuel_types(short_code), cashiers(full_name)').gte('created_at', start).lte('created_at', end).eq('branch_id', branchId),
      supabase.from('cash_deposits').select('*, cashiers(full_name)').gte('deposit_date', start).lte('deposit_date', end).eq('branch_id', branchId),
      supabase.from('cash_withdrawals').select('*, cashiers(full_name)').gte('withdrawal_date', start).lte('withdrawal_date', end).eq('branch_id', branchId),
      supabase.from('checks').select('*').eq('shift_date', reportDate).eq('shift_number', selectedShift).eq('branch_id', branchId),
      supabase.from('purchases_disbursements').select('*').eq('shift_date', reportDate).eq('shift_number', selectedShift).eq('branch_id', branchId),
      supabase.from('pump_calibrations').select('*, pumps(pump_name, fuel_type)').eq('shift_date', reportDate).eq('shift_number', selectedShift).eq('branch_id', branchId)
    ])

    // Filter by shift (simplified - using shift_number if available)
    const filterByShift = (items) => {
      if (!items || items.length === 0) return []
      return items.filter(i => i.shift_number === selectedShift && i.shift_date === reportDate)
    }

    const sales = filterByShift(allDaySales) || []
    const ci = filterByShift(allDayCi) || []
    const dep = filterByShift(allDayDep) || []
    const withdrawalsData = filterByShift(allDayWith) || []

    // Calculate fuel readings
    const pumpLitersMap = {}
    sales.forEach(s => {
      if (!s.pump_id || !s.liters) return
      pumpLitersMap[s.pump_id] = (pumpLitersMap[s.pump_id] || 0) + parseFloat(s.liters)
    })
    ci.forEach(po => {
      if (!po.pump_id || !po.liters) return
      pumpLitersMap[po.pump_id] = (pumpLitersMap[po.pump_id] || 0) + parseFloat(po.liters)
    })

    const fuelReadings = (pumpsData || []).map(pump => {
      const litersThisShift = pumpLitersMap[pump.id] || 0
      return {
        pump_id: pump.id,
        pump_name: pump.pump_name,
        liters_dispensed: litersThisShift,
        price_per_liter: parseFloat(pump.price_per_liter || 0),
      }
    })

    // Calculate totals
    const baseFuelSales = fuelReadings.reduce((s, r) => {
      const liters = parseFloat(r.liters_dispensed || 0)
      const price = parseFloat(r.price_per_liter || 0)
      return s + (liters * price)
    }, 0)

    const totalOilLubes = 0 // Not fetched in this script
    const totalAccessories = 0
    const totalServices = 0
    const totalMiscellaneous = 0
    const totalChargeInvoices = ci.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
    
    // Filter active deposits
    const activeDeposits = dep.filter(d => !d.is_deleted)
    const totalDeposits = activeDeposits.reduce((s, d) => s + parseFloat(d.amount || 0), 0)
    const totalWithdrawals = withdrawalsData.reduce((s, w) => s + parseFloat(w.amount || 0), 0)
    const totalChecks = (chk || []).reduce((s, c) => s + parseFloat(c.amount || 0), 0)
    const totalExpenses = totalWithdrawals
    const totalPurchases = (pur || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const totalCalibrations = (cal || []).reduce((s, c) => s + parseFloat(c.amount || (c.liters * c.price_per_liter) || 0), 0)

    const totalFuelSales = baseFuelSales + totalCalibrations
    const totalAccountability = totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous
    const netAccountability = totalAccountability - totalCalibrations
    const totalRemittance = totalDeposits + totalChecks

    console.log('📊 CALCULATED VALUES:')
    console.log('─────────────────────────────────────')
    console.log(`Total Accountability: ₱${totalAccountability.toFixed(2)}`)
    console.log(`Total Remittance:     ₱${totalRemittance.toFixed(2)}`)
    console.log(`Charge Invoices:      ₱${totalChargeInvoices.toFixed(2)}`)
    console.log(`Total Expenses:       ₱${totalExpenses.toFixed(2)}`)
    console.log(`Total Purchases:      ₱${totalPurchases.toFixed(2)}`)
    console.log(`Total Calibrations:   ₱${totalCalibrations.toFixed(2)}`)
    console.log()

    // CURRENT (BUGGY) FORMULA
    const currentShortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)
    
    // SIR MARK'S CORRECT FORMULA: =SUM(D71+D70)-D66
    // D71 = TOTAL REMITTANCE, D70 = CHARGE INVOICES, D66 = TOTAL ACCOUNTABILITY
    const correctShortOver = (totalRemittance + totalChargeInvoices) - totalAccountability

    console.log('🧮 SHORT/OVER CALCULATIONS:')
    console.log('─────────────────────────────────────')
    console.log('CURRENT (BUGGY) FORMULA:')
    console.log(`  shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)`)
    console.log(`  shortOver = ${totalRemittance.toFixed(2)} - (${totalAccountability.toFixed(2)} - ${totalChargeInvoices.toFixed(2)} - ${totalExpenses.toFixed(2)} - ${totalPurchases.toFixed(2)} - ${totalCalibrations.toFixed(2)})`)
    console.log(`  shortOver = ${currentShortOver.toFixed(2)} ❌`)
    console.log()
    console.log('SIR MARK\'S CORRECT FORMULA (Excel D72: =SUM(D71+D70)-D66):')
    console.log(`  shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability`)
    console.log(`  shortOver = (${totalRemittance.toFixed(2)} + ${totalChargeInvoices.toFixed(2)}) - ${totalAccountability.toFixed(2)}`)
    console.log(`  shortOver = ${correctShortOver.toFixed(2)} ✓`)
    console.log()
    console.log('📋 COMPARISON:')
    console.log('─────────────────────────────────────')
    console.log(`Excel Expected:  ₱0.56`)
    console.log(`Current System:  ₱${currentShortOver.toFixed(2)} ${Math.abs(currentShortOver - 0.56) < 0.01 ? '✅ MATCHES' : '❌ DOES NOT MATCH'}`)
    console.log(`Correct Formula: ₱${correctShortOver.toFixed(2)} ${Math.abs(correctShortOver - 0.56) < 0.01 ? '✅ MATCHES' : '❌ DOES NOT MATCH'}`)
    console.log()
    console.log(`Difference: ₱${Math.abs(currentShortOver - correctShortOver).toFixed(2)}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  }
}

verifyShortOver()
