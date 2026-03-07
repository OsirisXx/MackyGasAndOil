import { useEffect, useState } from 'react'
import { useFuelDeliveryStore } from '../stores/fuelDeliveryStore'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { supabase } from '../lib/supabase'
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'

export default function FuelReconciliation() {
  const { tanks, reconciliations, fetchTanks, fetchReconciliations, createReconciliation } = useFuelDeliveryStore()
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { selectedBranchId } = useBranchStore()
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [reconData, setReconData] = useState([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        await Promise.all([
          fetchTanks(selectedBranchId),
          fetchFuelTypes(),
          fetchReconciliations(selectedBranchId, selectedDate, selectedDate)
        ])
      } catch (err) {
        console.error('FuelReconciliation fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedBranchId, selectedDate])

  const runReconciliation = async () => {
    if (!tanks.length) {
      return toast.error('No tanks configured')
    }

    setLoading(true)
    try {
      const results = []

      for (const tank of tanks) {
        const tankInventory = await supabase
          .from('daily_tank_inventory')
          .select('*')
          .eq('tank_id', tank.id)
          .eq('inventory_date', selectedDate)
          .single()

        const deliveries = await supabase
          .from('fuel_deliveries')
          .select('actual_received')
          .eq('tank_id', tank.id)
          .eq('delivery_date', selectedDate)

        // Get all pumps linked to this tank
        const { data: pumpsForTank } = await supabase
          .from('pumps')
          .select('id')
          .eq('tank_id', tank.id)
          .eq('is_active', true)

        const pumpIds = pumpsForTank?.map(p => p.id) || []

        // Get shift readings for pumps linked to this tank
        const shiftReadings = pumpIds.length > 0 ? await supabase
          .from('shift_pump_readings')
          .select('liters_dispensed, adjustment_liters, pump_id, pumps(pump_name)')
          .in('pump_id', pumpIds)
          .eq('shift_date', selectedDate)
          .eq('branch_id', selectedBranchId || null)
          : { data: [] }

        const openingInventory = tankInventory.data?.opening_dip || 0
        const closingInventory = tankInventory.data?.closing_dip || 0
        const totalDeliveries = deliveries.data?.reduce((sum, d) => sum + (d.actual_received || 0), 0) || 0
        const totalPumpSales = shiftReadings.data?.reduce((sum, r) => sum + (r.liters_dispensed || 0), 0) || 0
        const totalAdjustments = shiftReadings.data?.reduce((sum, r) => sum + (r.adjustment_liters || 0), 0) || 0

        const expectedFuelSold = openingInventory + totalDeliveries - closingInventory
        const netPumpSales = totalPumpSales - totalAdjustments
        const varianceLiters = expectedFuelSold - netPumpSales
        const variancePercentage = netPumpSales > 0 ? (varianceLiters / netPumpSales) * 100 : 0

        const allowableVariance = tank.allowable_variance_qty + (netPumpSales * (tank.allowable_variance_percentage / 100))
        const isWithinThreshold = Math.abs(varianceLiters) <= allowableVariance

        const reconRecord = {
          reconciliation_date: selectedDate,
          tank_id: tank.id,
          fuel_type_id: tank.fuel_type_id,
          branch_id: selectedBranchId,
          opening_tank_inventory: openingInventory,
          total_deliveries: totalDeliveries,
          closing_tank_inventory: closingInventory,
          total_pump_sales: totalPumpSales,
          total_adjustments: totalAdjustments,
          is_within_threshold: isWithinThreshold,
          status: isWithinThreshold ? 'reviewed' : 'pending',
        }

        const result = await createReconciliation(reconRecord)
        if (result.success) {
          results.push({
            ...result.data,
            tank,
            varianceLiters,
            variancePercentage,
            isWithinThreshold,
          })
        }
      }

      setReconData(results)
      toast.success('Reconciliation completed!')
    } catch (err) {
      console.error('Reconciliation error:', err)
      toast.error('Failed to run reconciliation')
    } finally {
      setLoading(false)
    }
  }

  const existingRecon = reconciliations.filter(r => r.reconciliation_date === selectedDate)

  const stats = {
    totalTanks: tanks.length,
    reconciled: existingRecon.length,
    withinThreshold: existingRecon.filter(r => r.is_within_threshold).length,
    flagged: existingRecon.filter(r => !r.is_within_threshold).length,
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Fuel Reconciliation Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Compare tank inventory vs pump sales to detect variances</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Tanks</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalTanks}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Reconciled</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.reconciled}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Within Threshold</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.withinThreshold}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Flagged</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.flagged}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reconciliation Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <button
            onClick={runReconciliation}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Run Reconciliation
          </button>
        </div>

        {existingRecon.length > 0 ? (
          <div className="space-y-4">
            {existingRecon.map(recon => {
              const tank = tanks.find(t => t.id === recon.tank_id)
              const varianceStatus = recon.is_within_threshold ? 'good' : 'warning'

              return (
                <div
                  key={recon.id}
                  className={`border rounded-lg p-4 ${
                    varianceStatus === 'good' ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Tank {tank?.tank_number} - {tank?.tank_name}
                      </h3>
                      <p className="text-sm text-gray-600">{recon.fuel_types?.name}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      varianceStatus === 'good' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {recon.is_within_threshold ? 'Within Threshold' : 'Needs Review'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-600">Opening Inventory</p>
                      <p className="font-mono font-semibold">{recon.opening_tank_inventory?.toFixed(3)} L</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Deliveries</p>
                      <p className="font-mono font-semibold text-green-600">+{recon.total_deliveries?.toFixed(3)} L</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Closing Inventory</p>
                      <p className="font-mono font-semibold">{recon.closing_tank_inventory?.toFixed(3)} L</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Expected Sold (Tank)</p>
                      <p className="font-mono font-semibold text-blue-600">{recon.expected_fuel_sold?.toFixed(3)} L</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-600">Pump Dispensed</p>
                      <p className="font-mono font-semibold">{recon.total_pump_sales?.toFixed(3)} L</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Adjustments</p>
                      <p className="font-mono font-semibold text-orange-600">-{recon.total_adjustments?.toFixed(3)} L</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Net Sales (Pump)</p>
                      <p className="font-mono font-semibold text-blue-600">{recon.net_pump_sales?.toFixed(3)} L</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Variance</p>
                      <p className={`font-mono font-semibold ${
                        Math.abs(recon.variance_liters) <= 20 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {recon.variance_liters >= 0 ? '+' : ''}{recon.variance_liters?.toFixed(3)} L
                        ({recon.variance_percentage >= 0 ? '+' : ''}{recon.variance_percentage?.toFixed(2)}%)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    {recon.is_within_threshold ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-green-700">Variance is within acceptable threshold</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        <span className="text-yellow-700">Variance exceeds threshold - investigation recommended</span>
                      </>
                    )}
                  </div>

                  {recon.investigation_notes && (
                    <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">Investigation Notes:</p>
                      <p className="text-sm">{recon.investigation_notes}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No reconciliation data for this date</p>
            <p className="text-sm text-gray-400">Click "Run Reconciliation" to generate report</p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-2">How Reconciliation Works:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li><strong>Tank-based calculation:</strong> Opening Inventory + Deliveries - Closing Inventory = Expected Fuel Sold</li>
              <li><strong>Pump-based calculation:</strong> Total Dispensed - Adjustments (calibration, spillage) = Net Sales</li>
              <li><strong>Variance:</strong> Expected Fuel Sold - Net Sales (should be near zero)</li>
              <li><strong>Threshold:</strong> Acceptable variance is typically ±0.5% to 1% of total sales</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
