import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFuelStore } from '../stores/fuelStore'
import { Receipt, Search, Calendar, Filter } from 'lucide-react'
import { format, subDays } from 'date-fns'

export default function ChargeInvoices() {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => { fetchFuelTypes() }, [])

  useEffect(() => {
    fetchInvoices()
  }, [startDate, endDate])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('charge_invoices')
        .select('*, daily_reports(report_date, shifts(shift_number))')
        .gte('created_at', startDate + 'T00:00:00')
        .lte('created_at', endDate + 'T23:59:59')
        .order('created_at', { ascending: false })
      if (!error) setInvoices(data || [])
    } catch (err) {
      console.error('ChargeInvoices fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = invoices.filter(i =>
    i.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.ci_number || '').toLowerCase().includes(search.toLowerCase())
  )

  const total = filtered.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0)

  const getFuelCode = (fuelId) => {
    const ft = fuelTypes.find(f => f.id === fuelId)
    return ft?.short_code || '—'
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Charge Invoices</h1>
        <p className="text-gray-500 text-sm">View all charge invoice (A/R) transactions</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer or CI no..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
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

      {/* Summary */}
      <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">{filtered.length} invoices found</span>
        </div>
        <span className="text-lg font-bold text-blue-800">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Date</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">CI No.</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Customer</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Fuel</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No charge invoices found</td></tr>
              ) : (
                filtered.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-500">
                      {inv.daily_reports?.report_date ? format(new Date(inv.daily_reports.report_date), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono">{inv.ci_number || '—'}</td>
                    <td className="py-3 px-4 font-medium text-gray-800">{inv.customer_name}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{getFuelCode(inv.fuel_type_id)}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">₱{parseFloat(inv.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
