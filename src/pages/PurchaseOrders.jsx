import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { Receipt, Search, Check, X, DollarSign, Printer, RefreshCw } from 'lucide-react'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function PurchaseOrders() {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { selectedBranchId } = useBranchStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  useEffect(() => { fetchFuelTypes() }, [])
  useEffect(() => { fetchOrders() }, [startDate, endDate, statusFilter, selectedBranchId])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('purchase_orders')
        .select('*, fuel_types(short_code, name), cashiers(full_name), customers(name, company)')
        .gte('created_at', startDate + 'T00:00:00')
        .lte('created_at', endDate + 'T23:59:59')
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (selectedBranchId) query = query.eq('branch_id', selectedBranchId)

      const { data, error } = await query
      if (!error) setOrders(data || [])
    } catch (err) {
      console.error('PurchaseOrders fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = orders.filter(o =>
    o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (o.po_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.plate_number || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalUnpaid = orders.filter(o => o.status === 'unpaid').reduce((s, o) => s + parseFloat(o.amount || 0), 0)
  const totalPaid = orders.filter(o => o.status === 'paid').reduce((s, o) => s + parseFloat(o.amount || 0), 0)
  const totalAll = orders.reduce((s, o) => s + parseFloat(o.amount || 0), 0)

  const handleMarkPaid = async (id, amount) => {
    if (!confirm('Mark this purchase order as paid?')) return
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'paid', paid_amount: amount, paid_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Marked as paid!')
    logAudit('update', 'purchase_order', `Marked PO as paid: ₱${parseFloat(amount).toFixed(2)}`, { entityId: id })
    fetchOrders()
  }

  const handleCancel = async (id) => {
    if (!confirm('Cancel this purchase order?')) return
    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Purchase order cancelled')
    logAudit('update', 'purchase_order', 'Cancelled purchase order', { entityId: id })
    fetchOrders()
  }

  const statusColors = {
    unpaid: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }

  // Get unique customers from filtered orders
  const uniqueCustomers = [...new Set(filtered.map(o => o.customer_name))].sort()

  const handlePrintCustomer = (customerName) => {
    const customerOrders = filtered.filter(o => o.customer_name === customerName)
    const totalAmount = customerOrders.reduce((s, o) => s + parseFloat(o.amount || 0), 0)
    const unpaidAmount = customerOrders.filter(o => o.status === 'unpaid').reduce((s, o) => s + parseFloat(o.amount || 0), 0)
    
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Orders - ${customerName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 16px; font-weight: bold; }
            .customer-info { margin-bottom: 15px; padding: 10px; background: #f5f5f5; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
            th { background: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .summary { margin-top: 15px; text-align: right; }
            .summary p { margin: 5px 0; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MACKY OIL&GAS</h1>
            <p>Lower Sosohon, Manolo Fortich, Bukidnon</p>
            <h2 style="margin-top: 10px;">PURCHASE ORDER STATEMENT</h2>
          </div>
          <div class="customer-info">
            <p><strong>Customer:</strong> ${customerName}</p>
            <p><strong>Date Range:</strong> ${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}</p>
            <p><strong>Generated:</strong> ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>PO #</th>
                <th>Fuel</th>
                <th>Plate #</th>
                <th class="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${customerOrders.map(o => `
                <tr>
                  <td>${format(new Date(o.created_at), 'MM/dd/yy')}</td>
                  <td>${o.po_number || '—'}</td>
                  <td>${o.fuel_types?.short_code || '—'}</td>
                  <td>${o.plate_number || '—'}</td>
                  <td class="text-right">₱${parseFloat(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td>${o.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="summary">
            <p><strong>Total Amount:</strong> ₱${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            <p style="color: red;"><strong>Unpaid Balance:</strong> ₱${unpaidAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const getFuelCode = (fuelId) => fuelTypes.find(f => f.id === fuelId)?.short_code || '—'

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Purchase Orders</h1>
          <p className="text-gray-500 text-sm">Gas taken but not yet paid — track credit transactions</p>
        </div>
        <button onClick={fetchOrders} disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-red-50 rounded-lg"><DollarSign size={14} className="text-red-600" /></div>
            <span className="text-xs text-gray-500">Total Unpaid</span>
          </div>
          <p className="text-xl font-bold text-red-700">₱{totalUnpaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-green-50 rounded-lg"><Check size={14} className="text-green-600" /></div>
            <span className="text-xs text-gray-500">Total Paid</span>
          </div>
          <p className="text-xl font-bold text-green-700">₱{totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-blue-50 rounded-lg"><Receipt size={14} className="text-blue-600" /></div>
            <span className="text-xs text-gray-500">Total All</span>
          </div>
          <p className="text-xl font-bold text-gray-800">₱{totalAll.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400">{orders.length} orders</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer, PO#, plate..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
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

      {/* Print by Customer */}
      {uniqueCustomers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Print Statement by Customer</p>
          <div className="flex flex-wrap gap-2">
            {uniqueCustomers.map(name => (
              <button
                key={name}
                onClick={() => handlePrintCustomer(name)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-colors"
              >
                <Printer size={12} /> {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Date</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Customer</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Fuel</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Plate</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Amount</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Cashier</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Status</th>
                <th className="py-3 px-4 text-gray-500 font-medium text-xs w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">No purchase orders found</td></tr>
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {format(new Date(o.created_at), 'MMM d, yyyy')}<br/>
                      <span className="text-gray-400">{format(new Date(o.created_at), 'h:mm a')}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-800">{o.customer_name}</td>
                    <td className="py-3 px-4">
                      {o.fuel_types ? (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">{o.fuel_types.short_code}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 font-mono text-xs">{o.plate_number || '—'}</td>
                    <td className="py-3 px-4 text-right font-bold text-gray-800">
                      ₱{parseFloat(o.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{o.cashiers?.full_name || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium uppercase ${statusColors[o.status] || ''}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {o.status === 'unpaid' && (
                        <div className="flex gap-1">
                          <button onClick={() => handleMarkPaid(o.id, o.amount)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Mark Paid">
                            <Check size={14} />
                          </button>
                          <button onClick={() => handleCancel(o.id)}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Cancel">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      {o.status === 'paid' && o.paid_at && (
                        <span className="text-[10px] text-gray-400">
                          Paid {format(new Date(o.paid_at), 'MMM d')}
                        </span>
                      )}
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
