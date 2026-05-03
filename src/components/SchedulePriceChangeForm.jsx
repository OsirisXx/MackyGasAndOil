import { useState, useEffect } from 'react'
import { Calendar, Clock, AlertTriangle, Save, X, Fuel } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

export default function SchedulePriceChangeForm({ branchId, pumps, onSuccess, onCancel, editingSchedule }) {
  const { adminUser } = useAuthStore()
  
  // Form state
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [pumpSelectionMode, setPumpSelectionMode] = useState('individual')
  const [selectedPumpIds, setSelectedPumpIds] = useState([])
  const [priceChanges, setPriceChanges] = useState({})
  const [notes, setNotes] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [bulkPrice, setBulkPrice] = useState('')
  const [useBulkPrice, setUseBulkPrice] = useState(false)
  const [selectedFuelType, setSelectedFuelType] = useState('')

  // Initialize form when editing
  useEffect(() => {
    if (editingSchedule) {
      const scheduledAt = new Date(editingSchedule.scheduled_at)
      setScheduledDate(scheduledAt.toISOString().split('T')[0])
      setScheduledTime(scheduledAt.toTimeString().slice(0, 5))
      setSelectedPumpIds(editingSchedule.pump_ids)
      setPriceChanges(editingSchedule.price_changes)
      setNotes(editingSchedule.notes || '')
      setPumpSelectionMode('individual')
    }
  }, [editingSchedule])

  // Update selected pumps based on selection mode
  useEffect(() => {
    if (pumpSelectionMode === 'all') {
      setSelectedPumpIds(pumps.map(p => p.id))
    } else if (pumpSelectionMode === 'by-fuel-type' && selectedFuelType) {
      const filtered = pumps.filter(p => p.fuel_type === selectedFuelType)
      setSelectedPumpIds(filtered.map(p => p.id))
    }
  }, [pumpSelectionMode, selectedFuelType, pumps])

  // Update price changes when bulk price changes
  useEffect(() => {
    if (useBulkPrice && bulkPrice && selectedPumpIds.length > 0) {
      const newPriceChanges = {}
      selectedPumpIds.forEach(pumpId => {
        newPriceChanges[pumpId] = parseFloat(bulkPrice)
      })
      setPriceChanges(newPriceChanges)
    }
  }, [useBulkPrice, bulkPrice, selectedPumpIds])

  const validateDateTime = () => {
    if (!scheduledDate || !scheduledTime) {
      return 'Please select both date and time'
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
    const now = new Date()
    const diffMinutes = (scheduledAt - now) / 1000 / 60

    if (diffMinutes < 1) {
      return 'Scheduled time must be at least 1 minute in the future'
    }

    if (editingSchedule && diffMinutes < 5) {
      return 'Cannot edit schedule within 5 minutes of execution time'
    }

    return null
  }

  const validatePrices = () => {
    if (selectedPumpIds.length === 0) {
      return 'Please select at least one pump'
    }

    for (const pumpId of selectedPumpIds) {
      const price = priceChanges[pumpId]
      if (!price || isNaN(price) || price <= 0) {
        return 'All prices must be positive numbers'
      }
      // Check max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(price.toString())) {
        return 'Prices must have at most 2 decimal places'
      }
    }

    return null
  }

  const checkConflicts = async () => {
    if (!scheduledDate || !scheduledTime || selectedPumpIds.length === 0) {
      return
    }

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString()

    try {
      const { data, error } = await supabase.rpc('check_schedule_conflicts', {
        p_scheduled_at: scheduledAt,
        p_pump_ids: selectedPumpIds,
        p_exclude_schedule_id: editingSchedule?.id || null
      })

      if (error) throw error
      setConflicts(data || [])
    } catch (error) {
      console.error('Error checking conflicts:', error)
    }
  }

  // Check conflicts when schedule time or pumps change
  useEffect(() => {
    const timer = setTimeout(() => {
      checkConflicts()
    }, 500)
    return () => clearTimeout(timer)
  }, [scheduledDate, scheduledTime, selectedPumpIds])

  const handlePumpToggle = (pumpId) => {
    if (pumpSelectionMode !== 'individual') return

    setSelectedPumpIds(prev => {
      if (prev.includes(pumpId)) {
        return prev.filter(id => id !== pumpId)
      } else {
        return [...prev, pumpId]
      }
    })
  }

  const handlePriceChange = (pumpId, value) => {
    setPriceChanges(prev => ({
      ...prev,
      [pumpId]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrors({})

    // Validate datetime
    const dateTimeError = validateDateTime()
    if (dateTimeError) {
      setErrors({ datetime: dateTimeError })
      toast.error(dateTimeError)
      return
    }

    // Validate prices
    const priceError = validatePrices()
    if (priceError) {
      setErrors({ prices: priceError })
      toast.error(priceError)
      return
    }

    setLoading(true)

    try {
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString()

      const scheduleData = {
        scheduled_at: scheduledAt,
        branch_id: branchId,
        pump_ids: selectedPumpIds,
        price_changes: priceChanges,
        notes: notes || null,
        created_by: adminUser?.id || null,
        created_by_name: adminUser?.email || 'Unknown',
        updated_at: new Date().toISOString()
      }

      let result
      if (editingSchedule) {
        // Update existing schedule
        const { data, error } = await supabase
          .from('price_change_schedules')
          .update(scheduleData)
          .eq('id', editingSchedule.id)
          .select()
          .single()

        if (error) throw error
        result = data
        toast.success('Schedule updated successfully')
      } else {
        // Create new schedule
        const { data, error } = await supabase
          .from('price_change_schedules')
          .insert([scheduleData])
          .select()
          .single()

        if (error) throw error
        result = data
        toast.success('Schedule created successfully')
      }

      onSuccess()
    } catch (error) {
      console.error('Error saving schedule:', error)
      toast.error(error.message || 'Failed to save schedule')
    } finally {
      setLoading(false)
    }
  }

  const fuelTypes = [...new Set(pumps.map(p => p.fuel_type))]
  const affectedPumpsCount = selectedPumpIds.length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        {editingSchedule ? 'Edit Scheduled Price Change' : 'Schedule Price Change'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date and Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Target Date *
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Clock className="w-4 h-4 inline mr-1" />
              Target Time *
            </label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>
        </div>

        {errors.datetime && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{errors.datetime}</p>
          </div>
        )}

        {/* Pump Selection Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pump Selection Mode *
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="individual"
                checked={pumpSelectionMode === 'individual'}
                onChange={(e) => setPumpSelectionMode(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Individual Pumps</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="all"
                checked={pumpSelectionMode === 'all'}
                onChange={(e) => setPumpSelectionMode(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">All Pumps</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="by-fuel-type"
                checked={pumpSelectionMode === 'by-fuel-type'}
                onChange={(e) => setPumpSelectionMode(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">By Fuel Type</span>
            </label>
          </div>
        </div>

        {/* Fuel Type Selection (if by-fuel-type mode) */}
        {pumpSelectionMode === 'by-fuel-type' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Fuel Type *
            </label>
            <select
              value={selectedFuelType}
              onChange={(e) => setSelectedFuelType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              <option value="">Choose fuel type...</option>
              {fuelTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        )}

        {/* Pump Selection (if individual mode) */}
        {pumpSelectionMode === 'individual' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Pumps *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {pumps.map(pump => (
                <label key={pump.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedPumpIds.includes(pump.id)}
                    onChange={() => handlePumpToggle(pump.id)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Pump {pump.pump_number} - {pump.fuel_type}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Price Option */}
        {affectedPumpsCount > 0 && (
          <div>
            <label className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={useBulkPrice}
                onChange={(e) => setUseBulkPrice(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Set same price for all selected pumps
              </span>
            </label>

            {useBulkPrice && (
              <input
                type="number"
                step="0.01"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
                placeholder="Enter price for all pumps"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            )}
          </div>
        )}

        {/* Individual Price Inputs */}
        {affectedPumpsCount > 0 && !useBulkPrice && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Prices (₱ per liter) *
            </label>
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {selectedPumpIds.map(pumpId => {
                const pump = pumps.find(p => p.id === pumpId)
                if (!pump) return null
                return (
                  <div key={pumpId} className="flex items-center gap-3">
                    <div className="flex-1">
                      <span className="text-sm text-gray-700">
                        Pump {pump.pump_number} - {pump.fuel_type}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        (Current: ₱{parseFloat(pump.price_per_liter).toFixed(2)})
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={priceChanges[pumpId] || ''}
                      onChange={(e) => handlePriceChange(pumpId, e.target.value)}
                      placeholder="0.00"
                      className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      required
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {errors.prices && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{errors.prices}</p>
          </div>
        )}

        {/* Summary */}
        {affectedPumpsCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <Fuel className="w-4 h-4 inline mr-1" />
              <strong>{affectedPumpsCount}</strong> pump{affectedPumpsCount !== 1 ? 's' : ''} will be affected by this schedule
            </p>
          </div>
        )}

        {/* Conflict Warning */}
        {conflicts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 mb-2">
                  Scheduling Conflict Detected
                </p>
                <p className="text-sm text-amber-700 mb-2">
                  The following schedules overlap with your selected time:
                </p>
                <ul className="space-y-1">
                  {conflicts.map(conflict => (
                    <li key={conflict.schedule_id} className="text-sm text-amber-700">
                      • {new Date(conflict.scheduled_at).toLocaleString()} 
                      {conflict.created_by_name && ` by ${conflict.created_by_name}`}
                      {conflict.time_diff_minutes && ` (${Math.abs(conflict.time_diff_minutes)} min ${conflict.time_diff_minutes > 0 ? 'later' : 'earlier'})`}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-600 mt-2">
                  You can still proceed, but be aware of potential conflicts.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add any notes about this price change..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4">
          <button
            type="submit"
            disabled={loading || affectedPumpsCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4 inline mr-1" />
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
