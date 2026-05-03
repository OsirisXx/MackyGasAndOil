import { useState, useEffect } from 'react'
import { Calendar, Clock, Edit2, X, CheckCircle, XCircle, AlertCircle, Filter, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function ScheduleList({ branchId, onEdit, onRefresh }) {
  const [schedules, setSchedules] = useState([])
  const [pumps, setPumps] = useState([]) // For pump names
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [cancelConfirm, setCancelConfirm] = useState(null)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5

  useEffect(() => {
    if (branchId) {
      fetchPumps()
      fetchSchedules()
      subscribeToUpdates()
    }
  }, [branchId, statusFilter])

  const fetchPumps = async () => {
    const { data } = await supabase
      .from('pumps')
      .select('id, pump_name, price_per_liter')
      .eq('branch_id', branchId)
    
    if (data) setPumps(data)
  }

  const fetchSchedules = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('price_change_schedules')
        .select('*')
        .eq('branch_id', branchId)

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      } else {
        // For 'all', show pending + recent executed/cancelled
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        query = query.or(
          `status.eq.pending,and(status.eq.executed,executed_at.gte.${thirtyDaysAgo.toISOString()}),and(status.eq.cancelled,cancelled_at.gte.${sevenDaysAgo.toISOString()}),status.eq.failed`
        )
      }

      // Sort: pending by scheduled_at asc, others by created_at desc
      if (statusFilter === 'pending') {
        query = query.order('scheduled_at', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query

      if (error) throw error
      setSchedules(data || [])
      setCurrentPage(1) // Reset to first page when filter changes
    } catch (error) {
      console.error('Error fetching schedules:', error)
      toast.error('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  const subscribeToUpdates = () => {
    const channel = supabase
      .channel('price_change_schedules_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'price_change_schedules',
          filter: `branch_id=eq.${branchId}`
        },
        (payload) => {
          console.log('Schedule change detected:', payload)
          fetchSchedules()
          if (onRefresh) onRefresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const calculateCountdown = (scheduledAt) => {
    const now = new Date()
    const scheduled = new Date(scheduledAt)
    const diffMs = scheduled - now

    if (diffMs < 0) return 'Overdue'

    const diffMinutes = Math.floor(diffMs / 1000 / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    } else if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60
      return `in ${diffHours}h ${remainingMinutes}m`
    } else {
      return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`
    }
  }

  const canEdit = (schedule) => {
    if (schedule.status !== 'pending') return false
    
    const now = new Date()
    const scheduled = new Date(schedule.scheduled_at)
    const diffMinutes = (scheduled - now) / 1000 / 60
    
    return diffMinutes >= 5
  }

  const canCancel = (schedule) => {
    if (schedule.status !== 'pending') return false
    
    const now = new Date()
    const scheduled = new Date(schedule.scheduled_at)
    const diffMinutes = (scheduled - now) / 1000 / 60
    
    return diffMinutes >= 1
  }

  const handleCancelClick = (schedule) => {
    if (!canCancel(schedule)) {
      toast.error('Cannot cancel schedule within 1 minute of execution')
      return
    }
    setCancelConfirm(schedule)
  }

  const handleCancelConfirm = async () => {
    if (!cancelConfirm) return

    try {
      const { error } = await supabase
        .from('price_change_schedules')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cancelConfirm.id)

      if (error) throw error

      toast.success('Schedule cancelled successfully')
      setCancelConfirm(null)
      fetchSchedules()
      if (onRefresh) onRefresh()
    } catch (error) {
      console.error('Error cancelling schedule:', error)
      toast.error('Failed to cancel schedule')
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock, label: 'Pending' },
      executed: { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle, label: 'Executed' },
      cancelled: { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: XCircle, label: 'Cancelled' },
      failed: { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertCircle, label: 'Failed' }
    }

    const badge = badges[status] || badges.pending
    const Icon = badge.icon

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {badge.label}
      </span>
    )
  }

  const getPumpName = (pumpId) => {
    const pump = pumps.find(p => p.id === pumpId)
    return pump ? pump.pump_name : `Pump ${pumpId.slice(0, 8)}`
  }

  const getOldPrice = (pumpId) => {
    const pump = pumps.find(p => p.id === pumpId)
    return pump ? parseFloat(pump.price_per_liter) : null
  }

  // Pagination
  const totalPages = Math.ceil(schedules.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentSchedules = schedules.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      {/* Header with Filter */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <Filter className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Filter Schedules</h3>
            <p className="text-xs text-gray-500">View by status</p>
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border-2 border-blue-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white shadow-sm"
        >
          <option value="all">All Schedules</option>
          <option value="pending">⏳ Pending</option>
          <option value="executed">✅ Executed</option>
          <option value="cancelled">❌ Cancelled</option>
          <option value="failed">⚠️ Failed</option>
        </select>
      </div>

      {/* Schedules List */}
      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-200">
          <div className="animate-spin rounded-full h-10 w-10 border-b-3 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-3 font-medium">Loading schedules...</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-3" />
          <p className="text-base font-semibold text-gray-700">No schedules found</p>
          <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {currentSchedules.map(schedule => (
              <div
                key={schedule.id}
                className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-blue-300 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(schedule.status)}
                      {schedule.status === 'pending' && (
                        <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-full border border-orange-200">
                          ⏱️ {calculateCountdown(schedule.scheduled_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold">
                        {new Date(schedule.scheduled_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {schedule.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(schedule)}
                        disabled={!canEdit(schedule)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-blue-200 hover:border-blue-300"
                        title={canEdit(schedule) ? 'Edit schedule' : 'Cannot edit within 5 minutes of execution'}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCancelClick(schedule)}
                        disabled={!canCancel(schedule)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-red-200 hover:border-red-300"
                        title={canCancel(schedule) ? 'Cancel schedule' : 'Cannot cancel within 1 minute of execution'}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Price Changes - Before/After */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-3 border border-blue-100">
                  <h4 className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Price Changes</h4>
                  <div className="space-y-2">
                    {Object.entries(schedule.price_changes).map(([pumpId, newPrice]) => {
                      const oldPrice = getOldPrice(pumpId)
                      const priceDiff = oldPrice ? parseFloat(newPrice) - oldPrice : 0
                      const isIncrease = priceDiff > 0
                      
                      return (
                        <div key={pumpId} className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100">
                          <span className="text-sm font-semibold text-gray-800">{getPumpName(pumpId)}</span>
                          <div className="flex items-center gap-3">
                            {oldPrice && (
                              <>
                                <span className="text-sm text-gray-500 line-through">₱{oldPrice.toFixed(2)}</span>
                                <span className="text-gray-400">→</span>
                              </>
                            )}
                            <span className="text-sm font-bold text-blue-600">₱{parseFloat(newPrice).toFixed(2)}</span>
                            {oldPrice && (
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
                                isIncrease ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {isIncrease ? '+' : ''}{priceDiff.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Additional Details */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {schedule.created_by_name && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="font-semibold">Created by:</span>
                      <span>{schedule.created_by_name}</span>
                    </div>
                  )}

                  {schedule.executed_at && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="font-semibold">Executed:</span>
                      <span>{new Date(schedule.executed_at).toLocaleString()}</span>
                    </div>
                  )}

                  {schedule.cancelled_at && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <span className="font-semibold">Cancelled:</span>
                      <span>{new Date(schedule.cancelled_at).toLocaleString()}</span>
                    </div>
                  )}

                  {schedule.error_message && (
                    <div className="col-span-2 flex items-start gap-2 text-red-600 bg-red-50 p-2 rounded border border-red-200">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{schedule.error_message}</span>
                    </div>
                  )}

                  {schedule.notes && (
                    <div className="col-span-2 flex items-start gap-2 text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
                      <span className="font-semibold">Notes:</span>
                      <span className="italic">{schedule.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white border-2 border-gray-200 rounded-xl p-4">
              <div className="text-sm text-gray-600">
                Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                <span className="font-semibold">{Math.min(endIndex, schedules.length)}</span> of{' '}
                <span className="font-semibold">{schedules.length}</span> schedules
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg font-semibold text-sm transition-colors ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border-2 border-gray-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-xl border-2 border-red-200">
                  <AlertCircle className="w-7 h-7 text-red-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Cancel Schedule</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-4 mb-4 border-2 border-red-100">
                <p className="text-sm text-gray-700 mb-2 font-medium">
                  You are about to cancel the price change scheduled for:
                </p>
                <p className="font-bold text-gray-900 text-lg">
                  {new Date(cancelConfirm.scheduled_at).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Affecting <span className="font-semibold">{cancelConfirm.pump_ids.length}</span> pump{cancelConfirm.pump_ids.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleCancelConfirm}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-semibold shadow-lg hover:shadow-xl"
                >
                  Cancel Schedule
                </button>
                <button
                  onClick={() => setCancelConfirm(null)}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold border-2 border-gray-300"
                >
                  Keep Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
