import { useEffect, useState } from 'react'
import { useCustomerStore } from '../stores/customerStore'
import { useFetch } from '../hooks/useFetch'
import { supabase } from '../lib/supabase'
import { Users, Plus, Search, Edit2, X, Save, ChevronDown, ChevronUp, Check, Clock, RefreshCw, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function Customers() {
  const { customers, fetchCustomers, addCustomer, updateCustomer, deleteCustomer } = useCustomerStore()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    name: '', company: '', contact_number: '', address: ''
  })
  const [expandedCustomer, setExpandedCustomer] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [poCustomers, setPoCustomers] = useState([])
  const [saving, setSaving] = useState(false)

  const { loading, refresh } = useFetch(async () => {
    await fetchCustomers()
    await fetchPOCustomers()
  })

  // Fetch unique customers from purchase_orders
  const fetchPOCustomers = async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('customer_name')
      .order('customer_name')
    if (data) {
      const unique = [...new Set(data.map(d => d.customer_name).filter(Boolean))]
      setPoCustomers(unique)
    }
  }

  // Fetch orders for a specific customer
  const fetchCustomerOrders = async (customerName) => {
    setLoadingOrders(true)
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, fuel_types(short_code, name)')
      .eq('customer_name', customerName)
      .order('created_at', { ascending: false })
    setCustomerOrders(data || [])
    setLoadingOrders(false)
  }

  const handleExpandCustomer = (name) => {
    if (expandedCustomer === name) {
      setExpandedCustomer(null)
      setCustomerOrders([])
    } else {
      setExpandedCustomer(name)
      fetchCustomerOrders(name)
    }
  }

  const handleTogglePaid = async (orderId, currentStatus) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid'
    const order = customerOrders.find(o => o.id === orderId)
    const updateData = { status: newStatus }
    if (newStatus === 'paid') {
      updateData.paid_at = new Date().toISOString()
      updateData.paid_amount = order?.amount || 0
    } else {
      updateData.paid_at = null
      updateData.paid_amount = 0
    }
    const { error } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', orderId)
    
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(`Marked as ${newStatus}`)
      logAudit('update', 'purchase_order', `Changed PO status to ${newStatus}`, { entityId: orderId })
      fetchCustomerOrders(expandedCustomer)
    }
  }

  // Combine registered customers with PO customers
  const allCustomerNames = [...new Set([
    ...customers.map(c => c.name),
    ...poCustomers
  ])].sort()

  const filtered = allCustomerNames.filter(name =>
    name.toLowerCase().includes(search.toLowerCase())
  )

  const getCustomerData = (name) => customers.find(c => c.name === name)

  const resetForm = () => {
    setForm({ name: '', company: '', contact_number: '', address: '' })
    setShowForm(false)
    setEditingId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Customer name is required')
    setSaving(true)
    try {
      if (editingId) {
        const result = await updateCustomer(editingId, form)
        if (result.success) { 
          toast.success('Customer updated')
          logAudit('update', 'customer', `Updated customer: ${form.name}`, { entityId: editingId })
          resetForm() 
        } else {
          toast.error(result.error || 'Failed to update customer')
        }
      } else {
        const result = await addCustomer(form)
        if (result.success) { 
          toast.success('Customer added')
          logAudit('create', 'customer', `Created customer: ${form.name}`, { entityId: result.data?.id })
          resetForm() 
        } else {
          toast.error(result.error || 'Failed to add customer')
        }
      }
    } catch (err) {
      toast.error(err.message || 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (c) => {
    setForm({
      name: c.name,
      company: c.company || '',
      contact_number: c.contact_number || '',
      address: c.address || '',
    })
    setEditingId(c.id)
    setShowForm(true)
  }

  const handleDelete = async (customer) => {
    if (!confirm(`Are you sure you want to delete "${customer.name}"?`)) return
    const result = await deleteCustomer(customer.id)
    if (result.success) {
      toast.success('Customer deleted')
      logAudit('delete', 'customer', `Deleted customer: ${customer.name}`, { entityId: customer.id })
    } else {
      toast.error(result.error || 'Failed to delete customer')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Customers</h1>
          <p className="text-gray-500 text-sm">Manage charge account customers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Customer' : 'New Customer'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                <input type="text" value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                <input type="text" value={form.contact_number} onChange={e => setForm(p => ({ ...p, contact_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <Save size={16} /> {saving ? 'Saving...' : (editingId ? 'Update' : 'Save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Customer List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
            No customers found
          </div>
        ) : (
          filtered.map(name => {
            const customerData = getCustomerData(name)
            const isExpanded = expandedCustomer === name
            const unpaidCount = isExpanded ? customerOrders.filter(o => o.status === 'unpaid').length : 0
            const totalUnpaid = isExpanded ? customerOrders.filter(o => o.status === 'unpaid').reduce((s, o) => s + parseFloat(o.amount || 0), 0) : 0

            return (
              <div key={name} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Customer Header */}
                <button
                  onClick={() => handleExpandCustomer(name)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-sm">{name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-800">{name}</p>
                      <p className="text-xs text-gray-400">
                        {customerData?.company || 'Purchase Order Customer'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </button>

                {/* Expanded Order History */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    {loadingOrders ? (
                      <p className="text-sm text-gray-400 text-center py-4">Loading orders...</p>
                    ) : customerOrders.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">No purchase orders found</p>
                    ) : (
                      <>
                        {/* Summary */}
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-gray-700">
                            {customerOrders.length} orders • {unpaidCount} unpaid
                          </p>
                          {totalUnpaid > 0 && (
                            <p className="text-sm font-bold text-red-600">
                              Total Unpaid: ₱{totalUnpaid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>

                        {/* Orders Table */}
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-100">
                                <th className="text-left py-2 px-3 font-medium text-gray-500">Date</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-500">PO #</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-500">Fuel</th>
                                <th className="text-right py-2 px-3 font-medium text-gray-500">Amount</th>
                                <th className="text-center py-2 px-3 font-medium text-gray-500">Status</th>
                                <th className="py-2 px-3 w-20"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {customerOrders.map(order => (
                                <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="py-2 px-3 text-gray-600">
                                    {format(new Date(order.created_at), 'MMM d, yyyy')}
                                  </td>
                                  <td className="py-2 px-3 text-gray-600">{order.po_number || '—'}</td>
                                  <td className="py-2 px-3 text-gray-600">{order.fuel_types?.short_code || '—'}</td>
                                  <td className="py-2 px-3 text-right font-mono font-medium text-gray-800">
                                    ₱{parseFloat(order.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                      order.status === 'paid' ? 'bg-green-100 text-green-700' :
                                      order.status === 'unpaid' ? 'bg-red-100 text-red-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {order.status === 'paid' ? <Check size={10} /> : <Clock size={10} />}
                                      {order.status}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3">
                                    <button
                                      onClick={() => handleTogglePaid(order.id, order.status)}
                                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                        order.status === 'paid'
                                          ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                          : 'bg-green-100 text-green-600 hover:bg-green-200'
                                      }`}
                                    >
                                      {order.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {/* Edit/Delete Customer Buttons (if registered) */}
                    {customerData && (
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(customerData)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(customerData)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
