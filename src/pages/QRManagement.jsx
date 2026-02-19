import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { QrCode, Plus, Trash2, RefreshCw, X, Save, Copy, Download, Check, Building2 } from 'lucide-react'
import { useBranchStore } from '../stores/branchStore'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function QRManagement() {
  const [cashiers, setCashiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', branch_id: '' })
  const [selectedCashier, setSelectedCashier] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const { branches, selectedBranchId, fetchBranches, initialized } = useBranchStore()

  useEffect(() => { fetchBranches() }, [])
  useEffect(() => { if (initialized) fetchCashiers() }, [selectedBranchId, initialized])

  const fetchCashiers = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('cashiers')
        .select('*, branches(name)')
        .order('created_at', { ascending: false })
      if (selectedBranchId) query = query.eq('branch_id', selectedBranchId)
      const { data } = await query
      setCashiers(data || [])
    } catch (err) {
      console.error('QRManagement fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.full_name || !form.branch_id) return toast.error('Name and branch are required')
    const { data, error } = await supabase
      .from('cashiers')
      .insert({ full_name: form.full_name, branch_id: form.branch_id })
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    toast.success(`Cashier "${data.full_name}" created!`)
    logAudit('create', 'cashier', `Created cashier: ${data.full_name}`, {
      entityId: data.id,
      newValues: { full_name: data.full_name, branch_id: form.branch_id },
      branchId: form.branch_id,
    })
    setForm({ full_name: '', branch_id: branches[0]?.id || '' })
    setShowForm(false)
    fetchCashiers()
  }

  const handleRegenerateQR = async (id) => {
    if (!confirm('Regenerate QR? The old QR code will stop working.')) return
    const { error } = await supabase.rpc('uuid_generate_v4').then(async (res) => {
      return await supabase
        .from('cashiers')
        .update({ qr_token: crypto.randomUUID() })
        .eq('id', id)
    })
    toast.success('QR regenerated!')
    logAudit('update', 'cashier', `Regenerated QR code for cashier`, { entityId: id })
    fetchCashiers()
  }

  const handleToggleActive = async (id, currentActive) => {
    await supabase.from('cashiers').update({ is_active: !currentActive }).eq('id', id)
    toast.success(currentActive ? 'Cashier deactivated' : 'Cashier activated')
    logAudit('update', 'cashier', currentActive ? 'Deactivated cashier' : 'Activated cashier', { entityId: id })
    fetchCashiers()
  }

  const handleDelete = async (cashier) => {
    if (!confirm(`Delete "${cashier.full_name}"? All linked records will also be removed. This cannot be undone.`)) return

    // Delete all linked records across all tables first
    const tables = ['audit_logs', 'cash_sales', 'purchase_orders', 'attendance', 'charge_invoices', 'deposits', 'checks', 'expenses', 'purchases_disbursements', 'shift_fuel_readings']
    for (const table of tables) {
      await supabase.from(table).delete().eq('cashier_id', cashier.id)
    }

    const { error } = await supabase.from('cashiers').delete().eq('id', cashier.id)
    if (error) { toast.error(error.message); return }
    toast.success('Cashier deleted')
    fetchCashiers()
    if (selectedCashier?.id === cashier.id) setSelectedCashier(null)
  }

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token)
    setCopiedId(token)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('Token copied to clipboard')
  }

  const handleDownloadQR = (cashier) => {
    const svg = document.getElementById('qr-code-svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width = 300
      canvas.height = 300
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 300, 300)
      ctx.drawImage(img, 50, 50, 200, 200)
      const pngUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `QR-${cashier.full_name.replace(/\s+/g, '-')}.png`
      link.href = pngUrl
      link.click()
      toast.success('QR code downloaded!')
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  const handlePrintQR = (cashier) => {
    const printWindow = window.open('', '_blank', 'width=350,height=450')
    printWindow.document.write(`
      <html><head><title>QR - ${cashier.full_name}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 30px; margin: 0; }
        .name { font-size: 18px; font-weight: bold; margin-bottom: 15px; }
        .qr { margin: 0 auto; }
        .print-btn { 
          margin-top: 20px; padding: 10px 25px; 
          background: #2563eb; color: white; border: none; 
          border-radius: 6px; font-size: 13px; font-weight: bold; 
          cursor: pointer; 
        }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <div class="name">${cashier.full_name}</div>
      <div class="qr">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cashier.qr_token)}" />
      </div>
      <div class="no-print">
        <button class="print-btn" onclick="window.print()">Print</button>
      </div>
      </body></html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">QR & Cashier Management</h1>
          <p className="text-gray-500 text-sm">Create cashier accounts and generate QR codes for check-in</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Add Cashier
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Cashier</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Juan Dela Cruz" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Branch *</label>
                <select value={form.branch_id} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" required>
                  <option value="">Select branch...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <button type="submit"
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                <Save size={16} /> Create Cashier
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashier List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Cashiers ({cashiers.length})</h3>
            </div>
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
            ) : cashiers.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No cashiers yet. Add one to get started.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {cashiers.map(c => (
                  <div key={c.id}
                    onClick={() => setSelectedCashier(c)}
                    className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedCashier?.id === c.id ? 'bg-blue-50' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${c.is_active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.full_name}</p>
                      <p className="text-[10px] text-gray-400">{c.branches?.name || 'No branch'}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleToggleActive(c.id, c.is_active) }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title={c.is_active ? 'Deactivate' : 'Activate'}>
                        <RefreshCw size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c) }}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* QR Preview */}
        <div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sticky top-6">
            {selectedCashier ? (
              <div className="text-center">
                <h3 className="font-semibold text-gray-800 mb-1">{selectedCashier.full_name}</h3>
                <p className="text-xs text-gray-400 mb-4">Scan this QR to check in</p>
                <div className="inline-block p-4 bg-white border-2 border-gray-100 rounded-2xl">
                  <QRCodeSVG id="qr-code-svg" value={selectedCashier.qr_token} size={200} level="H" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 mb-1">PIN Code</p>
                    <p className="text-2xl font-bold tracking-[0.3em] text-gray-800 font-mono">{selectedCashier.pin_code}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-[10px] text-gray-400 mb-1">QR Token</p>
                    <div className="flex items-center gap-1">
                      <code className="text-[10px] text-gray-500 truncate flex-1">{selectedCashier.qr_token}</code>
                      <button onClick={() => handleCopyToken(selectedCashier.qr_token)}
                        className="p-1 text-gray-400 hover:text-blue-600 shrink-0">
                        {copiedId === selectedCashier.qr_token ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleDownloadQR(selectedCashier)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
                      <Download size={14} /> Download
                    </button>
                    <button onClick={() => handlePrintQR(selectedCashier)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                      <QrCode size={14} /> Print
                    </button>
                    <button onClick={() => handleRegenerateQR(selectedCashier.id)}
                      className="px-3 py-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-sm text-gray-600 transition-colors" title="Regenerate QR">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <QrCode size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">Select a cashier to view their QR code</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
