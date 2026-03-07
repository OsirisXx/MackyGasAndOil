import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePumpStore } from '../stores/pumpStore'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { getShiftsForBranch } from '../utils/shiftConfig'
import { format } from 'date-fns'
import { Wrench, Plus, Save, X, AlertCircle, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function PumpAdjustments() {
  const { pumps, fetchPumps } = usePumpStore()
  const { branches, selectedBranchId } = useBranchStore()
  const { cashier } = useAuthStore()
  const [shiftDate, setShiftDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedShift, setSelectedShift] = useState(1)
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    pump_id: '',
    adjustment_liters: '',
    adjustment_reason: '',
  })

  const selectedBranch = branches.find(b => b.id === selectedBranchId)
  const SHIFTS = getShiftsForBranch(selectedBranch?.name)

  useEffect(() => {
    if (selectedBranchId || cashier?.branch_id) {
      fetchPumps(selectedBranchId || cashier?.branch_id)
    }
  }, [selectedBranchId, cashier])
  useEffect(() => { fetchReadings() }, [shiftDate, selectedShift, selectedBranchId])

  const fetchReadings = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('shift_pump_readings')
        .select('*, pumps(pump_number, pump_name, fuel_type, price_per_liter)')
        .eq('shift_date', shiftDate)
        .eq('shift_number', selectedShift)
        .order('created_at')
      
      if (selectedBranchId) query = query.eq('branch_id', selectedBranchId)
      
      const { data, error } = await query
      if (error) {
        console.warn('shift_pump_readings table may not exist:', error.message)
        setReadings([])
      } else {
        setReadings(data || [])
      }
    } catch (err) {
      console.error('PumpAdjustments fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const adjustmentLiters = parseFloat(formData.adjustment_liters)
    if (isNaN(adjustmentLiters) || adjustmentLiters <= 0) {
      return toast.error('Please enter a valid adjustment amount')
    }

    if (!formData.adjustment_reason.trim()) {
      return toast.error('Please provide a reason for the adjustment')
    }

    const existingReading = readings.find(r => r.pump_id === formData.pump_id)
    
    if (!existingReading) {
      return toast.error('No shift reading found for this pump. Please start the shift first.')
    }

    setLoading(true)
    
    const currentAdjustment = existingReading.adjustment_liters || 0
    const newAdjustment = currentAdjustment + adjustmentLiters
    const selectedPump = pumps.find(p => p.id === formData.pump_id)

    const { error } = await supabase
      .from('shift_pump_readings')
      .update({
        adjustment_liters: newAdjustment,
        adjustment_reason: existingReading.adjustment_reason 
          ? `${existingReading.adjustment_reason}; ${formData.adjustment_reason}` 
          : formData.adjustment_reason
      })
      .eq('id', existingReading.id)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Adjustment recorded successfully!')
      logAudit('update', 'pump_adjustment', `Adjustment: ${adjustmentLiters}L - ${selectedPump?.pump_name}`, {
        entityId: existingReading.id,
        oldValues: { adjustment_liters: currentAdjustment },
        newValues: { adjustment_liters: newAdjustment, adjustment_reason: formData.adjustment_reason },
        branchId: selectedBranchId || cashier?.branch_id,
      })
      setShowForm(false)
      resetForm()
      fetchReadings()
    }
    setLoading(false)
  }

  const resetForm = () => {
    setFormData({
      pump_id: '',
      adjustment_liters: '',
      adjustment_reason: '',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 mb-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/pos" className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={18} />
              <span className="text-sm font-medium">Back to POS</span>
            </a>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">Pump Adjustments</h1>
              <p className="text-xs text-gray-500">Record pump calibration tests and non-sale dispensing</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{cashier?.full_name}</p>
            <p className="text-xs text-gray-500">{cashier?.branches?.name}</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 space-y-6">
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'Add Adjustment'}
          </button>
        </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {SHIFTS.map(shift => (
                <option key={shift.number} value={shift.number}>
                  Shift {shift.number} ({shift.time})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Wrench className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Record Adjustment</h2>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">When to record adjustments:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Pump calibration testing (e.g., 10 liters dispensed for testing)</li>
                  <li>Fuel spillage during operations</li>
                  <li>Sample testing for quality control</li>
                  <li>Any fuel dispensed that is not a customer sale</li>
                </ul>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Pump *</label>
              <select
                value={formData.pump_id}
                onChange={(e) => setFormData(prev => ({ ...prev, pump_id: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select Pump</option>
                {pumps.map(pump => (
                  <option key={pump.id} value={pump.id}>
                    {pump.pump_name} - {pump.fuel_type} (₱{parseFloat(pump.price_per_liter).toFixed(2)}/L)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adjustment Amount (Liters) *</label>
              <input
                type="number"
                step="0.001"
                value={formData.adjustment_liters}
                onChange={(e) => setFormData(prev => ({ ...prev, adjustment_liters: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                placeholder="e.g., 10.000"
              />
              <p className="text-xs text-gray-500 mt-1">Enter the amount of fuel dispensed (not sold)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
              <select
                value={formData.adjustment_reason}
                onChange={(e) => setFormData(prev => ({ ...prev, adjustment_reason: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select Reason</option>
                <option value="Pump calibration test">Pump calibration test</option>
                <option value="Quality control sample">Quality control sample</option>
                <option value="Fuel spillage">Fuel spillage</option>
                <option value="Meter testing">Meter testing</option>
                <option value="Other (see notes)">Other (see notes)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Current Shift Readings & Adjustments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pump</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Beginning</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ending</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispensed</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adjustments</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Net Sales</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {readings.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No shift readings found for this date and shift
                  </td>
                </tr>
              ) : (
                readings.map(reading => {
                  const dispensed = reading.ending_reading 
                    ? reading.ending_reading - reading.beginning_reading 
                    : 0
                  const netSales = dispensed - (reading.adjustment_liters || 0)
                  
                  return (
                    <tr key={reading.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {reading.pumps?.pump_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {reading.pumps?.fuel_type}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {reading.beginning_reading?.toFixed(3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {reading.ending_reading?.toFixed(3) || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {dispensed.toFixed(3)} L
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                        {reading.adjustment_liters > 0 ? (
                          <span className="text-orange-600">
                            -{reading.adjustment_liters?.toFixed(3)} L
                          </span>
                        ) : (
                          <span className="text-gray-400">0.000 L</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-semibold text-gray-900">
                        {netSales.toFixed(3)} L
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {reading.adjustment_reason || '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}
