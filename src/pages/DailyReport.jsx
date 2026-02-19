import { useEffect, useState } from 'react'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  FileText, Fuel, RefreshCw, DollarSign, Receipt, ChevronDown, ChevronUp, Edit2, X, Save, Package
} from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

function Section({ title, icon: Icon, children, count, total, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon size={16} className="text-blue-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <p className="text-xs text-gray-400">{count} transactions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-800">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>
      {open && <div className="border-t border-gray-50">{children}</div>}
    </div>
  )
}

export default function DailyReport() {
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { selectedBranchId } = useBranchStore()
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(true)
  const [cashSales, setCashSales] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [productSales, setProductSales] = useState([])
  const [editingSale, setEditingSale] = useState(null)
  const [editingPO, setEditingPO] = useState(null)
  const [editForm, setEditForm] = useState({ amount: '' })

  const fetchData = async () => {
    setLoading(true)
    try {
      const start = reportDate + 'T00:00:00'
      const end = reportDate + 'T23:59:59'

      let salesQ = supabase.from('cash_sales').select('*, fuel_types(short_code, name), cashiers(full_name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
      if (selectedBranchId) salesQ = salesQ.eq('branch_id', selectedBranchId)

      let poQ = supabase.from('purchase_orders').select('*, fuel_types(short_code, name), cashiers(full_name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
      if (selectedBranchId) poQ = poQ.eq('branch_id', selectedBranchId)

      let prodQ = supabase.from('product_sales').select('*, cashiers(full_name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false })
      if (selectedBranchId) prodQ = prodQ.eq('branch_id', selectedBranchId)

      const [{ data: sales }, { data: pos }, { data: prods }] = await Promise.all([salesQ, poQ, prodQ])

      setCashSales(sales || [])
      setPurchaseOrders(pos || [])
      setProductSales(prods || [])
    } catch (err) {
      console.error('DailyReport fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFuelTypes() }, [])

  useEffect(() => {
    fetchData()
  }, [reportDate, selectedBranchId])

  const totalCashSales = cashSales.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
  const totalPurchaseOrders = purchaseOrders.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
  const totalProductSales = productSales.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0)
  const totalAll = totalCashSales + totalPurchaseOrders + totalProductSales

  const startEditSale = (sale) => {
    setEditingSale(sale.id)
    setEditForm({ amount: sale.amount })
  }

  const startEditPO = (po) => {
    setEditingPO(po.id)
    setEditForm({ amount: po.amount })
  }

  const cancelEdit = () => {
    setEditingSale(null)
    setEditingPO(null)
    setEditForm({ amount: '' })
  }

  const handleSaveSale = async (sale) => {
    const oldAmount = parseFloat(sale.amount)
    const newAmount = parseFloat(editForm.amount)
    if (isNaN(newAmount) || newAmount <= 0) return toast.error('Invalid amount')
    
    const { error } = await supabase
      .from('cash_sales')
      .update({ amount: newAmount })
      .eq('id', sale.id)
    
    if (error) return toast.error(error.message)
    toast.success('Sale updated')
    logAudit('update', 'cash_sale', `Edited cash sale amount: ₱${oldAmount.toFixed(2)} → ₱${newAmount.toFixed(2)}`, {
      entityId: sale.id,
      oldValues: { amount: oldAmount },
      newValues: { amount: newAmount },
      branchId: sale.branch_id,
    })
    cancelEdit()
    fetchData()
  }

  const handleSavePO = async (po) => {
    const oldAmount = parseFloat(po.amount)
    const newAmount = parseFloat(editForm.amount)
    if (isNaN(newAmount) || newAmount <= 0) return toast.error('Invalid amount')
    
    const { error } = await supabase
      .from('purchase_orders')
      .update({ amount: newAmount })
      .eq('id', po.id)
    
    if (error) return toast.error(error.message)
    toast.success('Purchase order updated')
    logAudit('update', 'purchase_order', `Edited PO amount: ₱${oldAmount.toFixed(2)} → ₱${newAmount.toFixed(2)}`, {
      entityId: po.id,
      oldValues: { amount: oldAmount },
      newValues: { amount: newAmount },
      branchId: po.branch_id,
    })
    cancelEdit()
    fetchData()
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Report</h1>
          <p className="text-gray-500 text-sm">View transactions for a specific date</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Date Selector */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Select Date</label>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReportDate(format(new Date(), 'yyyy-MM-dd'))}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors">Today</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-blue-50 rounded-lg"><Fuel size={14} className="text-blue-600" /></div>
            <span className="text-xs text-gray-500">Cash Sales</span>
          </div>
          <p className="text-xl font-bold text-blue-700">₱{totalCashSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400">{cashSales.length} transactions</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-amber-50 rounded-lg"><Package size={14} className="text-amber-600" /></div>
            <span className="text-xs text-gray-500">Product Sales</span>
          </div>
          <p className="text-xl font-bold text-amber-700">₱{totalProductSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400">{productSales.length} items sold</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-purple-50 rounded-lg"><Receipt size={14} className="text-purple-600" /></div>
            <span className="text-xs text-gray-500">Purchase Orders</span>
          </div>
          <p className="text-xl font-bold text-purple-700">₱{totalPurchaseOrders.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400">{purchaseOrders.length} orders</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-green-50 rounded-lg"><DollarSign size={14} className="text-green-600" /></div>
            <span className="text-xs text-gray-500">Total</span>
          </div>
          <p className="text-xl font-bold text-green-700">₱{totalAll.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400">{cashSales.length + purchaseOrders.length + productSales.length} total</p>
        </div>
      </div>

      {/* Cash Sales */}
      <Section title="Cash Sales" icon={Fuel} count={cashSales.length} total={totalCashSales}>
        {cashSales.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">No cash sales recorded</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {cashSales.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">
                    {s.fuel_types?.short_code || 'FUEL'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{s.cashiers?.full_name || 'Unknown'}</p>
                    <p className="text-[10px] text-gray-400">{format(new Date(s.created_at), 'h:mm a')} • {s.payment_method}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingSale === s.id ? (
                    <>
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={e => setEditForm({ amount: e.target.value })}
                        className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right"
                        autoFocus
                      />
                      <button onClick={() => handleSaveSale(s)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Save size={14} /></button>
                      <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-gray-800">₱{parseFloat(s.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => startEditSale(s)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                        <Edit2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Product Sales */}
      <Section title="Product Sales" icon={Package} count={productSales.length} total={totalProductSales} defaultOpen={false}>
        {productSales.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">No product sales recorded</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {productSales.map(ps => (
              <div key={ps.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded font-medium">
                    x{ps.quantity}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{ps.product_name}</p>
                    <p className="text-[10px] text-gray-400">
                      {ps.cashiers?.full_name || 'Unknown'} • {format(new Date(ps.created_at), 'h:mm a')} • {ps.payment_method}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-gray-800">₱{parseFloat(ps.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Purchase Orders */}
      <Section title="Purchase Orders (Credit)" icon={Receipt} count={purchaseOrders.length} total={totalPurchaseOrders} defaultOpen={false}>
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">No purchase orders recorded</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {purchaseOrders.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    p.status === 'paid' ? 'bg-green-50 text-green-600' :
                    p.status === 'unpaid' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
                  }`}>{p.status}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{p.customer_name}</p>
                    <p className="text-[10px] text-gray-400">
                      {p.fuel_types?.short_code || '—'} • {p.plate_number || 'No plate'} • {format(new Date(p.created_at), 'h:mm a')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingPO === p.id ? (
                    <>
                      <input
                        type="number"
                        value={editForm.amount}
                        onChange={e => setEditForm({ amount: e.target.value })}
                        className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right"
                        autoFocus
                      />
                      <button onClick={() => handleSavePO(p)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Save size={14} /></button>
                      <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-gray-800">₱{parseFloat(p.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => startEditPO(p)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                        <Edit2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
