import { useState, useEffect } from 'react'
import { Calendar, Clock, Edit2, X, CheckCircle, XCircle, AlertCircle, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function ScheduleList({ branchId, onEdit, onRefresh }) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [cancelConfirm, setCancelConfirm] = useState(null)

  useEffect(() => {
    if (branchId) {
      fetchSchedules()
      subscribeToUpdates()
    }
  }, [branchId, statusFilter])

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
      pending: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Pending' },
      executed: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Executed' },
      cancelled: { color: 'bg-gray-100 text-gray-800', icon: XCircle, label: 'Cancelled' },
      failed: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Failed' }
    }

    const badge = badges[status] || badges.pending
    const Icon = badge.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="all">All Schedules</option>
          <option value="pending">Pending</option>
          <option value="executed">Executed</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Schedules List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-2">Loading schedules...</p>
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No schedules found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => (
            <div
              key={schedule.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusBadge(schedule.status)}
                    {schedule.status === 'pending' && (
                      <span className="text-xs text-gray-500">
                        {calculateCountdown(schedule.scheduled_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium">
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(schedule)}
                      disabled={!canEdit(schedule)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={canEdit(schedule) ? 'Edit schedule' : 'Cannot edit within 5 minutes of execution'}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCancelClick(schedule)}
                      disabled={!canCancel(schedule)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={canCancel(schedule) ? 'Cancel schedule' : 'Cannot cancel within 1 minute of execution'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Schedule Details */}
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 w-20">Pumps:</span>
                  <span className="text-xs text-gray-700 flex-1">
                    {schedule.pump_ids.length} pump{schedule.pump_ids.length !== 1 ? 's' : ''} affected
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-500 w-20">Prices:</span>
                  <div className="text-xs text-gray-700 flex-1">
                    {Object.entries(schedule.price_changes).slice(0, 3).map(([pumpId, price]) => (
                      <span key={pumpId} className="inline-block mr-2">
                        ₱{parseFloat(price).toFixed(2)}
                      </span>
                    ))}
                    {Object.keys(schedule.price_changes).length > 3 && (
                      <span className="text-gray-500">
                        +{Object.keys(schedule.price_changes).length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                {schedule.created_by_name && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Created by:</span>
                    <span className="text-xs text-gray-700">{schedule.created_by_name}</span>
                  </div>
                )}

                {schedule.executed_at && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Executed:</span>
                    <span className="text-xs text-gray-700">
                      {new Date(schedule.executed_at).toLocaleString()}
                    </span>
                  </div>
                )}

                {schedule.cancelled_at && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Cancelled:</span>
                    <span className="text-xs text-gray-700">
                      {new Date(schedule.cancelled_at).toLocaleString()}
                    </span>
                  </div>
                )}

                {schedule.error_message && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Error:</span>
                    <span className="text-xs text-red-600">{schedule.error_message}</span>
                  </div>
                )}

                {schedule.notes && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-500 w-20">Notes:</span>
                    <span className="text-xs text-gray-700 italic">{schedule.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Cancel Schedule</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  You are about to cancel the price change scheduled for:
                </p>
                <p className="font-semibold text-gray-900">
                  {new Date(cancelConfirm.scheduled_at).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Affecting {cancelConfirm.pump_ids.length} pump{cancelConfirm.pump_ids.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Cancel Schedule
                </button>
                <button
                  onClick={() => setCancelConfirm(null)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
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
