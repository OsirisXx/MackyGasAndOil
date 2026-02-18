import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, Plus, Edit2, X, Save, Trash2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { useBranchStore } from '../stores/branchStore'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

const DEFAULT_SHIFTS = [
  { shift_number: 1, label: 'Shift 1', start_time: '06:00', end_time: '14:00' },
  { shift_number: 2, label: 'Shift 2', start_time: '14:00', end_time: '22:00' },
  { shift_number: 3, label: 'Shift 3', start_time: '22:00', end_time: '06:00' },
]

export default function BranchManagement() {
  const { fetchBranches } = useBranchStore()
  const [branches, setBranches] = useState([])
  const [branchShifts, setBranchShifts] = useState({})
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', address: '' })
  const [expandedBranch, setExpandedBranch] = useState(null)
  const [shiftForm, setShiftForm] = useState({ shift_number: '', label: '', start_time: '', end_time: '' })
  const [editingShiftId, setEditingShiftId] = useState(null)
  const [savingShift, setSavingShift] = useState(false)

  useEffect(() => { loadBranches() }, [])

  const loadBranches = async () => {
    setLoading(true)
    try {
      const [branchRes, shiftRes] = await Promise.all([
        supabase.from('branches').select('*').order('name'),
        supabase.from('branch_shifts').select('*').eq('is_active', true).order('shift_number'),
      ])
      if (branchRes.error) {
        toast.error('Failed to load branches: ' + branchRes.error.message)
      } else {
        setBranches(branchRes.data || [])
      }
      // Group shifts by branch_id
      const grouped = {}
      ;(shiftRes.data || []).forEach(s => {
        if (!grouped[s.branch_id]) grouped[s.branch_id] = []
        grouped[s.branch_id].push(s)
      })
      setBranchShifts(grouped)
    } catch (err) {
      console.error('Branch fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({ name: '', address: '' })
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Branch name is required')

    if (editingId) {
      const { error } = await supabase
        .from('branches')
        .update({ name: form.name, address: form.address })
        .eq('id', editingId)
      if (error) return toast.error(error.message)
      toast.success('Branch updated')
      logAudit('update', 'branch', `Updated branch: ${form.name}`, { entityId: editingId, newValues: form })
    } else {
      const { data, error } = await supabase
        .from('branches')
        .insert({ name: form.name, address: form.address })
        .select()
        .single()
      if (error) return toast.error(error.message)
      // Auto-create default shifts for the new branch
      const defaultShifts = DEFAULT_SHIFTS.map(s => ({ ...s, branch_id: data.id }))
      await supabase.from('branch_shifts').insert(defaultShifts)
      toast.success('Branch created with default shifts')
      logAudit('create', 'branch', `Created branch: ${form.name}`, { entityId: data?.id, newValues: form })
    }
    resetForm()
    loadBranches()
    fetchBranches()
  }

  const startEdit = (b) => {
    setForm({ name: b.name, address: b.address || '' })
    setEditingId(b.id)
    setShowForm(true)
  }

  const handleToggleActive = async (id, currentActive) => {
    const { error } = await supabase
      .from('branches')
      .update({ is_active: !currentActive })
      .eq('id', id)
    if (error) return toast.error(error.message)
    toast.success(currentActive ? 'Branch deactivated' : 'Branch activated')
    logAudit('update', 'branch', currentActive ? 'Deactivated branch' : 'Activated branch', { entityId: id })
    loadBranches()
    fetchBranches()
  }

  // --- Shift Management ---
  const resetShiftForm = () => {
    setShiftForm({ shift_number: '', label: '', start_time: '', end_time: '' })
    setEditingShiftId(null)
  }

  const startEditShift = (shift) => {
    setShiftForm({
      shift_number: shift.shift_number,
      label: shift.label,
      start_time: shift.start_time?.slice(0, 5) || '',
      end_time: shift.end_time?.slice(0, 5) || '',
    })
    setEditingShiftId(shift.id)
  }

  const handleSaveShift = async (branchId) => {
    if (!shiftForm.shift_number || !shiftForm.label.trim() || !shiftForm.start_time || !shiftForm.end_time) {
      return toast.error('All shift fields are required')
    }
    setSavingShift(true)
    try {
      if (editingShiftId) {
        const { error } = await supabase
          .from('branch_shifts')
          .update({
            shift_number: parseInt(shiftForm.shift_number),
            label: shiftForm.label,
            start_time: shiftForm.start_time,
            end_time: shiftForm.end_time,
          })
          .eq('id', editingShiftId)
        if (error) throw error
        toast.success('Shift updated')
        logAudit('update', 'branch_shift', `Updated shift: ${shiftForm.label}`, { entityId: editingShiftId })
      } else {
        const { error } = await supabase
          .from('branch_shifts')
          .insert({
            branch_id: branchId,
            shift_number: parseInt(shiftForm.shift_number),
            label: shiftForm.label,
            start_time: shiftForm.start_time,
            end_time: shiftForm.end_time,
          })
        if (error) throw error
        toast.success('Shift added')
        logAudit('create', 'branch_shift', `Created shift: ${shiftForm.label} for branch`, { branchId })
      }
      resetShiftForm()
      loadBranches()
    } catch (err) {
      toast.error(err.message || 'Failed to save shift')
    } finally {
      setSavingShift(false)
    }
  }

  const handleDeleteShift = async (shiftId) => {
    if (!confirm('Remove this shift?')) return
    const { error } = await supabase.from('branch_shifts').update({ is_active: false }).eq('id', shiftId)
    if (error) return toast.error(error.message)
    toast.success('Shift removed')
    loadBranches()
  }

  const formatTime = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${h12}:${m} ${ampm}`
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Branch Management</h1>
          <p className="text-gray-500 text-sm">Manage branches and shift schedules</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Add Branch
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Branch' : 'New Branch'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Branch Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Main Branch" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 123 Main St, City" />
              </div>
              <button type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                <Save size={16} /> {editingId ? 'Update Branch' : 'Create Branch'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Branch List */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">Loading branches...</div>
        ) : branches.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400">No branches found. Add your first branch above.</div>
        ) : branches.map(b => (
          <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Branch Header */}
            <div className="px-4 py-4 flex items-center gap-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => setExpandedBranch(expandedBranch === b.id ? null : b.id)}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${b.is_active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                <Building2 size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800">{b.name}</p>
                <p className="text-xs text-gray-400">
                  {b.address || 'No address'}
                  {branchShifts[b.id]?.length > 0 && (
                    <span className="ml-2 text-blue-500">• {branchShifts[b.id].length} shift{branchShifts[b.id].length > 1 ? 's' : ''}</span>
                  )}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {b.is_active ? 'Active' : 'Inactive'}
              </span>
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => startEdit(b)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleToggleActive(b.id, b.is_active)}
                  className={`p-2 rounded-lg ${b.is_active ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                  title={b.is_active ? 'Deactivate' : 'Activate'}>
                  <Trash2 size={16} />
                </button>
              </div>
              {expandedBranch === b.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </div>

            {/* Shift Management (expanded) */}
            {expandedBranch === b.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Clock size={14} /> Shift Schedule
                  </h3>
                </div>

                {/* Existing Shifts */}
                <div className="space-y-2 mb-4">
                  {(branchShifts[b.id] || []).length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">No shifts configured. Add shifts below.</p>
                  ) : (branchShifts[b.id] || []).map(shift => (
                    <div key={shift.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
                        {shift.shift_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700">{shift.label}</p>
                        <p className="text-xs text-gray-400">{formatTime(shift.start_time)} — {formatTime(shift.end_time)}</p>
                      </div>
                      <button onClick={() => startEditShift(shift)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteShift(shift.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add/Edit Shift Form */}
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">{editingShiftId ? 'Edit Shift' : 'Add New Shift'}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <input type="number" placeholder="#" min="1" max="10"
                      value={shiftForm.shift_number}
                      onChange={e => setShiftForm(p => ({ ...p, shift_number: e.target.value }))}
                      className="px-2 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input type="text" placeholder="Label (e.g. Shift 1)"
                      value={shiftForm.label}
                      onChange={e => setShiftForm(p => ({ ...p, label: e.target.value }))}
                      className="px-2 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input type="time"
                      value={shiftForm.start_time}
                      onChange={e => setShiftForm(p => ({ ...p, start_time: e.target.value }))}
                      className="px-2 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input type="time"
                      value={shiftForm.end_time}
                      onChange={e => setShiftForm(p => ({ ...p, end_time: e.target.value }))}
                      className="px-2 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-1">
                      <button onClick={() => handleSaveShift(b.id)} disabled={savingShift}
                        className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                        <Save size={12} /> {editingShiftId ? 'Update' : 'Add'}
                      </button>
                      {editingShiftId && (
                        <button onClick={resetShiftForm}
                          className="px-2 py-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-lg text-xs">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
