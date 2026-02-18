import { useEffect, useState, useCallback } from 'react'
import { useAuditStore } from '../stores/auditStore'
import { useBranchStore } from '../stores/branchStore'
import { format } from 'date-fns'
import { 
  FileText, Search, Filter, ChevronLeft, ChevronRight, 
  User, Clock, Building2, Activity, Eye, RefreshCw
} from 'lucide-react'

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'cash_sale', label: 'Cash Sales' },
  { value: 'purchase_order', label: 'Purchase Orders' },
  { value: 'product_sale', label: 'Product Sales' },
  { value: 'cashier', label: 'Cashiers' },
  { value: 'branch', label: 'Branches' },
  { value: 'product', label: 'Products' },
  { value: 'customer', label: 'Customers' },
  { value: 'expense', label: 'Expenses' },
  { value: 'fuel_type', label: 'Fuel Types' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'daily_report', label: 'Daily Reports' },
  { value: 'auth', label: 'Authentication' },
  { value: 'shift_reading', label: 'Shift Readings' },
]

const ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'checkout', label: 'Checkout' },
  { value: 'view', label: 'View' },
  { value: 'unlock', label: 'Unlock' },
]

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  login: 'bg-purple-100 text-purple-700',
  logout: 'bg-gray-100 text-gray-600',
  checkout: 'bg-amber-100 text-amber-700',
  view: 'bg-gray-100 text-gray-500',
  unlock: 'bg-orange-100 text-orange-700',
}

export default function AuditLog() {
  const { logs, totalCount, fetchLogs } = useAuditStore()
  const { branches, selectedBranchId } = useBranchStore()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({
    entityType: '',
    action: '',
    branchId: '',
    startDate: '',
    endDate: '',
  })
  const [selectedLog, setSelectedLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const limit = 50

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      await fetchLogs({
        page,
        limit,
        entityType: filters.entityType || null,
        action: filters.action || null,
        branchId: filters.branchId || null,
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
      })
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const totalPages = Math.ceil(totalCount / limit)

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Audit Log</h1>
          <p className="text-gray-500 text-sm">Track all system activities and changes</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Activity size={16} />
            <span>{totalCount.toLocaleString()} total records</span>
          </div>
          <button onClick={() => fetchLogs({ page, limit, entityType: filters.entityType || null, action: filters.action || null, branchId: filters.branchId || null, startDate: filters.startDate || null, endDate: filters.endDate || null })} disabled={loading}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filters.entityType}
            onChange={e => handleFilterChange('entityType', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={filters.action}
            onChange={e => handleFilterChange('action', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select
            value={filters.branchId}
            onChange={e => handleFilterChange('branchId', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            type="date"
            value={filters.startDate}
            onChange={e => handleFilterChange('startDate', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Start date"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={e => handleFilterChange('endDate', e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="End date"
          />
          {(filters.entityType || filters.action || filters.branchId || filters.startDate || filters.endDate) && (
            <button
              onClick={() => setFilters({ entityType: '', action: '', branchId: '', startDate: '', endDate: '' })}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Time</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">User</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Action</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Type</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Description</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Branch</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No audit logs found</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="text-xs text-gray-600">{format(new Date(log.created_at), 'MMM d, yyyy')}</p>
                      <p className="text-[10px] text-gray-400">{format(new Date(log.created_at), 'h:mm:ss a')}</p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                          <User size={14} className="text-gray-500" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-700">
                            {log.cashier_name || log.user_email || 'System'}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {log.cashier_name ? 'Cashier' : log.user_email ? 'Admin' : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-gray-600 capitalize">{log.entity_type?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-xs text-gray-600 truncate">{log.description || '—'}</p>
                    </td>
                    <td className="py-3 px-4">
                      {log.branch_name ? (
                        <span className="text-xs text-gray-500">{log.branch_name}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        title="View details"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {page} of {totalPages} ({totalCount} records)
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Audit Log Details</h3>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Timestamp</p>
                  <p className="font-medium">{format(new Date(selectedLog.created_at), 'MMM d, yyyy h:mm:ss a')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Action</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${ACTION_COLORS[selectedLog.action] || 'bg-gray-100'}`}>
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Entity Type</p>
                  <p className="font-medium capitalize">{selectedLog.entity_type?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Entity ID</p>
                  <p className="font-mono text-xs">{selectedLog.entity_id || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">User</p>
                  <p className="font-medium">{selectedLog.cashier_name || selectedLog.user_email || 'System'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Branch</p>
                  <p className="font-medium">{selectedLog.branch_name || '—'}</p>
                </div>
              </div>
              {selectedLog.description && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Description</p>
                  <p className="text-sm bg-gray-50 rounded-lg p-3">{selectedLog.description}</p>
                </div>
              )}
              {selectedLog.old_values && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Previous Values</p>
                  <pre className="text-xs bg-red-50 text-red-800 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.new_values && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">New Values</p>
                  {/* Special formatting for product sales */}
                  {selectedLog.entity_type === 'product_sale' && selectedLog.new_values.products ? (
                    <div className="bg-green-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-green-700">Total:</span>
                        <span className="font-bold text-green-800">₱{selectedLog.new_values.total?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-green-700">Payment:</span>
                        <span className="capitalize text-green-800">{selectedLog.new_values.payment_method}</span>
                      </div>
                      <div className="border-t border-green-200 pt-2 mt-2">
                        <p className="text-xs text-green-600 mb-1 font-medium">Items Sold:</p>
                        <div className="space-y-1">
                          {selectedLog.new_values.products.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs bg-white/50 rounded px-2 py-1">
                              <span className="text-green-800">{item.qty}x {item.name}</span>
                              <span className="text-green-700">₱{item.subtotal?.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-xs bg-green-50 text-green-800 rounded-lg p-3 overflow-x-auto">
                      {JSON.stringify(selectedLog.new_values, null, 2)}
                    </pre>
                  )}
                </div>
              )}
              {selectedLog.metadata && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Metadata</p>
                  <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
