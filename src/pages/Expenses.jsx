import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DollarSign, Search, ShoppingBag, RefreshCw } from 'lucide-react'
import { format, subDays } from 'date-fns'

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('expenses')
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => { fetchData() }, [startDate, endDate])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [expRes, purRes] = await Promise.all([
        supabase.from('expenses')
          .select('*, daily_reports(report_date)')
          .gte('created_at', startDate + 'T00:00:00')
          .lte('created_at', endDate + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase.from('purchases_disbursements')
          .select('*, daily_reports(report_date)')
          .gte('created_at', startDate + 'T00:00:00')
          .lte('created_at', endDate + 'T23:59:59')
          .order('created_at', { ascending: false }),
      ])
      if (!expRes.error) setExpenses(expRes.data || [])
      if (!purRes.error) setPurchases(purRes.data || [])
    } catch (err) {
      console.error('Expenses fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)
  const totalPurchases = purchases.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const items = tab === 'expenses' ? expenses : purchases

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Expenses & Purchases</h1>
          <p className="text-gray-500 text-sm">Track all expenses and disbursements</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-red-50 rounded-lg"><DollarSign size={18} className="text-red-600" /></div>
            <span className="text-sm text-gray-500">Total Expenses</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">₱{totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-1">{expenses.length} entries</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg"><ShoppingBag size={18} className="text-amber-600" /></div>
            <span className="text-sm text-gray-500">Total Purchases/Disbursements</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">₱{totalPurchases.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-gray-400 mt-1">{purchases.length} entries</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('expenses')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'expenses' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Expenses
        </button>
        <button onClick={() => setTab('purchases')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'purchases' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          Purchases / Disbursements
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Date</th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">{tab === 'expenses' ? 'Nature' : 'Particulars'}</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-8 text-gray-400">No records found</td></tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-500">
                    {item.daily_reports?.report_date ? format(new Date(item.daily_reports.report_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-800">{tab === 'expenses' ? item.nature : item.particulars}</td>
                  <td className="py-3 px-4 text-right font-bold text-gray-800">₱{parseFloat(item.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
