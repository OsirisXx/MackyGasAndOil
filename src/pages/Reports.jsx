import { useEffect, useState } from 'react'
import { useBranchStore } from '../stores/branchStore'
import { supabase } from '../lib/supabase'
import { TrendingUp, Calendar, Download, Fuel, DollarSign, Receipt, ShoppingBag, Users, RefreshCw } from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns'

export default function Reports() {
  const { selectedBranchId, initialized } = useBranchStore()
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dailyData, setDailyData] = useState([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({
    totalCashSales: 0, totalPurchaseOrders: 0, totalUnpaidPOs: 0,
    cashSalesCount: 0, poCount: 0, uniqueCashiers: 0,
  })

  useEffect(() => { if (initialized) fetchReports() }, [startDate, endDate, selectedBranchId, initialized])

  const fetchReports = async () => {
    setLoading(true)
    const start = startDate + 'T00:00:00'
    const end = endDate + 'T23:59:59'

    // Fetch cash sales
    let salesQ = supabase.from('cash_sales').select('*, cashiers(full_name), fuel_types(short_code)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
    if (selectedBranchId) salesQ = salesQ.eq('branch_id', selectedBranchId)
    const { data: cashSales } = await salesQ

    // Fetch purchase orders
    let poQ = supabase.from('purchase_orders').select('*, cashiers(full_name), fuel_types(short_code)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
    if (selectedBranchId) poQ = poQ.eq('branch_id', selectedBranchId)
    const { data: purchaseOrders } = await poQ

    const sales = cashSales || []
    const pos = purchaseOrders || []

    // Calculate summary
    const totalCashSales = sales.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
    const totalPurchaseOrders = pos.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
    const totalUnpaidPOs = pos.filter(p => p.status === 'unpaid').reduce((s, r) => s + parseFloat(r.amount || 0), 0)
    const uniqueCashiers = new Set([...sales.map(s => s.cashier_id), ...pos.map(p => p.cashier_id)]).size

    setSummary({
      totalCashSales,
      totalPurchaseOrders,
      totalUnpaidPOs,
      cashSalesCount: sales.length,
      poCount: pos.length,
      uniqueCashiers,
    })

    // Group by date
    const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
    const grouped = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const daySales = sales.filter(s => s.created_at.startsWith(dateStr))
      const dayPOs = pos.filter(p => p.created_at.startsWith(dateStr))
      return {
        date: dateStr,
        cashSales: daySales.reduce((s, r) => s + parseFloat(r.amount || 0), 0),
        purchaseOrders: dayPOs.reduce((s, r) => s + parseFloat(r.amount || 0), 0),
        cashSalesCount: daySales.length,
        poCount: dayPOs.length,
        total: daySales.reduce((s, r) => s + parseFloat(r.amount || 0), 0) + dayPOs.reduce((s, r) => s + parseFloat(r.amount || 0), 0),
      }
    }).filter(d => d.cashSalesCount > 0 || d.poCount > 0).reverse()

    setDailyData(grouped)
    setLoading(false)
  }

  const setPreset = (preset) => {
    const now = new Date()
    switch (preset) {
      case 'today':
        setStartDate(format(now, 'yyyy-MM-dd'))
        setEndDate(format(now, 'yyyy-MM-dd'))
        break
      case 'week':
        setStartDate(format(subDays(now, 7), 'yyyy-MM-dd'))
        setEndDate(format(now, 'yyyy-MM-dd'))
        break
      case 'month':
        setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'))
        setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'))
        break
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
          <p className="text-gray-500 text-sm">Sales and accountability summary reports</p>
        </div>
        <button onClick={fetchReports} disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
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
        <div className="flex gap-1">
          {['today', 'week', 'month'].map(p => (
            <button key={p} onClick={() => setPreset(p)}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors capitalize">
              {p === 'week' ? '7 Days' : p === 'month' ? 'This Month' : 'Today'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Cash Sales', value: summary.totalCashSales, icon: Fuel, color: 'blue' },
          { label: 'Purchase Orders', value: summary.totalPurchaseOrders, icon: Receipt, color: 'purple' },
          { label: 'Total Sales', value: summary.totalCashSales + summary.totalPurchaseOrders, icon: TrendingUp, color: 'green' },
          { label: 'Unpaid POs', value: summary.totalUnpaidPOs, icon: DollarSign, color: 'red' },
          { label: 'Transactions', value: summary.cashSalesCount + summary.poCount, icon: ShoppingBag, color: 'amber', isCurrency: false },
          { label: 'Cashiers', value: summary.uniqueCashiers, icon: Users, color: 'gray', isCurrency: false },
        ].map((stat, i) => {
          const Icon = stat.icon
          const colors = {
            blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
            red: 'bg-red-50 text-red-600', purple: 'bg-purple-50 text-purple-600',
            amber: 'bg-amber-50 text-amber-600', gray: 'bg-gray-100 text-gray-600',
          }
          return (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className={`inline-flex p-2 rounded-lg ${colors[stat.color]} mb-2`}>
                <Icon size={16} />
              </div>
              <p className="text-lg font-bold text-gray-800">
                {stat.isCurrency === false ? stat.value : `₱${stat.value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
              </p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Daily Breakdown Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Date</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Cash Sales</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Purchase Orders</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Total</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium text-xs">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : dailyData.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No transactions found for this period</td></tr>
              ) : (
                dailyData.map(d => (
                  <tr key={d.date} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-800">{format(parseISO(d.date), 'MMM d, yyyy')}</td>
                    <td className="py-3 px-4 text-right text-blue-600">
                      ₱{d.cashSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      <span className="text-[10px] text-gray-400 ml-1">({d.cashSalesCount})</span>
                    </td>
                    <td className="py-3 px-4 text-right text-purple-600">
                      ₱{d.purchaseOrders.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      <span className="text-[10px] text-gray-400 ml-1">({d.poCount})</span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">
                      ₱{d.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        {d.cashSalesCount + d.poCount}
                      </span>
                    </td>
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
