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
        .gte('created_at', (() => { const [y,m,d] = startDate.split('-').map(Number); return new Date(y,m-1,d,0,0,0,0).toISOString() })())
        .lte('created_at', (() => { const [y,m,d] = endDate.split('-').map(Number); return new Date(y,m-1,d,23,59,59,999).toISOString() })())
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

  const printCustomerStatement = (customerName) => {
    const customerOrders = filtered.filter(o => o.customer_name === customerName)
    
    // Calculate totals and discounts
    const ordersWithCalc = customerOrders.map(o => {
      const liters = parseFloat(o.liters || 0)
      const pricePerLiter = parseFloat(o.price_per_liter || 0)
      const amount = parseFloat(o.amount || 0)
      
      // Check if this is a discounted fuel type (based on fuel_types table)
      const isDiscounted = o.fuel_types?.is_discounted || false
      
      // Calculate regular price (assuming 2 peso discount for discounted fuel)
      const regularPrice = isDiscounted ? pricePerLiter + 2 : pricePerLiter
      const totalBeforeDiscount = liters * regularPrice
      const discount = isDiscounted ? liters * 2 : 0
      const totalDiscounted = amount
      
      return {
        ...o,
        liters,
        pricePerLiter,
        regularPrice,
        totalBeforeDiscount,
        discount,
        totalDiscounted
      }
    })
    
    const totalAmount = ordersWithCalc.reduce((s, o) => s + o.totalBeforeDiscount, 0)
    const totalDiscount = ordersWithCalc.reduce((s, o) => s + o.discount, 0)
    const totalDiscounted = ordersWithCalc.reduce((s, o) => s + o.totalDiscounted, 0)
    const unpaidAmount = ordersWithCalc.filter(o => o.status === 'unpaid').reduce((s, o) => s + o.totalDiscounted, 0)
    
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Statement of Account - ${customerName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 10px; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { font-size: 16px; font-weight: bold; }
            .customer-info { margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 9px; }
            th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
            th { background: #f0f0f0; font-weight: bold; font-size: 8px; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .summary { margin-top: 10px; }
            .summary-row { display: flex; justify-content: space-between; margin: 3px 0; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">${customerName}</p>
          <p style="font-size: 9px; margin-bottom: 3px;"><strong>PERIOD COVERED:</strong> ${format(new Date(startDate), 'MMM. d, yyyy')} - ${format(new Date(endDate), 'MMM. d, yyyy')}</p>
          <p style="font-size: 9px; margin-bottom: 15px;"><strong>SOA #:</strong> ${format(new Date(), 'yyyy')}-${customerOrders[0]?.po_number || 'N/A'}</p>
          
          <div class="header">
            <h2 style="margin-bottom: 10px;">STATEMENT OF ACCOUNT</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th class="text-center" rowspan="2">DATE</th>
                <th class="text-center" rowspan="2">CHARGE<br/>INVOICE</th>
                <th class="text-center" rowspan="2">PLATE #</th>
                <th class="text-center" rowspan="2">ITEMS<br/>WITHDRAWAL</th>
                <th class="text-center" colspan="2">ARTILES</th>
                <th class="text-center">UNIT<br/>PRICE</th>
                <th class="text-center" rowspan="2">TOTAL</th>
                <th class="text-center" rowspan="2">DISCOUNT</th>
                <th class="text-center" rowspan="2">TOTAL<br/>DISCOUNTED</th>
              </tr>
              <tr>
                <th class="text-center" style="font-size: 7px;">UNIT</th>
                <th class="text-center" colspan="2" style="font-size: 7px;">NO.OF LITERS</th>
              </tr>
            </thead>
            <tbody>
              ${ordersWithCalc.map(o => `
                <tr>
                  <td class="text-center">${format(new Date(o.created_at), 'd-MMM')}</td>
                  <td class="text-center">${o.po_number || '—'}</td>
                  <td class="text-center">${o.plate_number || '—'}</td>
                  <td class="text-center">${o.fuel_types?.short_code || 'DIESEL'}</td>
                  <td class="text-center">LITER</td>
                  <td class="text-center">${o.liters.toFixed(2)}</td>
                  <td class="text-right">${o.regularPrice.toFixed(2)}</td>
                  <td class="text-right">${o.totalBeforeDiscount.toFixed(2)}</td>
                  <td class="text-right">${o.discount.toFixed(2)}</td>
                  <td class="text-right">${o.totalDiscounted.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="summary">
            <div class="summary-row">
              <span><strong>TOTAL</strong></span>
              <span><strong>${totalAmount.toFixed(2)}</strong></span>
            </div>
            <div class="summary-row">
              <span><strong>DISCOUNT</strong></span>
              <span><strong>${totalDiscount.toFixed(2)}</strong></span>
            </div>
            <div class="summary-row" style="border-top: 2px solid #000; padding-top: 5px; margin-top: 5px;">
              <span><strong>TOTAL DISCOUNTED</strong></span>
              <span><strong>${totalDiscounted.toFixed(2)}</strong></span>
            </div>
          </div>
          <div style="margin-top: 30px; font-size: 9px;">
            <p style="margin-bottom: 10px;">Received Date / Name: _________________________________________</p>
            <p>Prepared By: _________________________________________</p>
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
                onClick={() => printCustomerStatement(name)}
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
                      <select 
                        value={o.status} 
                        onChange={(e) => {
                          const newStatus = e.target.value
                          if (newStatus === 'paid') {
                            handleMarkPaid(o.id, o.amount)
                          } else if (newStatus === 'cancelled') {
                            handleCancel(o.id)
                          }
                        }}
                        className="text-xs px-2 py-1 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
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
