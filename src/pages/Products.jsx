import { useState } from 'react'
import { useProductStore } from '../stores/productStore'
import { useFetch } from '../hooks/useFetch'
import { Package, Plus, Search, Edit2, X, Save, AlertTriangle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

const CATEGORIES = [
  { value: 'oil_lubes', label: 'Oil / Lubes' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'services', label: 'Services' },
  { value: 'miscellaneous', label: 'Miscellaneous' },
]

export default function Products() {
  const { products, fetchProducts, addProduct, updateProduct } = useProductStore()
  const { loading, refresh } = useFetch(() => fetchProducts())
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '', category: 'oil_lubes', sku: '', price: 0, cost: 0, stock_quantity: 0, reorder_level: 5
  })
  const [saving, setSaving] = useState(false)

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || p.category === filterCat
    return matchSearch && matchCat
  })

  const resetForm = () => {
    setForm({ name: '', category: 'oil_lubes', sku: '', price: 0, cost: 0, stock_quantity: 0, reorder_level: 5 })
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Product name is required')
    setSaving(true)
    try {
      if (editingId) {
        const result = await updateProduct(editingId, form)
        if (result.success) {
          toast.success('Product updated')
          logAudit('update', 'product', `Updated product: ${form.name}`, { entityId: editingId, newValues: form })
          resetForm()
        } else toast.error(result.error || 'Failed to update')
      } else {
        const result = await addProduct(form)
        if (result.success) {
          toast.success('Product added')
          logAudit('create', 'product', `Created product: ${form.name}`, { entityId: result.data?.id, newValues: form })
          resetForm()
        } else toast.error(result.error || 'Failed to add')
      }
    } catch (err) {
      toast.error(err.message || 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (p) => {
    setForm({
      name: p.name, category: p.category, sku: p.sku || '',
      price: p.price, cost: p.cost, stock_quantity: p.stock_quantity, reorder_level: p.reorder_level,
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  const catLabel = (val) => CATEGORIES.find(c => c.value === val)?.label || val

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Products & Inventory</h1>
          <p className="text-gray-500 text-sm">Oil, lubes, accessories, and services</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Product' : 'New Product'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">SKU</label>
                <input type="text" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price (₱)</label>
                  <input type="number" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cost (₱)</label>
                  <input type="number" step="0.01" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stock Qty</label>
                  <input type="number" value={form.stock_quantity} onChange={e => setForm(p => ({ ...p, stock_quantity: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Reorder Level</label>
                  <input type="number" value={form.reorder_level} onChange={e => setForm(p => ({ ...p, reorder_level: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button type="submit" disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <Save size={16} /> {saving ? 'Saving...' : (editingId ? 'Update' : 'Save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Product</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Category</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Price</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Cost</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs">Stock</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No products found</td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-800">{p.name}</p>
                      {p.sku && <p className="text-xs text-gray-400">{p.sku}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{catLabel(p.category)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">₱{parseFloat(p.price).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-gray-500">₱{parseFloat(p.cost).toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${p.stock_quantity <= p.reorder_level ? 'text-red-600' : 'text-gray-800'}`}>
                        {p.stock_quantity}
                      </span>
                      {p.stock_quantity <= p.reorder_level && (
                        <AlertTriangle size={12} className="inline ml-1 text-red-500" />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <button onClick={() => startEdit(p)} className="text-gray-400 hover:text-blue-600"><Edit2 size={14} /></button>
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
