import { useEffect, useState, useRef } from 'react'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  FileText, Fuel, RefreshCw, DollarSign, Receipt, ChevronDown, ChevronUp, Edit2, X, Save, Package, Printer, Users
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
  const { branches, selectedBranchId } = useBranchStore()
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(true)
  const [cashiers, setCashiers] = useState([])
  const [selectedCashierId, setSelectedCashierId] = useState('all')
  const [viewMode, setViewMode] = useState('cards')
  const [cashSales, setCashSales] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [productSales, setProductSales] = useState([])
  const [editingSale, setEditingSale] = useState(null)
  const [editingPO, setEditingPO] = useState(null)
  const [editForm, setEditForm] = useState({ amount: '' })
  const printRef = useRef(null)

  const fetchCashiers = async () => {
    let query = supabase.from('cashiers').select('*').eq('is_active', true).order('full_name')
    if (selectedBranchId) query = query.eq('branch_id', selectedBranchId)
    const { data } = await query
    setCashiers(data || [])
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const start = reportDate + 'T00:00:00'
      const end = reportDate + 'T23:59:59'

      let salesQ = supabase.from('cash_sales').select('*, fuel_types(short_code, name), cashiers(full_name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true })
      if (selectedBranchId) salesQ = salesQ.eq('branch_id', selectedBranchId)
      if (selectedCashierId !== 'all') salesQ = salesQ.eq('cashier_id', selectedCashierId)

      let poQ = supabase.from('purchase_orders').select('*, fuel_types(short_code, name), cashiers(full_name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true })
      if (selectedBranchId) poQ = poQ.eq('branch_id', selectedBranchId)
      if (selectedCashierId !== 'all') poQ = poQ.eq('cashier_id', selectedCashierId)

      let prodQ = supabase.from('product_sales').select('*').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true })
      if (selectedBranchId) prodQ = prodQ.eq('branch_id', selectedBranchId)
      if (selectedCashierId !== 'all') prodQ = prodQ.eq('cashier_id', selectedCashierId)

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

  useEffect(() => { 
    fetchFuelTypes()
    fetchCashiers()
  }, [])

  useEffect(() => {
    fetchCashiers()
  }, [selectedBranchId])

  useEffect(() => {
    fetchData()
  }, [reportDate, selectedBranchId, selectedCashierId])

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

  const handlePrint = () => {
    const printContent = printRef.current
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Daily Report - ${reportDate}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
            .header { margin-bottom: 20px; }
            .header > div:first-child { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 8px; }
            .header img { width: 64px; height: 64px; object-fit: contain; }
            .header h1 { font-size: 22px; font-weight: bold; letter-spacing: 1.5px; }
            .header p { font-size: 10px; color: #666; text-align: center; margin-top: 4px; }
            .header h2 { font-size: 16px; font-weight: bold; text-align: center; margin-top: 16px; text-decoration: underline; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 11px; padding: 8px 0; border-bottom: 2px solid #000; }
            .meta div { font-weight: 500; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #333; padding: 6px 8px; }
            th { background: #e8e8e8; font-weight: bold; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            .text-right { text-align: right; font-family: 'Courier New', monospace; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .total-row { background: #f5f5f5; font-weight: bold; border-top: 2px solid #000; }
            .total-row td { padding: 8px; font-size: 11px; }
            .section-title { font-weight: bold; margin: 20px 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #000; padding-bottom: 4px; }
            .grand-total-box { border: 3px solid #000; padding: 12px 20px; margin: 20px 0; text-align: right; }
            .grand-total-box div { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
            .summary-section { margin-top: 20px; padding-top: 15px; border-top: 1px solid #ccc; }
            .summary-section .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
            .summary-section strong { font-weight: 600; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'All Branches'
  const cashierName = selectedCashierId === 'all' 
    ? 'All Cashiers' 
    : cashiers.find(c => c.id === selectedCashierId)?.full_name || 'Unknown'

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Daily Report</h1>
          <p className="text-gray-500 text-sm">View transactions for a specific date</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-600 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Printer size={14} />
            Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cashier</label>
            <select
              value={selectedCashierId}
              onChange={e => setSelectedCashierId(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-[200px]"
            >
              <option value="all">All Cashiers</option>
              {cashiers.map(c => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">View</label>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'cards' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Table
              </button>
            </div>
          </div>
          <div className="flex items-end">
            <button onClick={() => setReportDate(format(new Date(), 'yyyy-MM-dd'))}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors">Today</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 print:hidden">
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

      {/* Card View */}
      {viewMode === 'cards' && (
        <>
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
        </>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div ref={printRef} className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
          {/* Header */}
          <div className="header mb-6">
            <div className="flex items-center justify-center gap-4 mb-2">
              <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain" />
              <h1 className="text-2xl font-bold tracking-wide">MACKY OIL & GAS</h1>
            </div>
            <p className="text-center text-xs text-gray-600">Lower Sosohon, Manolo Fortich, Bukidnon</p>
            <h2 className="text-center text-lg font-bold mt-4">DAILY REPORT</h2>
          </div>

          {/* Meta Information */}
          <div className="meta mb-4 text-xs">
            <div><strong>Date:</strong> {format(new Date(reportDate), 'MMMM d, yyyy')}</div>
            <div><strong>Branch:</strong> {branchName}</div>
            <div><strong>Cashier:</strong> {cashierName}</div>
          </div>

          {/* Cash Sales */}
          {cashSales.length > 0 && (
            <>
              <div className="section-title">CASH SALES</div>
              <table>
                <thead>
                  <tr>
                    <th className="text-center" style={{width: '60px'}}>Time</th>
                    <th>Cashier</th>
                    <th className="text-center" style={{width: '80px'}}>Fuel Type</th>
                    <th className="text-right" style={{width: '100px'}}>Liters</th>
                    <th className="text-right" style={{width: '100px'}}>Amount</th>
                    <th className="text-center" style={{width: '80px'}}>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {cashSales.map(s => (
                    <tr key={s.id}>
                      <td className="text-center">{format(new Date(s.created_at), 'h:mm a')}</td>
                      <td>{s.cashiers?.full_name || 'Unknown'}</td>
                      <td className="text-center">{s.fuel_types?.short_code || '—'}</td>
                      <td className="text-right">{s.liters ? parseFloat(s.liters).toFixed(3) : '—'}</td>
                      <td className="text-right">₱{parseFloat(s.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="text-center">{s.payment_method}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan="4" className="text-right font-bold">TOTAL CASH SALES:</td>
                    <td className="text-right font-bold">₱{totalCashSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Product Sales */}
          {productSales.length > 0 && (
            <>
              <div className="section-title">PRODUCT SALES</div>
              <table>
                <thead>
                  <tr>
                    <th className="text-center" style={{width: '60px'}}>Time</th>
                    <th>Cashier</th>
                    <th>Product</th>
                    <th className="text-center" style={{width: '60px'}}>Qty</th>
                    <th className="text-right" style={{width: '100px'}}>Unit Price</th>
                    <th className="text-right" style={{width: '100px'}}>Total</th>
                    <th className="text-center" style={{width: '80px'}}>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {productSales.map(ps => (
                    <tr key={ps.id}>
                      <td className="text-center">{format(new Date(ps.created_at), 'h:mm a')}</td>
                      <td>{ps.cashier_name || 'Unknown'}</td>
                      <td>{ps.product_name}</td>
                      <td className="text-center">{ps.quantity}</td>
                      <td className="text-right">₱{parseFloat(ps.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="text-right">₱{parseFloat(ps.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="text-center">{ps.payment_method}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan="5" className="text-right font-bold">TOTAL PRODUCT SALES:</td>
                    <td className="text-right font-bold">₱{totalProductSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Purchase Orders */}
          {purchaseOrders.length > 0 && (
            <>
              <div className="section-title">PURCHASE ORDERS (CREDIT)</div>
              <table>
                <thead>
                  <tr>
                    <th className="text-center" style={{width: '60px'}}>Time</th>
                    <th>Cashier</th>
                    <th>Customer</th>
                    <th className="text-center" style={{width: '80px'}}>Fuel Type</th>
                    <th className="text-right" style={{width: '100px'}}>Liters</th>
                    <th className="text-right" style={{width: '100px'}}>Amount</th>
                    <th className="text-center" style={{width: '80px'}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map(po => (
                    <tr key={po.id}>
                      <td className="text-center">{format(new Date(po.created_at), 'h:mm a')}</td>
                      <td>{po.cashiers?.full_name || 'Unknown'}</td>
                      <td>{po.customer_name}</td>
                      <td className="text-center">{po.fuel_types?.short_code || '—'}</td>
                      <td className="text-right">{po.liters ? parseFloat(po.liters).toFixed(3) : '—'}</td>
                      <td className="text-right">₱{parseFloat(po.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                      <td className="text-center">{po.status}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan="5" className="text-right font-bold">TOTAL PURCHASE ORDERS:</td>
                    <td className="text-right font-bold">₱{totalPurchaseOrders.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Grand Total */}
          <div className="mt-6 flex justify-end">
            <div className="grand-total-box">
              <div>GRAND TOTAL: ₱{totalAll.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          {/* Summary */}
          <div className="summary-section">
            <div className="grid">
              <div>
                <strong>Cash Sales:</strong> {cashSales.length} transactions
              </div>
              <div>
                <strong>Product Sales:</strong> {productSales.length} items
              </div>
              <div>
                <strong>Purchase Orders:</strong> {purchaseOrders.length} orders
              </div>
            </div>
          </div>

          {/* No Data Message */}
          {cashSales.length === 0 && productSales.length === 0 && purchaseOrders.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p>No transactions found for the selected date and cashier.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
