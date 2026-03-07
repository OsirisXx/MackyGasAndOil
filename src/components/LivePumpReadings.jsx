import { useEffect, useState } from 'react'
import { usePumpStore } from '../stores/pumpStore'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { getShiftsForBranch, getCurrentShift } from '../utils/shiftConfig'
import { format } from 'date-fns'
import { Gauge, X, RefreshCw, Fuel, TrendingUp } from 'lucide-react'

export default function LivePumpReadings({ isOpen, onClose }) {
  const { pumps, fetchPumps, subscribeToPumpUpdates } = usePumpStore()
  const { selectedBranchId, branches } = useBranchStore()
  const { cashier } = useAuthStore()
  const [loading, setLoading] = useState(false)

  const currentBranch = branches.find(b => b.id === selectedBranchId)
  const currentShift = getCurrentShift(currentBranch?.name)
  const shifts = getShiftsForBranch(currentBranch?.name)
  const shiftLabel = shifts.find(s => s.number === currentShift)?.label || `Shift ${currentShift}`

  useEffect(() => {
    if (isOpen && selectedBranchId) {
      loadData()
      // Subscribe to real-time updates
      const unsubscribe = subscribeToPumpUpdates(selectedBranchId, (updatedPump) => {
        // Pump updated - state is already updated by the store
      })
      return () => unsubscribe?.()
    }
  }, [isOpen, selectedBranchId])

  const loadData = async () => {
    setLoading(true)
    await fetchPumps(selectedBranchId)
    setLoading(false)
  }

  // Group pumps by fuel type
  const pumpsByFuelType = pumps.reduce((acc, pump) => {
    const key = `${pump.fuel_type}-${pump.category || 'regular'}`
    if (!acc[key]) {
      acc[key] = {
        fuel_type: pump.fuel_type,
        category: pump.category || 'regular',
        pumps: [],
        totalLiters: 0,
        totalValue: 0,
      }
    }
    acc[key].pumps.push(pump)
    const liters = parseFloat(pump.current_reading || 0) - parseFloat(pump.initial_reading || 0)
    acc[key].totalLiters += liters
    acc[key].totalValue += liters * parseFloat(pump.price_per_liter || 0)
    return acc
  }, {})

  const grandTotalLiters = pumps.reduce((sum, p) => 
    sum + (parseFloat(p.current_reading || 0) - parseFloat(p.initial_reading || 0)), 0)
  const grandTotalValue = pumps.reduce((sum, p) => {
    const liters = parseFloat(p.current_reading || 0) - parseFloat(p.initial_reading || 0)
    return sum + (liters * parseFloat(p.price_per_liter || 0))
  }, 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Live Pump Readings</h2>
              <p className="text-blue-100 text-sm">
                {currentBranch?.name} • {shiftLabel} • {format(new Date(), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
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
        <div className="flex-1 overflow-y-auto p-4">
          {pumps.length === 0 ? (
            <div className="text-center py-12">
              <Fuel className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No pumps configured for this branch</p>
              <p className="text-sm text-gray-400 mt-1">Contact admin to set up pumps</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                  <p className="text-sm text-green-600 font-medium">Total Liters Sold</p>
                  <p className="text-2xl font-bold text-green-700 font-mono">
                    {grandTotalLiters.toLocaleString('en-PH', { minimumFractionDigits: 3 })} L
                  </p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                  <p className="text-sm text-blue-600 font-medium">Total Sales Value</p>
                  <p className="text-2xl font-bold text-blue-700 font-mono">
                    ₱{grandTotalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Pumps by Fuel Type */}
              {Object.values(pumpsByFuelType).map((group) => (
                <div key={`${group.fuel_type}-${group.category}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-5 h-5 text-gray-600" />
                      <span className="font-semibold text-gray-800">
                        {group.fuel_type} {group.category === 'discounted' && <span className="text-amber-600">(Discounted)</span>}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-mono">{group.totalLiters.toLocaleString('en-PH', { minimumFractionDigits: 3 })} L</span>
                      <span className="mx-2">•</span>
                      <span className="font-mono font-semibold">₱{group.totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.pumps.map((pump) => {
                      const liters = parseFloat(pump.current_reading || 0) - parseFloat(pump.initial_reading || 0)
                      const value = liters * parseFloat(pump.price_per_liter || 0)
                      const isInitialized = parseFloat(pump.current_reading || 0) > 0

                      return (
                        <div key={pump.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                              isInitialized ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                            }`}>
                              #{pump.pump_number}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{pump.pump_name}</p>
                              <p className="text-xs text-gray-500">
                                ₱{parseFloat(pump.price_per_liter || 0).toFixed(2)}/L
                              </p>
                            </div>
                          </div>
                          
                          {isInitialized ? (
                            <div className="text-right">
                              <div className="flex items-center gap-4 text-sm">
                                <div>
                                  <p className="text-xs text-gray-500">Initial</p>
                                  <p className="font-mono text-gray-600">
                                    {parseFloat(pump.initial_reading || 0).toLocaleString('en-PH', { minimumFractionDigits: 3 })}
                                  </p>
                                </div>
                                <TrendingUp className="w-4 h-4 text-gray-400" />
                                <div>
                                  <p className="text-xs text-gray-500">Current</p>
                                  <p className="font-mono font-semibold text-gray-900">
                                    {parseFloat(pump.current_reading || 0).toLocaleString('en-PH', { minimumFractionDigits: 3 })}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-1 text-right">
                                <span className="text-sm font-mono text-green-600 font-semibold">
                                  {liters.toLocaleString('en-PH', { minimumFractionDigits: 3 })} L
                                </span>
                                <span className="text-gray-400 mx-1">•</span>
                                <span className="text-sm font-mono text-blue-600 font-semibold">
                                  ₱{value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-right">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                Not Initialized
                              </span>
                              <p className="text-xs text-gray-400 mt-1">Contact admin to set initial reading</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Info Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Pump readings update automatically with each sale. 
                  Only administrators can adjust readings manually.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
