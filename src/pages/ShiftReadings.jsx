import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { getShiftsForBranch, formatShiftTime } from '../utils/shiftConfig'
import { format } from 'date-fns'
import { 
  Gauge, Save, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Play, Square, RefreshCw, Unlock, Lock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function ShiftReadings() {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { branches, selectedBranchId } = useBranchStore()
  const [shiftDate, setShiftDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedShift, setSelectedShift] = useState(1)
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [unlockedReadings, setUnlockedReadings] = useState(new Set())

  // Get branch-specific shifts
  const selectedBranch = branches.find(b => b.id === selectedBranchId)
  const SHIFTS = useMemo(() => getShiftsForBranch(selectedBranch?.name), [selectedBranch?.name])

  useEffect(() => { fetchFuelTypes() }, [])
  useEffect(() => { fetchReadings() }, [shiftDate, selectedShift, selectedBranchId])

  const fetchReadings = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('shift_fuel_readings')
        .select('*, fuel_types(name, short_code, current_price), cashiers(full_name)')
        .eq('shift_date', shiftDate)
        .eq('shift_number', selectedShift)
        .order('created_at')
      
      if (selectedBranchId) query = query.eq('branch_id', selectedBranchId)
      
      const { data, error } = await query
      if (error) {
        console.warn('shift_fuel_readings table may not exist:', error.message)
        setReadings([])
      } else {
        setReadings(data || [])
        const form = {}
        data?.forEach(r => {
          form[r.fuel_type_id] = {
            beginning_reading: r.beginning_reading || '',
            ending_reading: r.ending_reading || '',
            adjustment_liters: r.adjustment_liters || 0,
            adjustment_reason: r.adjustment_reason || '',
          }
        })
        setEditForm(form)
      }
    } catch (err) {
      console.error('ShiftReadings fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getReadingForFuel = (fuelId) => readings.find(r => r.fuel_type_id === fuelId)

  const handleStartShift = async (fuelId) => {
    const fuel = fuelTypes.find(f => f.id === fuelId)
    const beginReading = parseFloat(editForm[fuelId]?.beginning_reading)
    if (isNaN(beginReading)) return toast.error('Enter a valid beginning reading')

    setSaving(true)
    const { data, error } = await supabase
      .from('shift_fuel_readings')
      .insert({
        branch_id: selectedBranchId || null,
        shift_date: shiftDate,
        shift_number: selectedShift,
        fuel_type_id: fuelId,
        beginning_reading: beginReading,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      toast.error(error.message)
    } else {
      toast.success(`Started tracking ${fuel?.short_code}`)
      logAudit('create', 'shift_reading', `Started shift reading for ${fuel?.short_code}: ${beginReading}`, {
        entityId: data.id,
        newValues: { beginning_reading: beginReading, shift_number: selectedShift },
        branchId: selectedBranchId,
      })
      fetchReadings()
    }
    setSaving(false)
  }

  const handleEndShift = async (fuelId) => {
    const reading = getReadingForFuel(fuelId)
    if (!reading) return
    
    const endReading = parseFloat(editForm[fuelId]?.ending_reading)
    if (isNaN(endReading)) return toast.error('Enter a valid ending reading')
    if (endReading < reading.beginning_reading) return toast.error('Ending reading cannot be less than beginning')

    setSaving(true)
    const { error } = await supabase
      .from('shift_fuel_readings')
      .update({
        ending_reading: endReading,
        adjustment_liters: parseFloat(editForm[fuelId]?.adjustment_liters) || 0,
        adjustment_reason: editForm[fuelId]?.adjustment_reason || null,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', reading.id)

    if (error) {
      toast.error(error.message)
    } else {
      const liters = endReading - reading.beginning_reading
      toast.success(`Closed: ${liters.toFixed(3)} liters dispensed`)
      logAudit('update', 'shift_reading', `Closed shift reading: ${reading.fuel_types?.short_code} - ${liters.toFixed(3)}L`, {
        entityId: reading.id,
        oldValues: { ending_reading: null },
        newValues: { ending_reading: endReading, liters_dispensed: liters },
        branchId: selectedBranchId,
      })
      fetchReadings()
    }
    setSaving(false)
  }

  const handleUpdateReading = async (fuelId) => {
    const reading = getReadingForFuel(fuelId)
    if (!reading) return

    const beginReading = parseFloat(editForm[fuelId]?.beginning_reading)
    const endReading = editForm[fuelId]?.ending_reading ? parseFloat(editForm[fuelId]?.ending_reading) : null

    if (isNaN(beginReading)) return toast.error('Invalid beginning reading')
    if (endReading !== null && endReading < beginReading) return toast.error('Ending cannot be less than beginning')

    setSaving(true)
    const { error } = await supabase
      .from('shift_fuel_readings')
      .update({
        beginning_reading: beginReading,
        ending_reading: endReading,
        adjustment_liters: parseFloat(editForm[fuelId]?.adjustment_liters) || 0,
        adjustment_reason: editForm[fuelId]?.adjustment_reason || null,
      })
      .eq('id', reading.id)

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Reading updated')
      logAudit('update', 'shift_reading', `Updated shift reading for ${reading.fuel_types?.short_code}`, {
        entityId: reading.id,
        newValues: { beginning_reading: beginReading, ending_reading: endReading },
        branchId: selectedBranchId,
      })
      fetchReadings()
    }
    setSaving(false)
  }

  const handleUnlock = (fuelId) => {
    const reading = getReadingForFuel(fuelId)
    if (!reading) return
    setUnlockedReadings(prev => new Set([...prev, fuelId]))
    logAudit('unlock', 'shift_reading', `Unlocked closed shift reading for editing: ${reading.fuel_types?.short_code}`, {
      entityId: reading.id,
      branchId: selectedBranchId,
    })
    toast.success('Reading unlocked for editing')
  }

  const handleLock = async (fuelId) => {
    const reading = getReadingForFuel(fuelId)
    if (!reading) return
    
    // Save any changes before locking
    const beginReading = parseFloat(editForm[fuelId]?.beginning_reading)
    const endReading = parseFloat(editForm[fuelId]?.ending_reading)
    
    if (isNaN(beginReading) || isNaN(endReading)) {
      return toast.error('Both readings are required')
    }
    if (endReading < beginReading) {
      return toast.error('Ending cannot be less than beginning')
    }

    setSaving(true)
    const { error } = await supabase
      .from('shift_fuel_readings')
      .update({
        beginning_reading: beginReading,
        ending_reading: endReading,
        adjustment_liters: parseFloat(editForm[fuelId]?.adjustment_liters) || 0,
        adjustment_reason: editForm[fuelId]?.adjustment_reason || null,
      })
      .eq('id', reading.id)

    if (error) {
      toast.error(error.message)
    } else {
      const liters = endReading - beginReading
      toast.success('Reading saved and locked')
      logAudit('update', 'shift_reading', `Edited and locked shift reading: ${reading.fuel_types?.short_code} - ${liters.toFixed(3)}L`, {
        entityId: reading.id,
        oldValues: { beginning_reading: reading.beginning_reading, ending_reading: reading.ending_reading },
        newValues: { beginning_reading: beginReading, ending_reading: endReading },
        branchId: selectedBranchId,
      })
      setUnlockedReadings(prev => {
        const next = new Set(prev)
        next.delete(fuelId)
        return next
      })
      fetchReadings()
    }
    setSaving(false)
  }

  // Calculate totals
  const totalLiters = readings.reduce((s, r) => s + parseFloat(r.liters_dispensed || 0), 0)
  const totalValue = readings.reduce((s, r) => {
    const fuel = fuelTypes.find(f => f.id === r.fuel_type_id)
    const liters = parseFloat(r.liters_dispensed || 0)
    const price = parseFloat(fuel?.current_price || 0)
    return s + (liters * price)
  }, 0)
  const openCount = readings.filter(r => r.status === 'open').length
  const closedCount = readings.filter(r => r.status === 'closed').length

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Shift Readings</h1>
          <p className="text-gray-500 text-sm">Record beginning and ending meter readings per shift</p>
        </div>
        <button onClick={fetchReadings} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Date & Shift Selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)}
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
          <div className="text-xs text-gray-400">
            {formatShiftTime(SHIFTS.find(s => s.number === selectedShift) || SHIFTS[0])}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Total Liters</p>
          <p className="text-xl font-bold text-blue-700">{totalLiters.toLocaleString('en-PH', { minimumFractionDigits: 3 })} L</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Total Value</p>
          <p className="text-xl font-bold text-green-700">₱{totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Open</p>
          <p className="text-xl font-bold text-amber-600">{openCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">Closed</p>
          <p className="text-xl font-bold text-gray-600">{closedCount}</p>
        </div>
      </div>

      {/* Fuel Readings */}
      <div className="space-y-4">
        {fuelTypes.map(fuel => {
          const reading = getReadingForFuel(fuel.id)
          const isOpen = reading?.status === 'open'
          const isClosed = reading?.status === 'closed'
          const isUnlocked = unlockedReadings.has(fuel.id)
          const isEditable = isOpen || isUnlocked
          const form = editForm[fuel.id] || { beginning_reading: '', ending_reading: '', adjustment_liters: 0, adjustment_reason: '' }

          return (
            <div key={fuel.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isClosed ? 'bg-green-50' : isOpen ? 'bg-amber-50' : 'bg-gray-50'}`}>
                      <Gauge size={20} className={isClosed ? 'text-green-600' : isOpen ? 'text-amber-600' : 'text-gray-400'} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{fuel.name}</h3>
                      <p className="text-xs text-gray-400">{fuel.short_code} • ₱{parseFloat(fuel.current_price).toFixed(2)}/L</p>
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

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  {/* Beginning Reading */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Beginning Reading</label>
                    <input
                      type="number"
                      step="0.001"
                      value={form.beginning_reading}
                      onChange={e => setEditForm(p => ({ ...p, [fuel.id]: { ...p[fuel.id], beginning_reading: e.target.value } }))}
                      disabled={!isEditable && reading}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="0.000"
                    />
                  </div>

                  {/* Ending Reading */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Ending Reading</label>
                    <input
                      type="number"
                      step="0.001"
                      value={form.ending_reading}
                      onChange={e => setEditForm(p => ({ ...p, [fuel.id]: { ...p[fuel.id], ending_reading: e.target.value } }))}
                      disabled={!reading || (!isEditable)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="0.000"
                    />
                  </div>

                  {/* Liters Dispensed */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Liters Dispensed</label>
                    <div className="px-3 py-2 bg-blue-50 rounded-lg text-sm font-bold text-blue-700 font-mono">
                      {reading?.liters_dispensed ? parseFloat(reading.liters_dispensed).toFixed(3) : '—'} L
                    </div>
                  </div>

                  {/* Price Per Liter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price/Liter</label>
                    <div className="px-3 py-2 bg-purple-50 rounded-lg text-sm font-bold text-purple-700 font-mono">
                      ₱{fuel.current_price ? parseFloat(fuel.current_price).toFixed(2) : '—'}
                    </div>
                  </div>

                  {/* Total Value */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Total Value</label>
                    <div className="px-3 py-2 bg-green-50 rounded-lg text-sm font-bold text-green-700">
                      ₱{reading?.liters_dispensed && fuel.current_price ? (parseFloat(reading.liters_dispensed) * parseFloat(fuel.current_price)).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '—'}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4">
                  {!reading && (
                    <button
                      onClick={() => handleStartShift(fuel.id)}
                      disabled={saving || !form.beginning_reading}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Play size={14} /> Start Tracking
                    </button>
                  )}
                  {isOpen && (
                    <>
                      <button
                        onClick={() => handleEndShift(fuel.id)}
                        disabled={saving || !form.ending_reading}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Square size={14} /> Close Shift
                      </button>
                      <button
                        onClick={() => handleUpdateReading(fuel.id)}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Save size={14} /> Save
                      </button>
                    </>
                  )}
                  {isClosed && !isUnlocked && (
                    <>
                      <button
                        onClick={() => handleUnlock(fuel.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Unlock size={14} /> Unlock to Edit
                      </button>
                      <p className="text-xs text-gray-400">
                        Closed at {reading.closed_at ? format(new Date(reading.closed_at), 'h:mm a') : '—'}
                      </p>
                    </>
                  )}
                  {isClosed && isUnlocked && (
                    <>
                      <button
                        onClick={() => handleLock(fuel.id)}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Lock size={14} /> Save & Lock
                      </button>
                      <span className="text-xs text-amber-600 font-medium">Editing unlocked</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {fuelTypes.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
          No fuel types configured. Add fuel types in Fuel Management first.
        </div>
      )}
    </div>
  )
}
