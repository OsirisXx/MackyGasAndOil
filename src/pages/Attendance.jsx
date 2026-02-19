import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useBranchStore } from '../stores/branchStore'
import { Clock, Calendar, Search, User, LayoutList, GitBranch, RefreshCw } from 'lucide-react'
import { format, subDays, parseISO, differenceInMinutes } from 'date-fns'

export default function Attendance() {
  const { selectedBranchId, initialized } = useBranchStore()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [filterCashier, setFilterCashier] = useState('')
  const [cashiers, setCashiers] = useState([])
  const [viewMode, setViewMode] = useState('table') // 'table' or 'timeline'

  useEffect(() => {
    if (initialized) fetchCashiers()
  }, [initialized, selectedBranchId])

  useEffect(() => {
    if (initialized) fetchRecords()
  }, [startDate, endDate, filterCashier, selectedBranchId, initialized])

  const fetchCashiers = async () => {
    let q = supabase.from('cashiers').select('id, full_name').order('full_name')
    if (selectedBranchId) q = q.eq('branch_id', selectedBranchId)
    const { data } = await q
    setCashiers(data || [])
  }

  const fetchRecords = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('attendance')
        .select('*, cashiers(full_name)')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('check_in', { ascending: false })

      if (filterCashier) query = query.eq('cashier_id', filterCashier)
      if (selectedBranchId) query = query.eq('branch_id', selectedBranchId)

      const { data, error } = await query
      if (!error) setRecords(data || [])
    } catch (err) {
      console.error('Attendance fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getDuration = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return '—'
    const ms = new Date(checkOut) - new Date(checkIn)
    const hours = Math.floor(ms / 3600000)
    const mins = Math.floor((ms % 3600000) / 60000)
    return `${hours}h ${mins}m`
  }

  // Group records by cashier for timeline view
  const groupedByCashier = useMemo(() => {
    const groups = {}
    records.forEach(r => {
      const name = r.cashiers?.full_name || 'Unknown'
      if (!groups[name]) groups[name] = []
      groups[name].push(r)
    })
    // Sort each group by check_in time
    Object.keys(groups).forEach(name => {
      groups[name].sort((a, b) => new Date(a.check_in) - new Date(b.check_in))
    })
    return groups
  }, [records])

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Attendance</h1>
        <p className="text-gray-500 text-sm">Cashier check-in / check-out records via QR</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
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
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cashier</label>
          <select value={filterCashier} onChange={e => setFilterCashier(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All Cashiers</option>
            {cashiers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary & View Toggle */}
      <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">{records.length} attendance records</span>
          </div>
          <button onClick={fetchRecords} disabled={loading}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <LayoutList size={14} /> Table
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <GitBranch size={14} /> Timeline
          </button>
        </div>
      </div>

      {/* Timeline View - Horizontal Time Graph */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">Loading...</div>
          ) : Object.keys(groupedByCashier).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">No attendance records found</div>
          ) : (
            Object.entries(groupedByCashier).map(([cashierName, shifts]) => {
              // Group shifts by date
              const shiftsByDate = {}
              shifts.forEach(s => {
                const dateKey = s.shift_date
                if (!shiftsByDate[dateKey]) shiftsByDate[dateKey] = []
                shiftsByDate[dateKey].push(s)
              })
              // Sort shifts within each day by check_in time
              Object.keys(shiftsByDate).forEach(d => {
                shiftsByDate[d].sort((a, b) => new Date(a.check_in) - new Date(b.check_in))
              })

              const hourLabels = [
                { hour: 0, label: '12AM' },
                { hour: 3, label: '3AM' },
                { hour: 6, label: '6AM' },
                { hour: 9, label: '9AM' },
                { hour: 12, label: '12PM' },
                { hour: 15, label: '3PM' },
                { hour: 18, label: '6PM' },
                { hour: 21, label: '9PM' },
              ]

              return (
                <div key={cashierName} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Cashier Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center text-lg font-bold">
                      {cashierName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{cashierName}</p>
                      <p className="text-xs text-blue-100">{shifts.length} shift{shifts.length !== 1 ? 's' : ''} • {Object.keys(shiftsByDate).length} day{Object.keys(shiftsByDate).length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  
                  {/* Hour Scale Header */}
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
                    <div className="flex items-center">
                      <div className="w-24 flex-shrink-0"></div>
                      <div className="flex-1 relative h-6">
                        {hourLabels.map(({ hour, label }) => (
                          <div 
                            key={hour}
                            className="absolute text-[10px] font-medium text-gray-500"
                            style={{ left: `${(hour / 24) * 100}%`, transform: 'translateX(-50%)' }}
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                      <div className="w-20 flex-shrink-0 text-right text-[10px] font-medium text-gray-500">TOTAL</div>
                    </div>
                  </div>
                  
                  {/* Timeline Rows */}
                  <div className="divide-y divide-gray-100">
                    {Object.entries(shiftsByDate).sort((a, b) => new Date(b[0]) - new Date(a[0])).map(([date, dayShifts]) => {
                      const getHourPosition = (time) => {
                        if (!time) return null
                        const d = new Date(time)
                        return (d.getHours() + d.getMinutes() / 60) / 24 * 100
                      }

                      const totalMins = dayShifts.reduce((t, s) => {
                        if (!s.check_in || !s.check_out) return t
                        return t + differenceInMinutes(new Date(s.check_out), new Date(s.check_in))
                      }, 0)

                      return (
                        <div key={date} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            {/* Date label */}
                            <div className="w-24 flex-shrink-0">
                              <p className="text-sm font-semibold text-gray-800">{format(new Date(date), 'MMM d, yyyy')}</p>
                              <p className="text-xs text-gray-400">{format(new Date(date), 'EEEE')}</p>
                            </div>
                            
                            {/* Time bar container */}
                            <div className="flex-1 relative">
                              {/* Background with grid lines */}
                              <div className="h-10 bg-gray-100 rounded-lg relative border border-gray-200">
                                {/* Hour grid lines */}
                                {hourLabels.map(({ hour }) => (
                                  <div 
                                    key={hour}
                                    className="absolute top-0 bottom-0 w-px bg-gray-200"
                                    style={{ left: `${(hour / 24) * 100}%` }}
                                  />
                                ))}
                                
                                {/* Shift bars */}
                                {dayShifts.map((shift) => {
                                  const startPos = getHourPosition(shift.check_in)
                                  const endPos = shift.check_out ? getHourPosition(shift.check_out) : getHourPosition(new Date())
                                  const isOngoing = shift.status === 'checked_in'
                                  
                                  if (startPos === null) return null
                                  
                                  const width = Math.max((endPos || 100) - startPos, 0.5)
                                  
                                  return (
                                    <div
                                      key={shift.id}
                                      className={`absolute top-1.5 bottom-1.5 rounded-md shadow-sm cursor-pointer transition-all hover:scale-y-110 ${
                                        isOngoing 
                                          ? 'bg-gradient-to-r from-green-400 to-green-500 animate-pulse' 
                                          : 'bg-gradient-to-r from-blue-400 to-blue-500'
                                      }`}
                                      style={{ 
                                        left: `${startPos}%`, 
                                        width: `${width}%`,
                                        minWidth: '6px'
                                      }}
                                      title={`${format(new Date(shift.check_in), 'h:mm a')} → ${shift.check_out ? format(new Date(shift.check_out), 'h:mm a') : 'ongoing'}`}
                                    />
                                  )
                                })}
                              </div>
                              
                              {/* Shift details below bar */}
                              <div className="flex flex-wrap gap-2 mt-2">
                                {dayShifts.map((shift, idx) => {
                                  const isOngoing = shift.status === 'checked_in'
                                  const prevShift = idx > 0 ? dayShifts[idx - 1] : null
                                  const gapMins = prevShift?.check_out && shift.check_in
                                    ? differenceInMinutes(new Date(shift.check_in), new Date(prevShift.check_out))
                                    : null
                                  
                                  return (
                                    <div key={shift.id} className="flex items-center gap-1">
                                      {/* Gap warning */}
                                      {gapMins !== null && gapMins > 5 && (
                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">
                                          ↔ {gapMins < 60 ? `${gapMins}m` : `${Math.floor(gapMins/60)}h ${gapMins%60}m`}
                                        </span>
                                      )}
                                      {/* Shift time badge */}
                                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                        isOngoing 
                                          ? 'bg-green-100 text-green-700' 
                                          : 'bg-blue-100 text-blue-700'
                                      }`}>
                                        {format(new Date(shift.check_in), 'h:mma')} → {shift.check_out ? format(new Date(shift.check_out), 'h:mma') : '...'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            
                            {/* Duration summary */}
                            <div className="w-20 flex-shrink-0 text-right">
                              <p className={`text-sm font-bold ${totalMins > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                                {totalMins > 0 
                                  ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
                                  : 'ongoing'
                                }
                              </p>
                              {dayShifts.length > 1 && (
                                <p className="text-[10px] text-amber-600 font-medium">{dayShifts.length} shifts</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Cashier</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Date</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Check In</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Check Out</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Duration</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No attendance records found</td></tr>
              ) : (
                records.map(r => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                          {r.cashiers?.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-gray-800">{r.cashiers?.full_name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{format(new Date(r.shift_date), 'MMM d, yyyy')}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {r.check_in ? format(new Date(r.check_in), 'h:mm a') : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {r.check_out ? format(new Date(r.check_out), 'h:mm a') : '—'}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">
                      {getDuration(r.check_in, r.check_out)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        r.status === 'checked_in'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {r.status === 'checked_in' ? 'On Shift' : 'Completed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
