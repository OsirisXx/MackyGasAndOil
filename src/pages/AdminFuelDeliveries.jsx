import { useEffect, useState } from 'react'
import { useFuelDeliveryStore } from '../stores/fuelDeliveryStore'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { Truck, Filter, Download, CheckCircle, AlertTriangle, XCircle, Eye } from 'lucide-react'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'

export default function AdminFuelDeliveries() {
  const { tanks, deliveries, fetchTanks, fetchDeliveries, updateDelivery } = useFuelDeliveryStore()
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { branches, selectedBranchId } = useBranchStore()
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'all',
    fuelTypeId: 'all',
  })
  const [selectedDelivery, setSelectedDelivery] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        await Promise.all([
          fetchTanks(selectedBranchId),
          fetchFuelTypes(),
          fetchDeliveries(selectedBranchId, filters.startDate, filters.endDate)
        ])
      } catch (err) {
        console.error('AdminFuelDeliveries fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedBranchId, filters.startDate, filters.endDate])

  const handleStatusUpdate = async (deliveryId, newStatus) => {
    setLoading(true)
    const result = await updateDelivery(deliveryId, { status: newStatus })
    
    if (result.success) {
      toast.success(`Delivery status updated to ${newStatus}`)
    } else {
      toast.error(result.error || 'Failed to update status')
    }
    setLoading(false)
  }

  const filteredDeliveries = deliveries.filter(d => {
    if (filters.status !== 'all' && d.status !== filters.status) return false
    if (filters.fuelTypeId !== 'all' && d.fuel_type_id !== filters.fuelTypeId) return false
    return true
  })

  const stats = {
    total: filteredDeliveries.length,
    verified: filteredDeliveries.filter(d => d.status === 'verified').length,
    flagged: filteredDeliveries.filter(d => d.status === 'flagged').length,
    pending: filteredDeliveries.filter(d => d.status === 'pending').length,
    totalVolume: filteredDeliveries.reduce((sum, d) => sum + (d.actual_received || 0), 0),
    totalVariance: filteredDeliveries.reduce((sum, d) => sum + (d.variance_liters || 0), 0),
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Fuel Deliveries Management</h1>
        <p className="text-sm text-gray-500 mt-1">Track and verify all fuel deliveries</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Deliveries</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <Truck className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Verified</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.verified}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Flagged</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.flagged}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Volume</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalVolume.toFixed(0)}</p>
              <p className="text-xs text-gray-500">Liters</p>
            </div>
            <Truck className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-800">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
            <select
              value={filters.fuelTypeId}
              onChange={(e) => setFilters(prev => ({ ...prev, fuelTypeId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Fuel Types</option>
              {fuelTypes.map(fuel => (
                <option key={fuel.id} value={fuel.id}>
                  {fuel.name} ({fuel.short_code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Delivery Records</h2>
          <button className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waybill</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    No deliveries found
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map(delivery => (
                  <tr key={delivery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {format(new Date(delivery.delivery_date), 'MMM dd, yyyy')}
                      </div>
                      {delivery.delivery_time && (
                        <div className="text-xs text-gray-500">
                          {delivery.delivery_time}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        Tank {delivery.fuel_tanks?.tank_number}
                      </div>
                      <div className="text-xs text-gray-500">
                        {delivery.fuel_types?.short_code}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{delivery.supplier_name}</div>
                      {delivery.truck_number && (
                        <div className="text-xs text-gray-500">{delivery.truck_number}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {delivery.waybill_quantity?.toFixed(3)} L
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {delivery.actual_received?.toFixed(3)} L
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-mono ${
                        Math.abs(delivery.variance_percentage) <= 0.5 ? 'text-green-600' :
                        Math.abs(delivery.variance_percentage) <= 1 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {delivery.variance_liters >= 0 ? '+' : ''}{delivery.variance_liters?.toFixed(3)} L
                      </div>
                      <div className={`text-xs ${
                        Math.abs(delivery.variance_percentage) <= 0.5 ? 'text-green-600' :
                        Math.abs(delivery.variance_percentage) <= 1 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        ({delivery.variance_percentage >= 0 ? '+' : ''}{delivery.variance_percentage?.toFixed(2)}%)
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={delivery.status}
                        onChange={(e) => handleStatusUpdate(delivery.id, e.target.value)}
                        className={`px-2 py-1 text-xs font-medium rounded-full border-0 outline-none cursor-pointer ${
                          delivery.status === 'verified' ? 'bg-green-100 text-green-800' :
                          delivery.status === 'flagged' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="verified">Verified</option>
                        <option value="flagged">Flagged</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedDelivery(delivery)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDelivery && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">Delivery Details</h2>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Delivery Date</p>
                  <p className="font-medium">{format(new Date(selectedDelivery.delivery_date), 'MMMM dd, yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Delivery Time</p>
                  <p className="font-medium">{selectedDelivery.delivery_time || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tank</p>
                  <p className="font-medium">Tank {selectedDelivery.fuel_tanks?.tank_number} - {selectedDelivery.fuel_tanks?.tank_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fuel Type</p>
                  <p className="font-medium">{selectedDelivery.fuel_types?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Supplier</p>
                  <p className="font-medium">{selectedDelivery.supplier_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Truck Number</p>
                  <p className="font-medium">{selectedDelivery.truck_number || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Driver</p>
                  <p className="font-medium">{selectedDelivery.driver_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Waybill Number</p>
                  <p className="font-medium">{selectedDelivery.waybill_number || 'N/A'}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-800 mb-3">Tank Readings</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Opening Dip</p>
                    <p className="font-mono font-medium">{selectedDelivery.opening_dip_reading?.toFixed(3)} L</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Closing Dip</p>
                    <p className="font-mono font-medium">{selectedDelivery.closing_dip_reading?.toFixed(3)} L</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Actual Received</p>
                    <p className="font-mono font-medium text-green-600">{selectedDelivery.actual_received?.toFixed(3)} L</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-800 mb-3">Variance Analysis</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Waybill Quantity</p>
                    <p className="font-mono font-medium">{selectedDelivery.waybill_quantity?.toFixed(3)} L</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Variance</p>
                    <p className={`font-mono font-medium ${selectedDelivery.variance_liters >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedDelivery.variance_liters >= 0 ? '+' : ''}{selectedDelivery.variance_liters?.toFixed(3)} L
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Percentage</p>
                    <p className={`font-mono font-medium ${Math.abs(selectedDelivery.variance_percentage) <= 0.5 ? 'text-green-600' : 'text-yellow-600'}`}>
                      {selectedDelivery.variance_percentage >= 0 ? '+' : ''}{selectedDelivery.variance_percentage?.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              {selectedDelivery.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="mt-1">{selectedDelivery.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
