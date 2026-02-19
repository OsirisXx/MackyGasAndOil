import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, Plus, Edit2, X, Save, Trash2, Clock, ToggleLeft, ToggleRight } from 'lucide-react'
import { useBranchStore } from '../stores/branchStore'
import { getShiftsForBranch, formatShiftTime } from '../utils/shiftConfig'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function BranchManagement() {
  const { fetchBranches } = useBranchStore()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', address: '' })

  useEffect(() => { loadBranches() }, [])

  const loadBranches = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name')
      if (error) {
        toast.error('Failed to load branches: ' + error.message)
      } else {
        setBranches(data || [])
      }
    } catch (err) {
      console.error('BranchManagement fetch error:', err)
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
      toast.success('Branch created')
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

  const handleDelete = async (branch) => {
    // Check if branch has linked cashiers
    const { count } = await supabase
      .from('cashiers')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branch.id)
    
    if (count > 0) {
      toast.error(`Cannot delete "${branch.name}" - it has ${count} cashier(s) assigned. Reassign or remove them first, or deactivate the branch instead.`)
      return
    }

    if (!confirm(`Are you sure you want to delete "${branch.name}"? This action cannot be undone.`)) return
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branch.id)
    if (error) return toast.error(error.message)
    toast.success('Branch deleted')
    logAudit('delete', 'branch', `Deleted branch: ${branch.name}`, { entityId: branch.id })
    loadBranches()
    fetchBranches()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Branch Management</h1>
          <p className="text-gray-500 text-sm">Manage your gas station branches</p>
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading branches...</div>
        ) : branches.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No branches found. Add your first branch above.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {branches.map(b => (
              <div key={b.id} className="px-4 py-4 hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${b.is_active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <Building2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{b.name}</p>
                    <p className="text-xs text-gray-400">{b.address || 'No address'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {b.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(b)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleToggleActive(b.id, b.is_active)}
                      className={`p-2 rounded-lg ${b.is_active ? 'text-green-500 hover:text-orange-600 hover:bg-orange-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                      title={b.is_active ? 'Deactivate' : 'Activate'}>
                      {b.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => handleDelete(b)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {/* Shift Times */}
                <div className="mt-3 ml-14 flex items-start gap-2">
                  <Clock size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex flex-wrap gap-2">
                    {getShiftsForBranch(b.name).map(shift => (
                      <span key={shift.number} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                        <span className="font-medium">{shift.label}:</span> {formatShiftTime(shift)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
