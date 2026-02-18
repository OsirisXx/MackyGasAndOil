import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { format } from 'date-fns'
import { FileText, Printer, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const SHIFTS = [
  { number: 1, label: '1st' },
  { number: 2, label: '2nd' },
  { number: 3, label: '3rd' },
]

export default function AccountabilityReport() {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { branches, selectedBranchId, initialized } = useBranchStore()
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedShift, setSelectedShift] = useState(1)
  const [loading, setLoading] = useState(true)
  const printRef = useRef(null)

  // Data states
  const [fuelReadings, setFuelReadings] = useState([])
  const [cashSales, setCashSales] = useState([])
  const [chargeInvoices, setChargeInvoices] = useState([])
  const [deposits, setDeposits] = useState([])
  const [checks, setChecks] = useState([])
  const [expenses, setExpenses] = useState([])
  const [purchases, setPurchases] = useState([])
  const [productSales, setProductSales] = useState({ oil_lubes: 0, accessories: 0, services: 0, miscellaneous: 0 })

  useEffect(() => { fetchFuelTypes() }, [])
  useEffect(() => { if (initialized) fetchAllData() }, [reportDate, selectedShift, selectedBranchId, initialized])

  const fetchAllData = async () => {
    setLoading(true)
    const start = reportDate + 'T00:00:00'
    const end = reportDate + 'T23:59:59'

    // Fuel readings
    let readingsQ = supabase
      .from('shift_fuel_readings')
      .select('*, fuel_types(name, short_code)')
      .eq('shift_date', reportDate)
      .eq('shift_number', selectedShift)
    if (selectedBranchId) readingsQ = readingsQ.eq('branch_id', selectedBranchId)
    const { data: readings } = await readingsQ

    // Cash sales (for product categories)
    let salesQ = supabase
      .from('cash_sales')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
    if (selectedBranchId) salesQ = salesQ.eq('branch_id', selectedBranchId)
    const { data: sales } = await salesQ

    // Charge invoices (Purchase Orders are the same as Charge Invoices)
    let ciQ = supabase
      .from('purchase_orders')
      .select('*, fuel_types(short_code), cashiers(full_name)')
      .gte('created_at', start)
      .lte('created_at', end)
    if (selectedBranchId) ciQ = ciQ.eq('branch_id', selectedBranchId)
    const { data: ci } = await ciQ

    // Deposits
    let depQ = supabase
      .from('deposits')
      .select('*')
      .eq('shift_date', reportDate)
      .eq('shift_number', selectedShift)
    if (selectedBranchId) depQ = depQ.eq('branch_id', selectedBranchId)
    const { data: dep } = await depQ

    // Checks
    let chkQ = supabase
      .from('checks')
      .select('*')
      .eq('shift_date', reportDate)
      .eq('shift_number', selectedShift)
    if (selectedBranchId) chkQ = chkQ.eq('branch_id', selectedBranchId)
    const { data: chk } = await chkQ

    // Expenses
    let expQ = supabase
      .from('expenses')
      .select('*')
      .eq('shift_date', reportDate)
      .eq('shift_number', selectedShift)
    if (selectedBranchId) expQ = expQ.eq('branch_id', selectedBranchId)
    const { data: exp } = await expQ

    // Purchases/Disbursements
    let purQ = supabase
      .from('purchases_disbursements')
      .select('*')
      .eq('shift_date', reportDate)
      .eq('shift_number', selectedShift)
    if (selectedBranchId) purQ = purQ.eq('branch_id', selectedBranchId)
    const { data: pur } = await purQ

    setFuelReadings(readings || [])
    setCashSales(sales || [])
    setChargeInvoices(ci || [])
    setDeposits(dep || [])
    setChecks(chk || [])
    setExpenses(exp || [])
    setPurchases(pur || [])
    setLoading(false)
  }

  // Calculate totals
  const getFuelReading = (fuelId) => fuelReadings.find(r => r.fuel_type_id === fuelId)
  
  const totalFuelSales = fuelReadings.reduce((s, r) => s + parseFloat(r.total_value || 0), 0)
  const totalOilLubes = productSales.oil_lubes
  const totalAccessories = productSales.accessories
  const totalServices = productSales.services
  const totalMiscellaneous = productSales.miscellaneous
  const totalChargeInvoices = chargeInvoices.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
  const totalDeposits = deposits.reduce((s, d) => s + parseFloat(d.amount || 0), 0)
  const totalCashDeposit = deposits.filter(d => d.payment_method === 'cash').reduce((s, d) => s + parseFloat(d.amount || 0), 0)
  const totalGcash = deposits.filter(d => d.payment_method === 'gcash').reduce((s, d) => s + parseFloat(d.amount || 0), 0)
  const totalChecks = checks.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const totalPurchases = purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0)

  const totalAccountability = totalFuelSales + totalOilLubes + totalAccessories + totalServices + totalMiscellaneous
  const totalRemittance = totalDeposits + totalChecks
  const shortOver = totalRemittance - (totalAccountability - totalChargeInvoices - totalExpenses - totalPurchases)

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
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 18px; font-weight: bold; }
            .header p { font-size: 10px; color: #666; }
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
        <div className="header text-center mb-6">
          <h1 className="text-xl font-bold">MACKY OIL&GAS</h1>
          <p className="text-xs text-gray-500">Lower Sosohon, Manolo Fortich, Bukidnon</p>
          <h2 className="text-lg font-bold mt-2">DAILY ACCOUNTABILITY REPORT</h2>
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
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left">FUEL SALES</th>
              {fuelTypes.map(f => (
                <th key={f.id} className="border border-gray-300 p-2 text-center">{f.short_code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">BEG. READING</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.beginning_reading ? parseFloat(r.beginning_reading).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">END READING</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.ending_reading ? parseFloat(r.ending_reading).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">GROSS</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.liters_dispensed ? parseFloat(r.liters_dispensed).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">Less: Adjustment</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.adjustment_liters ? parseFloat(r.adjustment_liters).toFixed(2) : '—'}
                </td>
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">NET READING</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                const net = r ? (parseFloat(r.liters_dispensed || 0) - parseFloat(r.adjustment_liters || 0)) : null
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {net !== null ? net.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
            <tr>
              <td className="border border-gray-300 p-2 font-medium">PRICE / LITER</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.price_per_liter ? parseFloat(r.price_per_liter).toFixed(2) : parseFloat(f.current_price).toFixed(2)}
                </td>
              })}
            </tr>
            <tr className="bg-gray-50 font-bold">
              <td className="border border-gray-300 p-2">TOTAL FUEL</td>
              {fuelTypes.map(f => {
                const r = getFuelReading(f.id)
                return <td key={f.id} className="border border-gray-300 p-2 text-right font-mono">
                  {r?.total_value ? parseFloat(r.total_value).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                </td>
              })}
            </tr>
          </tbody>
        </table>

        {/* Total Fuel Summary */}
        <div className="flex justify-end mb-4">
          <div className="border-2 border-gray-400 px-4 py-2">
            <span className="font-bold">TOTAL FUEL: </span>
            <span className="font-mono font-bold">Php {totalFuelSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

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

        {/* Total Accountability */}
        <div className="flex justify-end mb-6">
          <div className="border-2 border-gray-800 px-6 py-3 bg-gray-50">
            <span className="font-bold text-sm">TOTAL ACCOUNTABILITY: </span>
            <span className="font-mono font-bold text-lg">₱{totalAccountability.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Deposits */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {[1,2,3,4,5,6,7].map(n => {
                  const dep = deposits.find(d => d.deposit_number === n)
                  return (
                    <tr key={n}>
                      <td className="border border-gray-300 p-2 font-medium w-24">DEPOSIT {n}</td>
                      <td className="border border-gray-300 p-2 text-right font-mono w-24">{dep ? parseFloat(dep.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : ''}</td>
                      <td className="border border-gray-300 p-2 text-xs">{dep?.payment_method === 'gcash' ? 'G cash' : dep?.payment_method || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {[8,9,10,11,12,13,14].map(n => {
                  const dep = deposits.find(d => d.deposit_number === n)
                  return (
                    <tr key={n}>
                      <td className="border border-gray-300 p-2 font-medium w-24">DEPOSIT {n}</td>
                      <td className="border border-gray-300 p-2 text-right font-mono w-24">{dep ? parseFloat(dep.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : ''}</td>
                      <td className="border border-gray-300 p-2 text-xs">{dep?.payment_method === 'gcash' ? 'G cash' : dep?.payment_method || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
              </tbody>
            </table>
          </div>
          <div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                <tr><td className="border border-gray-300 p-2 font-medium">Total Remittance:</td><td className="border border-gray-300 p-2 text-right font-mono font-bold">{totalRemittance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">Short/Over:</td><td className="border border-gray-300 p-2 text-right font-mono">{shortOver.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td className="border border-gray-300 p-2 font-medium">Total Sales:</td><td className="border border-gray-300 p-2 text-right font-mono font-bold">{totalAccountability.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
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
