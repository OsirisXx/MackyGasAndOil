import { useEffect, useState } from 'react'
import { usePumpStore } from '../stores/pumpStore'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { getShiftsForBranch, getCurrentShift } from '../utils/shiftConfig'
import { format } from 'date-fns'
import { Gauge, Play, Square, Save, Lock, Unlock, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function PumpReadingsPanel({ isOpen, onClose }) {
  const { pumps, shiftReadings, fetchPumps, fetchShiftReadings, getPreviousShiftReadings, startPumpTracking, updateShiftReading, closePumpShift } = usePumpStore()
  const { selectedBranchId, branches } = useBranchStore()
  const { cashier } = useAuthStore()
  const [shiftDate, setShiftDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  
  // Get current branch name for shift detection
  const currentBranch = branches.find(b => b.id === selectedBranchId)
  const [selectedShift, setSelectedShift] = useState(() => getCurrentShift(currentBranch?.name))
  const [loading, setLoading] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [unlockedReadings, setUnlockedReadings] = useState(new Set())
  const [showHandover, setShowHandover] = useState(false)
  const [handoverData, setHandoverData] = useState([])

  const shifts = getShiftsForBranch(selectedBranchId)

  useEffect(() => {
    if (isOpen && selectedBranchId) {
      // Clear form state when shift/date changes to prevent stale data
      setEditForm({})
      setUnlockedReadings(new Set())
      loadData()
    }
  }, [isOpen, selectedBranchId, shiftDate, selectedShift])

  const loadData = async () => {
    setLoading(true)
    await fetchPumps(selectedBranchId)
    await fetchShiftReadings(selectedBranchId, shiftDate, selectedShift)
    
    // Check for handover opportunity
    const prevResult = await getPreviousShiftReadings(selectedBranchId, shiftDate, selectedShift)
    if (prevResult.success && prevResult.data.length > 0) {
      setHandoverData(prevResult.data)
      // Only show handover if no readings exist yet
      const currentReadings = await fetchShiftReadings(selectedBranchId, shiftDate, selectedShift)
      if (!currentReadings.data || currentReadings.data.length === 0) {
        setShowHandover(true)
      }
    }
    setLoading(false)
  }

  const handleAcceptHandover = async () => {
    setLoading(true)
    try {
      for (const prev of handoverData) {
        const pump = pumps.find(p => p.id === prev.pump_id)
        if (pump) {
          await startPumpTracking({
            branch_id: selectedBranchId,
            shift_date: shiftDate,
            shift_number: selectedShift,
            pump_id: pump.id,
            cashier_id: cashier?.id,
            beginning_reading: prev.ending_reading,
            price_per_liter: pump.price_per_liter,
            is_handover: true,
            handover_from_shift_number: selectedShift === 1 ? 3 : selectedShift - 1,
            status: 'open',
          })
        }
      }
      toast.success('Shift readings initialized from previous shift')
      setShowHandover(false)
      await loadData()
    } catch (error) {
      toast.error('Failed to initialize shift readings')
    } finally {
      setLoading(false)
    }
  }

  const handleManualStart = () => {
    setShowHandover(false)
  }

  const getReadingForPump = (pumpId) => {
    return shiftReadings.find(r => r.pump_id === pumpId)
  }

  const handleStartTracking = async (pump) => {
    const form = editForm[pump.id]
    if (!form?.beginning_reading) {
      return toast.error('Enter beginning reading')
    }

    setLoading(true)
    const result = await startPumpTracking({
      branch_id: selectedBranchId,
      shift_date: shiftDate,
      shift_number: selectedShift,
      pump_id: pump.id,
      cashier_id: cashier?.id,
      beginning_reading: parseFloat(form.beginning_reading),
      price_per_liter: pump.price_per_liter,
      status: 'open',
    })

    if (result.success) {
      toast.success(`Started tracking ${pump.pump_name}`)
      logAudit('create', 'shift_reading', `Started tracking ${pump.pump_name}`, {
        entityId: result.data.id,
        newValues: { beginning_reading: form.beginning_reading },
        branchId: selectedBranchId,
      })
      await loadData()
    } else {
      toast.error(result.error)
    }
    setLoading(false)
  }

  const handleUpdateReading = async (pump, reading) => {
    const form = editForm[pump.id]
    
    setLoading(true)
    const result = await updateShiftReading(reading.id, {
      beginning_reading: form?.beginning_reading ? parseFloat(form.beginning_reading) : reading.beginning_reading,
      ending_reading: form?.ending_reading ? parseFloat(form.ending_reading) : reading.ending_reading,
      adjustment_liters: form?.adjustment_liters ? parseFloat(form.adjustment_liters) : reading.adjustment_liters,
      adjustment_reason: form?.adjustment_reason || reading.adjustment_reason,
    })

    if (result.success) {
      toast.success('Reading updated')
      await loadData()
    } else {
      toast.error(result.error)
    }
    setLoading(false)
  }

  const handleCloseShift = async (pump, reading) => {
    const form = editForm[pump.id]
    if (!form?.ending_reading) {
      return toast.error('Enter ending reading')
    }

    setLoading(true)
    const result = await closePumpShift(reading.id, parseFloat(form.ending_reading))

    if (result.success) {
      toast.success(`Closed shift for ${pump.pump_name}`)
      logAudit('update', 'shift_reading', `Closed shift for ${pump.pump_name}`, {
        entityId: reading.id,
        oldValues: { status: 'open' },
        newValues: { status: 'closed', ending_reading: form.ending_reading },
        branchId: selectedBranchId,
      })
      await loadData()
    } else {
      toast.error(result.error)
    }
    setLoading(false)
  }

  const handleUnlock = (pumpId) => {
    setUnlockedReadings(prev => new Set([...prev, pumpId]))
    toast.info('Reading unlocked for editing')
  }

  const handleLock = async (pump, reading) => {
    await handleUpdateReading(pump, reading)
    setUnlockedReadings(prev => {
      const newSet = new Set(prev)
      newSet.delete(pump.id)
      return newSet
    })
    toast.success('Reading locked')
  }

  const totalDispensed = shiftReadings.reduce((sum, r) => sum + (r.liters_dispensed || 0), 0)
  const totalAdjustments = shiftReadings.reduce((sum, r) => sum + (r.adjustment_liters || 0), 0)
  const netSales = totalDispensed - totalAdjustments
  const totalValue = shiftReadings.reduce((sum, r) => sum + (r.total_value || 0), 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header with Date & Shift Selector */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Pump Readings</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {shifts.map(s => (
                  <option key={s.number} value={s.number}>
                    Shift {s.number} ({s.label})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Handover Modal */}
        {showHandover && handoverData.length > 0 && (
          <div className="p-6 bg-blue-50 border-b border-blue-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2">Shift Handover Detected</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Previous shift readings are available. Would you like to use them as starting readings?
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {handoverData.map(prev => (
                    <div key={prev.pump_id} className="bg-white rounded p-2 border border-blue-200">
                      <p className="text-xs text-gray-600">{prev.pump_name}</p>
                      <p className="font-mono font-semibold text-sm">{prev.ending_reading?.toFixed(3)} L</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAcceptHandover}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    Use Previous Readings
                  </button>
                  <button
                    onClick={handleManualStart}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
                  >
                    Enter Manually
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pump Readings List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {pumps.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Gauge className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>No pumps configured for this branch</p>
              <p className="text-sm text-gray-400 mt-1">Contact admin to add pumps</p>
            </div>
          ) : (
            pumps.sort((a, b) => {
              // Sort by fuel type first (Premium, Diesel, Unleaded)
              if (a.fuel_type !== b.fuel_type) {
                return a.fuel_type.localeCompare(b.fuel_type)
              }
              // Then by pump number
              return a.pump_number - b.pump_number
            }).map(pump => {
              const reading = getReadingForPump(pump.id)
              const isOpen = reading?.status === 'open'
              const isClosed = reading?.status === 'closed'
              const isUnlocked = unlockedReadings.has(pump.id)
              const isEditable = isOpen || isUnlocked
              
              // Use editForm if exists, otherwise fall back to reading data
              const form = editForm[pump.id] || {
                beginning_reading: reading?.beginning_reading || '',
                ending_reading: reading?.ending_reading || '',
                adjustment_liters: reading?.adjustment_liters || 0,
                adjustment_reason: reading?.adjustment_reason || '',
              }

              return (
                <div key={pump.id} className={`border rounded-xl overflow-hidden ${
                  isClosed ? 'border-green-200 bg-green-50' : isOpen ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
                }`}>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isClosed ? 'bg-green-100' : isOpen ? 'bg-amber-100' : 'bg-gray-100'}`}>
                          <Gauge size={20} className={isClosed ? 'text-green-600' : isOpen ? 'text-amber-600' : 'text-gray-400'} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">#{pump.pump_number} {pump.fuel_type}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                              pump.category === 'discounted' 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {pump.category === 'discounted' ? 'Discounted' : 'Regular'}
                            </span>
                            <span className="text-xs text-gray-500">₱{parseFloat(pump.price_per_liter).toFixed(2)}/L</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isClosed && (
                          <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            <CheckCircle size={12} /> Closed
                          </span>
                        )}
                        {isOpen && (
                          <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                            <Clock size={12} /> Open
                          </span>
                        )}
                        {!reading && (
                          <span className="text-xs text-gray-400">Not started</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Beginning (L)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={form.beginning_reading}
                          onChange={e => setEditForm(p => ({ ...p, [pump.id]: { ...p[pump.id], beginning_reading: e.target.value } }))}
                          disabled={!isEditable && reading}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                          placeholder="0.000"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Ending (L)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={form.ending_reading}
                          onChange={e => setEditForm(p => ({ ...p, [pump.id]: { ...p[pump.id], ending_reading: e.target.value } }))}
                          disabled={!reading || (!isEditable)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100"
                          placeholder="0.000"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Dispensed</label>
                        <div className="px-2 py-1.5 bg-blue-50 rounded-lg text-sm font-bold text-blue-700 font-mono">
                          {reading?.liters_dispensed ? parseFloat(reading.liters_dispensed).toFixed(3) : '—'} L
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Adjustments</label>
                        <div className="px-2 py-1.5 bg-orange-50 rounded-lg text-sm font-bold text-orange-700 font-mono">
                          {reading?.adjustment_liters ? parseFloat(reading.adjustment_liters).toFixed(3) : '0.000'} L
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Net Sales</label>
                        <div className="px-2 py-1.5 bg-green-50 rounded-lg text-sm font-bold text-green-700 font-mono">
                          {reading?.liters_dispensed ? (parseFloat(reading.liters_dispensed) - (parseFloat(reading.adjustment_liters) || 0)).toFixed(3) : '—'} L
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Total Value</label>
                        <div className="px-2 py-1.5 bg-purple-50 rounded-lg text-sm font-bold text-purple-700">
                          {reading?.total_value ? `₱${parseFloat(reading.total_value).toFixed(2)}` : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      {!reading && (
                        <button
                          onClick={() => handleStartTracking(pump)}
                          disabled={loading || !form.beginning_reading}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          <Play size={14} /> Start Tracking
                        </button>
                      )}
                      {isOpen && (
                        <>
                          <button
                            onClick={() => handleCloseShift(pump, reading)}
                            disabled={loading || !form.ending_reading}
                            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            <Square size={14} /> Close Shift
                          </button>
                          <button
                            onClick={() => handleUpdateReading(pump, reading)}
                            disabled={loading}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Save size={14} /> Save
                          </button>
                        </>
                      )}
                      {isClosed && !isUnlocked && (
                        <button
                          onClick={() => handleUnlock(pump.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium transition-colors"
                        >
                          <Unlock size={14} /> Unlock to Edit
                        </button>
                      )}
                      {isClosed && isUnlocked && (
                        <button
                          onClick={() => handleLock(pump, reading)}
                          disabled={loading}
                          className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          <Lock size={14} /> Lock
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Summary Footer */}
        {shiftReadings.length > 0 && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-800 mb-3">Shift Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-600">Total Dispensed</p>
                <p className="text-lg font-bold text-gray-900 font-mono">{totalDispensed.toFixed(3)} L</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Total Adjustments</p>
                <p className="text-lg font-bold text-orange-600 font-mono">{totalAdjustments.toFixed(3)} L</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Net Sales</p>
                <p className="text-lg font-bold text-green-600 font-mono">{netSales.toFixed(3)} L</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Total Value</p>
                <p className="text-lg font-bold text-blue-600">₱{totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
