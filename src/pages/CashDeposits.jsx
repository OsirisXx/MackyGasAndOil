import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useBranchStore } from '../stores/branchStore'
import { format } from 'date-fns'
import { Vault, Calendar, Filter, Edit2, Trash2, Save, X, Search, DollarSign, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function CashDeposits() {
  const { branches, selectedBranchId } = useBranchStore()
  const [deposits, setDeposits] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [cashiers, setCashiers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedCashier, setSelectedCashier] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('deposits')

  useEffect(() => {
    fetchCashiers()
    fetchDeposits()
    fetchWithdrawals()
  }, [selectedBranchId, selectedDate, selectedCashier])

  const fetchCashiers = async () => {
    const query = supabase.from('cashiers').select('id, full_name').order('full_name')
    if (selectedBranchId) query.eq('branch_id', selectedBranchId)
    const { data } = await query
    setCashiers(data || [])
  }

  const fetchDeposits = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('cash_deposits')
        .select(`
          *,
          cashiers(full_name),
          branches(name)
        `)
        .order('deposit_date', { ascending: false })

      if (selectedBranchId) {
        query = query.eq('branch_id', selectedBranchId)
      }

      if (selectedDate) {
        query = query
          .gte('deposit_date', (() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y,m-1,d,0,0,0,0).toISOString() })())
          .lte('deposit_date', (() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y,m-1,d,23,59,59,999).toISOString() })())
      }

      if (selectedCashier) {
        query = query.eq('cashier_id', selectedCashier)
      }

      const { data, error } = await query
      if (error) throw error
      setDeposits(data || [])
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchWithdrawals = async () => {
    try {
      let query = supabase
        .from('cash_withdrawals')
        .select(`
          *,
          cashiers(full_name),
          branches(name)
        `)
        .order('withdrawal_date', { ascending: false })

      if (selectedBranchId) {
        query = query.eq('branch_id', selectedBranchId)
      }

      if (selectedDate) {
        query = query
          .gte('withdrawal_date', (() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y,m-1,d,0,0,0,0).toISOString() })())
          .lte('withdrawal_date', (() => { const [y,m,d] = selectedDate.split('-').map(Number); return new Date(y,m-1,d,23,59,59,999).toISOString() })())
      }

      if (selectedCashier) {
        query = query.eq('cashier_id', selectedCashier)
      }

      const { data, error } = await query
      if (error) throw error
      setWithdrawals(data || [])
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEdit = (deposit) => {
    setEditingId(deposit.id)
    setEditForm({
      amount: deposit.amount,
      notes: deposit.notes || '',
      deposit_date: format(new Date(deposit.deposit_date), "yyyy-MM-dd'T'HH:mm")
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleSaveEdit = async (id) => {
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) {
      return toast.error('Please enter a valid amount')
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('cash_deposits')
        .update({
          amount: parseFloat(editForm.amount),
          notes: editForm.notes || null,
          deposit_date: editForm.deposit_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error
      toast.success('Deposit updated successfully')
      logAudit('update', 'cash_deposit', `Updated cash deposit to ₱${parseFloat(editForm.amount).toFixed(2)}`, {
        entityId: id,
        newValues: editForm
      })
      setEditingId(null)
      setEditForm({})
      fetchDeposits()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, amount) => {
    if (!confirm(`Delete this ₱${parseFloat(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} deposit?`)) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('cash_deposits')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Deposit deleted')
      logAudit('delete', 'cash_deposit', `Deleted cash deposit of ₱${parseFloat(amount).toFixed(2)}`, {
        entityId: id
      })
      fetchDeposits()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const totalDeposits = deposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0)
  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
  const netVaultBalance = totalDeposits - totalWithdrawals

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Vault size={28} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">Vault Management</h1>
        </div>
        <p className="text-sm text-gray-500">Track cash deposits and withdrawals from the vault</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cashier</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedCashier}
                onChange={(e) => setSelectedCashier(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              >
                <option value="">All Cashiers</option>
                {cashiers.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
            <select
              value={selectedBranchId || ''}
              onChange={(e) => useBranchStore.setState({ selectedBranchId: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Total Deposits */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Vault size={20} />
            </div>
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{deposits.length}</span>
          </div>
          <p className="text-blue-100 text-xs mb-1">Total Deposits</p>
          <p className="text-2xl font-bold">₱{totalDeposits.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-blue-100 text-[10px] mt-1">Cash added to vault</p>
        </div>

        {/* Total Withdrawals */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{withdrawals.length}</span>
          </div>
          <p className="text-orange-100 text-xs mb-1">Total Withdrawals</p>
          <p className="text-2xl font-bold">₱{totalWithdrawals.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-orange-100 text-[10px] mt-1">Cash taken from vault</p>
        </div>

        {/* Net Vault Balance */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Receipt size={20} />
            </div>
          </div>
          <p className="text-green-100 text-xs mb-1">Net Vault Balance</p>
          <p className="text-2xl font-bold">₱{netVaultBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-green-100 text-[10px] mt-1">Deposits - Withdrawals</p>
        </div>

        {/* Transaction Count */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Receipt size={18} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Transactions</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Deposits</span>
              <span className="font-semibold text-blue-600">{deposits.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Withdrawals</span>
              <span className="font-semibold text-orange-600">{withdrawals.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t">
              <span className="text-gray-700 font-medium">Total</span>
              <span className="font-bold text-gray-800">{deposits.length + withdrawals.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('deposits')}
            className={`flex-1 px-6 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'deposits'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Deposits ({deposits.length})
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`flex-1 px-6 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'withdrawals'
                ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Withdrawals ({withdrawals.length})
          </button>
        </div>
      </div>

      {/* Deposits Table */}
      {activeTab === 'deposits' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cashier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Branch</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-sm text-gray-400">
                      Loading deposits...
                    </td>
                  </tr>
                ) : deposits.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-sm text-gray-400">
                      No deposits found for the selected filters
                    </td>
                  </tr>
                ) : (
                  deposits.map(deposit => (
                  <tr key={deposit.id} className="hover:bg-gray-50">
                    {editingId === deposit.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="datetime-local"
                            value={editForm.deposit_date}
                            onChange={(e) => setEditForm({ ...editForm, deposit_date: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {deposit.cashiers?.full_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {deposit.branches?.name || 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editForm.notes}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Notes..."
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(deposit.id)}
                              disabled={saving}
                              className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={saving}
                              className="p-1.5 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-800">
                          {format(new Date(deposit.deposit_date), 'MMM d, yyyy h:mm a')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                          {deposit.cashiers?.full_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {deposit.branches?.name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">
                          ₱{parseFloat(deposit.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {deposit.notes || <span className="text-gray-400 italic">No notes</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(deposit)}
                              className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(deposit.id, deposit.amount)}
                              className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Withdrawals Table */}
      {activeTab === 'withdrawals' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cashier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Branch</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-sm text-gray-400">
                      Loading withdrawals...
                    </td>
                  </tr>
                ) : withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-sm text-gray-400">
                      No withdrawals found for the selected filters
                    </td>
                  </tr>
                ) : (
                  withdrawals.map(withdrawal => (
                    <tr key={withdrawal.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {format(new Date(withdrawal.withdrawal_date), 'MMM d, yyyy h:mm a')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                        {withdrawal.cashiers?.full_name || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {withdrawal.branches?.name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-orange-600">
                        ₱{parseFloat(withdrawal.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {withdrawal.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {withdrawal.notes || <span className="text-gray-400 italic">No notes</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
