import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { getShiftsForBranch, formatShiftTime } from '../utils/shiftConfig'
import { ensureCurrentShiftSnapshots, updateShiftReadings } from '../services/shiftService'
import { format } from 'date-fns'
import { FileText, Printer, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AccountabilityReport() {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { branches, selectedBranchId } = useBranchStore()
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedShift, setSelectedShift] = useState(1)
  const [loading, setLoading] = useState(true)
  const printRef = useRef(null)

  // Get branch-specific shifts
  const selectedBranch = branches.find(b => b.id === selectedBranchId)
  const SHIFTS = useMemo(() => getShiftsForBranch(selectedBranch?.name), [selectedBranch?.name])

  // Data states
  const [fuelReadings, setFuelReadings] = useState([])
  const [cashSales, setCashSales] = useState([])
  const [chargeInvoices, setChargeInvoices] = useState([])
  const [calibrations, setCalibrations] = useState([])
  const [deposits, setDeposits] = useState([])
  const [checks, setChecks] = useState([])
  const [expenses, setExpenses] = useState([])
  const [purchases, setPurchases] = useState([])
  const [productSales, setProductSales] = useState({ oil_lubes: 0, accessories: 0, services: 0, miscellaneous: 0 })
  const [fuelDeliveries, setFuelDeliveries] = useState([])

  useEffect(() => { fetchFuelTypes() }, [])
  useEffect(() => { 
    if (fuelTypes.length > 0) {
      fetchAllData() 
    }
  }, [reportDate, selectedShift, selectedBranchId, fuelTypes])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const [y, m, d] = reportDate.split('-').map(Number)
      const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
      const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()

      // Fetch all pumps (has current_reading — the always-correct meter value)
      let pumpsQ = supabase.from('pumps').select('*').eq('is_active', true)
      if (selectedBranchId) pumpsQ = pumpsQ.eq('branch_id', selectedBranchId)

      // Fetch ALL sales for the entire day — we filter by shift in JS
      let salesQ = supabase.from('cash_sales').select('*').gte('created_at', start).lte('created_at', end)
      if (selectedBranchId) salesQ = salesQ.eq('branch_id', selectedBranchId)

      let ciQ = supabase.from('purchase_orders').select('*, fuel_types(short_code), cashiers(full_name)').gte('created_at', start).lte('created_at', end)
      if (selectedBranchId) ciQ = ciQ.eq('branch_id', selectedBranchId)

      // Fetch ALL sales from AFTER the selected shift end until now
      // This is needed to compute: ending_reading = current_reading - liters_after_this_shift
      const shiftConfig = SHIFTS.find(s => s.number === selectedShift)
      let afterShiftSalesQ = null
      let afterShiftPOsQ = null
      let afterShiftCalsQ = null
      if (shiftConfig) {
        const parseHour = (timeStr) => {
          const [time, period] = timeStr.split(' ')
          let [h] = time.split(':').map(Number)
          if (period === 'PM' && h !== 12) h += 12
          if (period === 'AM' && h === 12) h = 0
          return h
        }
        const endH = parseHour(shiftConfig.endTime)
        // Shift end timestamp
        let shiftEndDate
        if (endH < parseHour(shiftConfig.startTime)) {
          // Crosses midnight — end is next day
          shiftEndDate = new Date(y, m - 1, d + 1, endH, 0, 0, 0)
        } else {
          shiftEndDate = new Date(y, m - 1, d, endH, 0, 0, 0)
        }
        const shiftEndISO = shiftEndDate.toISOString()

        afterShiftSalesQ = supabase.from('cash_sales').select('pump_id, liters').gte('created_at', shiftEndISO)
        if (selectedBranchId) afterShiftSalesQ = afterShiftSalesQ.eq('branch_id', selectedBranchId)

        afterShiftPOsQ = supabase.from('purchase_orders').select('pump_id, liters').gte('created_at', shiftEndISO)
        if (selectedBranchId) afterShiftPOsQ = afterShiftPOsQ.eq('branch_id', selectedBranchId)

        afterShiftCalsQ = supabase.from('pump_calibrations').select('pump_id, liters').gte('created_at', shiftEndISO)
        if (selectedBranchId) afterShiftCalsQ = afterShiftCalsQ.eq('branch_id', selectedBranchId)
      }

      let depQ = supabase.from('cash_deposits').select('*, cashiers(full_name)').gte('created_at', start).lte('created_at', end)
      if (selectedBranchId) depQ = depQ.eq('branch_id', selectedBranchId)

      let withQ = supabase.from('cash_withdrawals').select('*, cashiers(full_name)').gte('created_at', start).lte('created_at', end)
      if (selectedBranchId) withQ = withQ.eq('branch_id', selectedBranchId)

      let chkQ = supabase.from('checks').select('*').eq('shift_date', reportDate).eq('shift_number', selectedShift)
      if (selectedBranchId) chkQ = chkQ.eq('branch_id', selectedBranchId)

      let expQ = supabase.from('expenses').select('*').eq('shift_date', reportDate).eq('shift_number', selectedShift)
      if (selectedBranchId) expQ = expQ.eq('branch_id', selectedBranchId)

      let purQ = supabase.from('purchases_disbursements').select('*').eq('shift_date', reportDate).eq('shift_number', selectedShift)
      if (selectedBranchId) purQ = purQ.eq('branch_id', selectedBranchId)

      let calQ = supabase.from('pump_calibrations').select('*, pumps(pump_name, fuel_type)').eq('shift_date', reportDate).eq('shift_number', selectedShift)
      if (selectedBranchId) calQ = calQ.eq('branch_id', selectedBranchId)

      let delQ = supabase.from('fuel_deliveries').select('*, fuel_tanks(tank_name, fuel_type_id, fuel_types(name, short_code))').eq('delivery_date', reportDate)
      if (selectedBranchId) delQ = delQ.eq('branch_id', selectedBranchId)

      // Build all promises
      const promises = [pumpsQ, salesQ, ciQ, depQ, withQ, chkQ, expQ, purQ, calQ, delQ]
      if (afterShiftSalesQ) promises.push(afterShiftSalesQ, afterShiftPOsQ, afterShiftCalsQ)

      const results = await Promise.all(promises)
      const pumpsData = results[0].data
      const allDaySales = results[1].data
      const allDayCi = results[2].data
      const allDayDep = results[3].data
      const allDayWith = results[4].data
      const chk = results[5].data
      const exp = results[6].data
      const pur = results[7].data
      const cal = results[8].data
      const fuelDeliveries = results[9].data
      const afterSales = results[10]?.data || []
      const afterPOs = results[11]?.data || []
      const afterCals = results[12]?.data || []

      // Filter day's data by shift
      const filterByShift = (items) => {
        if (!items || items.length === 0) return []
        const byCol = items.filter(i => i.shift_number === selectedShift && i.shift_date === reportDate)
        if (byCol.length > 0) return byCol
        if (!shiftConfig) return items
        const parseHour = (timeStr) => {
          const [time, period] = timeStr.split(' ')
          let [h] = time.split(':').map(Number)
          if (period === 'PM' && h !== 12) h += 12
          if (period === 'AM' && h === 12) h = 0
          return h
        }
        const startH = parseHour(shiftConfig.startTime)
        const endH = parseHour(shiftConfig.endTime)
        return items.filter(item => {
          const ts = item.created_at || item.deposit_date || item.withdrawal_date
          if (!ts) return false
          const hour = new Date(ts).getHours()
          if (endH <= startH) return hour >= startH || hour < endH
          return hour >= startH && hour < endH
        })
      }

      const sales = filterByShift(allDaySales)
      const ci = filterByShift(allDayCi)
      const dep = filterByShift(allDayDep)
      const withdrawalsData = filterByShift(allDayWith)

      // Per-pump liters THIS shift (from sales)
      const pumpLitersMap = {}
      ;(sales || []).forEach(s => {
        if (!s.pump_id || !s.liters) return
        pumpLitersMap[s.pump_id] = (pumpLitersMap[s.pump_id] || 0) + parseFloat(s.liters)
      })
      ;(ci || []).forEach(po => {
        if (!po.pump_id || !po.liters) return
        pumpLitersMap[po.pump_id] = (pumpLitersMap[po.pump_id] || 0) + parseFloat(po.liters)
      })

      // Per-pump liters AFTER this shift (to compute ending reading)
      const afterLitersMap = {}
      ;[...afterSales, ...afterPOs, ...afterCals].forEach(s => {
        if (!s.pump_id || !s.liters) return
        afterLitersMap[s.pump_id] = (afterLitersMap[s.pump_id] || 0) + parseFloat(s.liters)
      })

      // Build readings: ending = current_reading - after_liters, beginning = ending - this_shift_liters
      const readingsArray = (pumpsData || [])
        .sort((a, b) => {
          if ((a.pump_number || 0) !== (b.pump_number || 0)) return (a.pump_number || 0) - (b.pump_number || 0)
          return (a.pump_name || '').localeCompare(b.pump_name || '')
        })
        .map(pump => {
          const currentReading = parseFloat(pump.current_reading || 0)
          const litersThisShift = pumpLitersMap[pump.id] || 0
          const litersAfter = afterLitersMap[pump.id] || 0
          const endingReading = currentReading - litersAfter
          const beginningReading = endingReading - litersThisShift
          return {
            pump_id: pump.id,
            pump_name: pump.pump_name,
            pump_number: pump.pump_number,
            fuel_type: pump.fuel_type,
            category: pump.category || 'regular',
            short_code: pump.pump_name,
            beginning_reading: beginningReading,
            ending_reading: endingReading,
            liters_dispensed: litersThisShift,
            adjustment_liters: 0,
            price_per_liter: parseFloat(pump.price_per_liter || 0),
          }
        })

      setFuelReadings(readingsArray)
      setFuelDeliveries(fuelDeliveries || [])
      setCashSales(sales || [])
      setChargeInvoices(ci || [])
      setCalibrations(cal || [])
      setDeposits(dep || [])
      setChecks(chk || [])
      setExpenses(exp || [])
      setPurchases(pur || [])
    } catch (err) {
      console.error('AccountabilityReport fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate totals
  const getFuelReading = (fuelId, category = 'regular') => 
    fuelReadings.find(r => r.fuel_type_id === fuelId && r.category === category)
  
  // Calculate total fuel sales using price_per_liter from pump readings
  const baseFuelSales = fuelReadings.reduce((s, r) => {
    const liters = parseFloat(r.liters_dispensed || 0)
    const price = parseFloat(r.price_per_liter || 0)
    return s + (liters * price)
  }, 0)
  const totalOilLubes = productSales.oil_lubes
  const totalAccessories = productSales.accessories
  const totalServices = productSales.services
  const totalMiscellaneous = productSales.miscellaneous
  const totalChargeInvoices = chargeInvoices.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
  const totalDeposits = deposits.reduce((s, d) => s + parseFloat(d.amount || 0), 0)
  const totalCashDeposit = totalDeposits
  const totalGcash = 0
  const totalChecks = checks.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const totalPurchases = purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const totalCalibrations = calibrations.reduce((s, c) => s + parseFloat(c.amount || (c.liters * c.price_per_liter) || 0), 0)
  const totalCalibrationLiters = calibrations.reduce((s, c) => s + parseFloat(c.liters || 0), 0)

  // Per-product summary (group all nozzles by fuel type)
  const productSummary = useMemo(() => {
    const summary = {}
    fuelReadings.forEach(r => {
      const ft = r.fuel_type
      if (!summary[ft]) {
        summary[ft] = { fuel_type: ft, total_liters: 0, total_amount: 0, price_per_liter: parseFloat(r.price_per_liter || 0) }
      }
      summary[ft].total_liters += parseFloat(r.liters_dispensed || 0)
      summary[ft].total_amount += parseFloat(r.liters_dispensed || 0) * parseFloat(r.price_per_liter || 0)
    })
    // Add delivery liters per product
    fuelDeliveries.forEach(d => {
      const ftName = d.fuel_tanks?.fuel_types?.name
      if (ftName && summary[ftName]) {
        if (!summary[ftName].delivery_liters) summary[ftName].delivery_liters = 0
        summary[ftName].delivery_liters += parseFloat(d.actual_received || (d.closing_dip_reading - d.opening_dip_reading) || 0)
      }
    })
    return Object.values(summary)
  }, [fuelReadings, fuelDeliveries])

  // Total fuel includes calibration to show accurate pump reading
  const totalFuelSales = baseFuelSales + totalCalibrations
  
  // Total accountability includes calibration, then we deduct it at the end
  const totalAccountability = totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous
  const netAccountability = totalAccountability - totalCalibrations
  const totalRemittance = totalDeposits + totalChecks
  const shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases - totalCalibrations)

  const handlePrint = () => {
    const printContent = printRef.current
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Daily Accountability Report - ${reportDate}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
            .header { margin-bottom: 20px; }
            .header > div:first-child { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 8px; }
            .header img { width: 64px; height: 64px; object-fit: contain; }
            .header h1 { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
            .header p { font-size: 10px; color: #666; }
            .header h2 { font-size: 14px; font-weight: bold; text-align: center; margin-top: 12px; }
            .meta { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 15px; }
            .meta-item { border: 1px solid #000; padding: 4px 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .section-title { font-weight: bold; margin: 15px 0 5px; }
            .total-row { background: #f9f9f9; font-weight: bold; }
            .summary-box { border: 2px solid #000; padding: 8px; margin: 10px 0; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'All Branches'

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Accountability Report</h1>
          <p className="text-gray-500 text-sm">Generate and print accountability reports</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAllData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Printer size={14} /> Print Report
          </button>
        </div>
      </div>

      {/* Date & Shift Selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Shift</label>
            <div className="flex gap-1">
              {SHIFTS.map(s => (
                <button key={s.number}
                  onClick={() => setSelectedShift(s.number)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedShift === s.number 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Printable Report */}
      <div ref={printRef} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 print:shadow-none print:border-0">
        {/* Header */}
        <div className="header mb-6">
          <div className="flex items-center justify-center gap-4 mb-2">
            <img src="/logo.png" alt="Macky Oil & Gas" className="w-16 h-16 object-contain" />
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wide">MACKY OIL&GAS</h1>
              <p className="text-xs text-gray-600">Lower Sosohon, Manolo Fortich, Bukidnon</p>
            </div>
          </div>
          <h2 className="text-lg font-bold text-center mt-3">DAILY ACCOUNTABILITY REPORT</h2>
        </div>

        {/* Date/Shift Meta */}
        <div className="flex justify-end gap-4 mb-4">
          <div className="border border-gray-300 px-3 py-1 text-sm">
            <span className="font-medium">DATE:</span> {format(new Date(reportDate), 'MM-dd-yy')}
          </div>
          <div className="border border-gray-300 px-3 py-1 text-sm">
            <span className="font-medium">SHIFT:</span> {SHIFTS.find(s => s.number === selectedShift)?.label}
          </div>
        </div>

        {/* Fuel Sales Table */}
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left whitespace-nowrap">FUEL SALES</th>
              {fuelReadings.map((r, idx) => (
                <th key={idx} className="border border-gray-300 p-2 text-center whitespace-nowrap text-[10px]">{r.short_code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">BEG. READING</td>
              {fuelReadings.map((r, idx) => (
                <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.beginning_reading ? parseFloat(r.beginning_reading).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">END READING</td>
              {fuelReadings.map((r, idx) => (
                <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.ending_reading ? parseFloat(r.ending_reading).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">GROSS</td>
              {fuelReadings.map((r, idx) => (
                <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.liters_dispensed ? parseFloat(r.liters_dispensed).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">Less: Adjustment</td>
              {fuelReadings.map((r, idx) => (
                <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.adjustment_liters ? parseFloat(r.adjustment_liters).toFixed(2) : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">NET READING</td>
              {fuelReadings.map((r, idx) => {
                const net = r ? (parseFloat(r.liters_dispensed || 0) - parseFloat(r.adjustment_liters || 0)) : null
                return <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {net !== null ? net.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">PRICE / LITER</td>
              {fuelReadings.map((r, idx) => (
                <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.price_per_liter ? parseFloat(r.price_per_liter).toFixed(2) : '—'}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-50 font-bold">
              <td className="border border-gray-300 p-2">TOTAL FUEL</td>
              {fuelReadings.map((r, idx) => {
                const baseValue = r ? (parseFloat(r.liters_dispensed || 0) * parseFloat(r.price_per_liter || 0)) : 0
                // Add calibration amount for this specific pump
                const pumpCalibrations = calibrations.filter(c => c.pumps?.pump_name === r?.pump_name)
                const calibrationValue = pumpCalibrations.reduce((s, c) => s + parseFloat(c.amount || (c.liters * c.price_per_liter) || 0), 0)
                const totalValue = baseValue + calibrationValue
                return <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                  {totalValue > 0 ? totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
          </tbody>
        </table>
        </div>

        {/* Total Fuel Summary */}
        <div className="flex justify-end mb-4">
          <div className="border-2 border-gray-400 px-4 py-2">
            <span className="font-bold">TOTAL FUEL: </span>
            <span className="font-mono font-bold">Php {totalFuelSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Tank Dipping / Per-Product Summary */}
        {productSummary.length > 0 && (
          <div className="mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-blue-50">
                  <th className="border border-gray-300 p-2 text-left">PRODUCT SUMMARY (TANK DIPPING)</th>
                  {productSummary.map((ps, idx) => (
                    <th key={idx} className="border border-gray-300 p-2 text-center">{ps.fuel_type}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 p-2 font-medium">Total Liters Sold (All Nozzles)</td>
                  {productSummary.map((ps, idx) => (
                    <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                      {ps.total_liters.toLocaleString('en-PH', { minimumFractionDigits: 3 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 font-medium">Fuel Delivery Received</td>
                  {productSummary.map((ps, idx) => (
                    <td key={idx} className="border border-gray-300 p-2 text-right font-mono text-green-600">
                      {ps.delivery_liters ? `+${ps.delivery_liters.toLocaleString('en-PH', { minimumFractionDigits: 3 })}` : '—'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-blue-50 font-bold">
                  <td className="border border-gray-300 p-2">Net Tank Consumption</td>
                  {productSummary.map((ps, idx) => {
                    const net = ps.total_liters - (ps.delivery_liters || 0)
                    return (
                      <td key={idx} className="border border-gray-300 p-2 text-right font-mono">
                        {net.toLocaleString('en-PH', { minimumFractionDigits: 3 })}
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td className="border border-gray-300 p-2 font-medium">Total Amount</td>
                  {productSummary.map((ps, idx) => (
                    <td key={idx} className="border border-gray-300 p-2 text-right font-mono font-bold">
                      ₱{ps.total_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Other Sales */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                <tr><td className="border border-gray-300 p-2 font-medium">TOTAL OIL / LUBES</td><td className="border border-gray-300 p-2 text-right font-mono">{totalOilLubes.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">ACCESSORIES</td><td className="border border-gray-300 p-2 text-right font-mono">{totalAccessories.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">SERVICES</td><td className="border border-gray-300 p-2 text-right font-mono">{totalServices.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">A/R COLLECTIONS</td><td className="border border-gray-300 p-2 text-right font-mono">—</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">MISCELLANEOUS</td><td className="border border-gray-300 p-2 text-right font-mono">{totalMiscellaneous.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">OTHER INCOME</td><td className="border border-gray-300 p-2 text-right font-mono">—</td></tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-start justify-end">
            <div className="border-2 border-gray-400 px-4 py-2">
              <span className="font-bold">= </span>
              <span className="font-mono font-bold">{(totalOilLubes + totalAccessories + totalServices + totalMiscellaneous).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Calibration (if exists) - deducted from total */}
        {totalCalibrations > 0 && (
          <div className="flex justify-end mb-2">
            <div className="border-2 border-pink-300 px-6 py-2 bg-pink-50">
              <span className="font-bold text-sm text-pink-700">LESS: CALIBRATION ({totalCalibrationLiters.toFixed(2)}L): </span>
              <span className="font-mono font-bold text-lg text-pink-700">₱{totalCalibrations.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Total Accountability */}
        <div className="flex justify-end mb-6">
          <div className="border-2 border-gray-800 px-6 py-3 bg-gray-50">
            <span className="font-bold text-sm">TOTAL ACCOUNTABILITY: </span>
            <span className="font-mono font-bold text-lg">₱{netAccountability.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Vault Deposits */}
        <div className="mb-4">
          <p className="font-bold text-sm mb-2">VAULT DEPOSITS</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">#</th>
                <th className="border border-gray-300 p-2 text-left">CASHIER</th>
                <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                <th className="border border-gray-300 p-2 text-left">NOTES</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length === 0 ? (
                <tr><td colSpan={4} className="border border-gray-300 p-2 text-center text-gray-400">No vault deposits this shift</td></tr>
              ) : deposits.map((dep, idx) => (
                <tr key={dep.id}>
                  <td className="border border-gray-300 p-2">{idx + 1}</td>
                  <td className="border border-gray-300 p-2">{dep.cashiers?.full_name || '—'}</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(dep.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 p-2 text-xs">{dep.notes || ''}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td colSpan={2} className="border border-gray-300 p-2 text-right">TOTAL VAULT DEPOSITS</td>
                <td className="border border-gray-300 p-2 text-right font-mono">{totalDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                <td className="border border-gray-300 p-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Deposit Totals */}
        <div className="flex justify-end gap-4 mb-4">
          <div className="border border-gray-300 px-3 py-2 text-sm">
            <span className="font-medium">A. TOTAL CASH DEPOSIT:</span>
            <span className="font-mono font-bold ml-2">{totalCashDeposit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="border border-gray-300 px-3 py-2 text-sm">
            <span className="font-medium">B. TOTAL CASH REGISTER:</span>
            <span className="font-mono font-bold ml-2">{totalGcash.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Checks */}
        <div className="mb-4">
          <p className="font-bold text-sm mb-2">BREAKDOWN OF CHECKS</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">BANK</th>
                <th className="border border-gray-300 p-2 text-left">DATE</th>
                <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                <th className="border border-gray-300 p-2 text-left">CUSTOMER</th>
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 ? (
                <tr><td colSpan={4} className="border border-gray-300 p-2 text-center text-gray-400">No checks</td></tr>
              ) : checks.map(c => (
                <tr key={c.id}>
                  <td className="border border-gray-300 p-2">{c.bank}</td>
                  <td className="border border-gray-300 p-2">{c.check_date ? format(new Date(c.check_date), 'MM/dd/yy') : ''}</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(c.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="border border-gray-300 p-2">{c.customer_name}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td colSpan={2} className="border border-gray-300 p-2 text-right">C. TOTAL CHECKS</td>
                <td className="border border-gray-300 p-2 text-right font-mono">{totalChecks.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                <td className="border border-gray-300 p-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                <tr><td className="border border-gray-300 p-2 font-medium">D. CHARGE INVOICES</td><td className="border border-gray-300 p-2 text-right font-mono font-bold">{totalChargeInvoices.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">E. EXPENSES</td><td className="border border-gray-300 p-2 text-right font-mono">{totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">F. PURCHASE / DISBURSEMENTS</td><td className="border border-gray-300 p-2 text-right font-mono">{totalPurchases.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                {totalCalibrations > 0 && (
                  <tr className="bg-pink-50"><td className="border border-gray-300 p-2 font-medium text-pink-700">G. CALIBRATION ({totalCalibrationLiters.toFixed(2)}L)</td><td className="border border-gray-300 p-2 text-right font-mono text-pink-700">{totalCalibrations.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                <tr><td className="border border-gray-300 p-2 font-medium">Total Remittance:</td><td className="border border-gray-300 p-2 text-right font-mono font-bold">{totalRemittance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">Short/Over:</td><td className="border border-gray-300 p-2 text-right font-mono">{shortOver.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">Total Sales:</td><td className="border border-gray-300 p-2 text-right font-mono font-bold">{netAccountability.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Page 2: Charge Invoices */}
        <div className="border-t-2 border-gray-300 pt-6 mt-6">
          <div className="flex justify-end mb-4">
            <div className="border border-gray-300 px-3 py-1 text-sm">
              <span className="font-medium">DATE:</span> {format(new Date(reportDate), 'MM-dd-yy')}
            </div>
          </div>

          <p className="font-bold text-sm mb-2">A. SUMMARY OF CHARGE INVOICES</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">C.I NO.</th>
                  <th className="border border-gray-300 p-2 text-left">CUSTOMER</th>
                  <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {chargeInvoices.slice(0, 15).map((ci, i) => (
                  <tr key={ci.id}>
                    <td className="border border-gray-300 p-2">{ci.po_number || ''}</td>
                    <td className="border border-gray-300 p-2">{ci.customer_name} {ci.fuel_types?.short_code ? `(${ci.fuel_types.short_code})` : ''}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(ci.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {chargeInvoices.length < 15 && Array(15 - chargeInvoices.length).fill(0).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td className="border border-gray-300 p-2">&nbsp;</td>
                    <td className="border border-gray-300 p-2"></td>
                    <td className="border border-gray-300 p-2"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={2} className="border border-gray-300 p-2 text-right">SUBTOTAL</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{chargeInvoices.slice(0, 15).reduce((s, c) => s + parseFloat(c.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">C.I NO.</th>
                  <th className="border border-gray-300 p-2 text-left">CUSTOMER</th>
                  <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {chargeInvoices.slice(15, 30).map((ci, i) => (
                  <tr key={ci.id}>
                    <td className="border border-gray-300 p-2">{ci.po_number || ''}</td>
                    <td className="border border-gray-300 p-2">{ci.customer_name} {ci.fuel_types?.short_code ? `(${ci.fuel_types.short_code})` : ''}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(ci.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {chargeInvoices.length < 30 && Array(Math.max(0, 15 - chargeInvoices.slice(15).length)).fill(0).map((_, i) => (
                  <tr key={`empty2-${i}`}>
                    <td className="border border-gray-300 p-2">&nbsp;</td>
                    <td className="border border-gray-300 p-2"></td>
                    <td className="border border-gray-300 p-2"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={2} className="border border-gray-300 p-2 text-right">SUBTOTAL</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{chargeInvoices.slice(15, 30).reduce((s, c) => s + parseFloat(c.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grand Total Charge Invoices */}
          <div className="flex justify-center mb-6">
            <div className="border-2 border-gray-800 px-6 py-2">
              <span className="font-mono font-bold text-lg">{totalChargeInvoices.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Expenses */}
          <p className="font-bold text-sm mb-2">C. EXPENSES</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">NATURE</th>
                  <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 8).map(e => (
                  <tr key={e.id}>
                    <td className="border border-gray-300 p-2">{e.nature}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(e.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {expenses.length < 8 && Array(8 - expenses.length).fill(0).map((_, i) => (
                  <tr key={`exp-empty-${i}`}>
                    <td className="border border-gray-300 p-2">&nbsp;</td>
                    <td className="border border-gray-300 p-2"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-2 text-right">SUBTOTAL</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{expenses.slice(0, 8).reduce((s, e) => s + parseFloat(e.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">NATURE</th>
                  <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(8, 16).map(e => (
                  <tr key={e.id}>
                    <td className="border border-gray-300 p-2">{e.nature}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(e.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {Array(Math.max(0, 8 - expenses.slice(8).length)).fill(0).map((_, i) => (
                  <tr key={`exp-empty2-${i}`}>
                    <td className="border border-gray-300 p-2">&nbsp;</td>
                    <td className="border border-gray-300 p-2"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-2 text-right">SUBTOTAL</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{expenses.slice(8, 16).reduce((s, e) => s + parseFloat(e.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Purchases/Disbursements */}
          <p className="font-bold text-sm mb-2">D. PURCHASES/DISBURSEMENTS</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">PARTICULARS</th>
                  <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {purchases.slice(0, 6).map(p => (
                  <tr key={p.id}>
                    <td className="border border-gray-300 p-2">{p.particulars}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(p.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {purchases.length < 6 && Array(6 - purchases.length).fill(0).map((_, i) => (
                  <tr key={`pur-empty-${i}`}>
                    <td className="border border-gray-300 p-2">&nbsp;</td>
                    <td className="border border-gray-300 p-2"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-2 text-right">SUBTOTAL</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{purchases.slice(0, 6).reduce((s, p) => s + parseFloat(p.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left">PARTICULARS</th>
                  <th className="border border-gray-300 p-2 text-right">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {purchases.slice(6, 12).map(p => (
                  <tr key={p.id}>
                    <td className="border border-gray-300 p-2">{p.particulars}</td>
                    <td className="border border-gray-300 p-2 text-right font-mono">{parseFloat(p.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                {Array(Math.max(0, 6 - purchases.slice(6).length)).fill(0).map((_, i) => (
                  <tr key={`pur-empty2-${i}`}>
                    <td className="border border-gray-300 p-2">&nbsp;</td>
                    <td className="border border-gray-300 p-2"></td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-2 text-right">SUBTOTAL</td>
                  <td className="border border-gray-300 p-2 text-right font-mono">{purchases.slice(6, 12).reduce((s, p) => s + parseFloat(p.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
