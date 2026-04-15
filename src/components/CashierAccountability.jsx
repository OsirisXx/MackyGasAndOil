import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { usePumpStore } from '../stores/pumpStore'
import { getShiftsForBranch, getCurrentShift } from '../utils/shiftConfig'
import { ensureCurrentShiftSnapshots, updateShiftReadings } from '../services/shiftService'
import { format } from 'date-fns'
import { X, RefreshCw, FileText, Fuel, DollarSign, TrendingUp, Package, CreditCard, Beaker } from 'lucide-react'

export default function CashierAccountability({ isOpen, onClose }) {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { selectedBranchId, branches } = useBranchStore()
  const { cashier } = useAuthStore()
  const { pumps, fetchPumps } = usePumpStore()
  const [loading, setLoading] = useState(false)

  // Data states
  const [pumpReadings, setPumpReadings] = useState([])
  const [cashSales, setCashSales] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [productSales, setProductSales] = useState([])
  const [deposits, setDeposits] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [calibrations, setCalibrations] = useState([])

  const currentBranch = branches.find(b => b.id === selectedBranchId)
  const autoShift = getCurrentShift(currentBranch?.name)
  const shifts = getShiftsForBranch(currentBranch?.name)
  
  // Allow cashier to select which shift to view
  const [selectedShift, setSelectedShift] = useState(autoShift)
  const shiftLabel = shifts.find(s => s.number === selectedShift)?.label || `Shift ${selectedShift}`
  const today = format(new Date(), 'yyyy-MM-dd')

  // Reset to current shift when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedShift(autoShift)
    }
  }, [isOpen, autoShift])

  useEffect(() => {
    if (isOpen && cashier?.id) {
      fetchFuelTypes()
      fetchData()
    }
  }, [isOpen, selectedBranchId, cashier?.id, selectedShift])

  const fetchData = async () => {
    if (!selectedBranchId || !cashier?.id) return
    setLoading(true)

    try {
      // Use same date format as POS page
      const [ty, tm, td] = today.split('-').map(Number)
      const start = new Date(ty, tm - 1, td, 0, 0, 0, 0).toISOString()
      const end = new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString()

      console.log('CashierAccountability - fetching data for:', { 
        cashierId: cashier.id, 
        branchId: selectedBranchId,
        shift: selectedShift,
        date: today,
        start,
        end
      })

      // Ensure shift snapshots exist and are updated
      await ensureCurrentShiftSnapshots(selectedBranchId, currentBranch?.name)
      await updateShiftReadings(selectedBranchId)

      // Fetch pumps with current readings
      await fetchPumps(selectedBranchId)

      // Fetch shift snapshots for selected shift
      const { data: snapshots } = await supabase
        .from('shift_pump_snapshots')
        .select('*, pumps(pump_name, pump_number, fuel_type, category, price_per_liter)')
        .eq('branch_id', selectedBranchId)
        .eq('shift_date', today)
        .eq('shift_number', selectedShift)

      // Fetch cash sales for today for this cashier
      const { data: sales, error: salesError } = await supabase
        .from('cash_sales')
        .select('*')
        .eq('cashier_id', cashier.id)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
      
      console.log('CashierAccountability - sales query:', { 
        cashierId: cashier.id, 
        start, 
        end,
        sales, 
        salesError, 
        count: sales?.length 
      })

      // Fetch purchase orders (charge invoices) for this cashier
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('*, pumps(pump_name, fuel_type)')
        .eq('cashier_id', cashier.id)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })

      // Fetch product sales for this cashier
      const { data: prods } = await supabase
        .from('product_sales')
        .select('*, products(name, category)')
        .eq('cashier_id', cashier.id)
        .gte('created_at', start)
        .lte('created_at', end)

      // Fetch deposits
      const { data: deps } = await supabase
        .from('cash_deposits')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .gte('created_at', start)
        .lte('created_at', end)

      // Fetch withdrawals
      const { data: withs } = await supabase
        .from('cash_withdrawals')
        .select('*')
        .eq('branch_id', selectedBranchId)
        .gte('created_at', start)
        .lte('created_at', end)

      // Fetch calibrations for selected shift only
      const { data: cals } = await supabase
        .from('pump_calibrations')
        .select('*, pumps(pump_name, fuel_type)')
        .eq('branch_id', selectedBranchId)
        .eq('shift_date', today)
        .eq('shift_number', selectedShift)

      setCashSales(sales || [])
      setPurchaseOrders(pos || [])
      setProductSales(prods || [])
      setDeposits(deps || [])
      setWithdrawals(withs || [])
      setCalibrations(cals || [])

      // Group pump readings by fuel type using ONLY shift snapshots
      // Do NOT fallback to pumps table - that shows cumulative data which is wrong
      const grouped = {}

      if (snapshots && snapshots.length > 0) {
        // Use shift snapshots for per-shift data
        snapshots.forEach(snapshot => {
          const fuelType = snapshot.pumps?.fuel_type
          const category = snapshot.pumps?.category || 'regular'
          if (!fuelType) return

          const key = `${fuelType}-${category}`
          const beginningReading = parseFloat(snapshot.beginning_reading || 0)
          const endingReading = parseFloat(snapshot.ending_reading || snapshot.beginning_reading || 0)
          const litersDispensed = endingReading - beginningReading

          if (!grouped[key]) {
            grouped[key] = {
              fuel_type: fuelType,
              category: category,
              pumps: [],
              total_initial: 0,
              total_current: 0,
              total_liters: 0,
              price_per_liter: snapshot.price_per_liter || snapshot.pumps?.price_per_liter,
            }
          }
          grouped[key].pumps.push(snapshot)
          grouped[key].total_initial += beginningReading
          grouped[key].total_current += endingReading
          grouped[key].total_liters += litersDispensed
        })
      }
      // No fallback - if no snapshots exist, show empty/zero data
      // This prevents showing misleading cumulative totals
      setPumpReadings(Object.values(grouped))

    } catch (error) {
      console.error('Error fetching accountability data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate totals
  // Fuel sales calculated from pump readings (liters × price)
  const totalFuelSalesFromReadings = pumpReadings.reduce((sum, r) => {
    return sum + (r.total_liters * parseFloat(r.price_per_liter || 0))
  }, 0)
  const totalFuelSalesFromCash = cashSales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0)
  
  const totalPurchaseOrders = purchaseOrders.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
  const totalProductSales = productSales.reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0)
  const totalDeposits = deposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0)
  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
  const totalCalibrations = calibrations.reduce((sum, c) => sum + parseFloat(c.amount || (c.liters * c.price_per_liter) || 0), 0)
  const totalCalibrationLiters = calibrations.reduce((sum, c) => sum + parseFloat(c.liters || 0), 0)

  // Fuel sales should INCLUDE calibration to show total pump dispensed
  // Then calibration deduction brings it back to actual cash received
  // Example: 30L sales + 10L calibration = 40L shown, minus 10L calibration = 30L actual cash
  const baseFuelSales = totalFuelSalesFromReadings > 0 ? totalFuelSalesFromReadings : totalFuelSalesFromCash
  const totalFuelSales = baseFuelSales + totalCalibrations  // Add calibration to show total dispensed

  const grandTotalSales = totalFuelSales + totalPurchaseOrders + totalProductSales
  const netCash = baseFuelSales + totalProductSales - totalWithdrawals  // Actual cash = sales without calibration

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Shift Accountability</h2>
              <p className="text-emerald-100 text-sm">
                {currentBranch?.name} • {shiftLabel} • {format(new Date(), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Shift selector */}
            <div className="flex bg-white/20 rounded-lg overflow-hidden">
              {shifts.map(shift => (
                <button
                  key={shift.number}
                  onClick={() => setSelectedShift(shift.number)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedShift === shift.number
                      ? 'bg-white text-emerald-700'
                      : 'text-white hover:bg-white/30'
                  }`}
                >
                  {shift.number === 1 ? '1st' : shift.number === 2 ? '2nd' : '3rd'}
                </button>
              ))}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Fuel className="w-4 h-4 text-blue-600" />
                <p className="text-xs text-blue-600 font-medium">Fuel Sales</p>
              </div>
              <p className="text-xl font-bold text-blue-700 font-mono">
                ₱{totalFuelSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-3 border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-amber-600" />
                <p className="text-xs text-amber-600 font-medium">Charge/PO</p>
              </div>
              <p className="text-xl font-bold text-amber-700 font-mono">
                ₱{totalPurchaseOrders.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-purple-600" />
                <p className="text-xs text-purple-600 font-medium">Products</p>
              </div>
              <p className="text-xl font-bold text-purple-700 font-mono">
                ₱{totalProductSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-3 border border-emerald-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <p className="text-xs text-emerald-600 font-medium">Total Sales</p>
              </div>
              <p className="text-xl font-bold text-emerald-700 font-mono">
                ₱{grandTotalSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Fuel Sales by Type */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Fuel className="w-5 h-5 text-gray-600" />
                Fuel Sales Summary
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fuel Type</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Beginning</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Liters</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price/L</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pumpReadings.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
                        No pump readings available
                      </td>
                    </tr>
                  ) : (
                    pumpReadings.map((reading, idx) => {
                      const baseAmount = reading.total_liters * parseFloat(reading.price_per_liter || 0)
                      // Add calibration amount for this fuel type
                      const fuelCalibrations = calibrations.filter(c => 
                        c.pumps?.fuel_type === reading.fuel_type && 
                        (c.pumps?.category || 'regular') === (reading.category || 'regular')
                      )
                      const calibrationAmount = fuelCalibrations.reduce((s, c) => s + parseFloat(c.amount || (c.liters * c.price_per_liter) || 0), 0)
                      const amount = baseAmount + calibrationAmount
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-900">
                            {reading.fuel_type}
                            {reading.category === 'discounted' && (
                              <span className="ml-1 text-xs text-amber-600">(D)</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-gray-600">
                            {reading.total_initial.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-gray-900 font-semibold">
                            {reading.total_current.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-green-600 font-semibold">
                            {reading.total_liters.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-gray-600">
                            ₱{parseFloat(reading.price_per_liter || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-blue-600 font-semibold">
                            ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                {pumpReadings.length > 0 && (
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-4 py-2 text-gray-900">TOTAL</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">
                        {pumpReadings.reduce((s, r) => s + r.total_initial, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-900">
                        {pumpReadings.reduce((s, r) => s + r.total_current, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-green-600">
                        {pumpReadings.reduce((s, r) => s + r.total_liters, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right font-mono text-blue-600">
                        ₱{totalFuelSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Cash Summary */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-600" />
                Cash Summary
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Cash Fuel Sales</span>
                <span className="font-mono font-semibold text-gray-900">
                  ₱{totalFuelSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Product Sales</span>
                <span className="font-mono font-semibold text-gray-900">
                  ₱{totalProductSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Deposits to Vault</span>
                <span className="font-mono font-semibold text-green-600">
                  +₱{totalDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Withdrawals from Vault</span>
                <span className="font-mono font-semibold text-red-600">
                  -₱{totalWithdrawals.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {totalCalibrations > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100 bg-pink-50 -mx-4 px-4">
                  <span className="text-pink-700 flex items-center gap-2">
                    <Beaker className="w-4 h-4" />
                    Calibration ({totalCalibrationLiters.toFixed(2)}L)
                  </span>
                  <span className="font-mono font-semibold text-pink-600">
                    -₱{totalCalibrations.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center py-3 bg-emerald-50 rounded-lg px-3 mt-2">
                <span className="font-semibold text-emerald-800">Expected Cash on Hand</span>
                <span className="font-mono font-bold text-emerald-700 text-lg">
                  ₱{netCash.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
