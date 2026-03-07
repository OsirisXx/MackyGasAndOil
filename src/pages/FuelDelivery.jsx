import { useEffect, useState } from 'react'
import { useFuelDeliveryStore } from '../stores/fuelDeliveryStore'
import { useFuelStore } from '../stores/fuelStore'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { Truck, Plus, Save, X, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function FuelDelivery() {
  const { tanks, deliveries, fetchTanks, fetchDeliveries, createDelivery } = useFuelDeliveryStore()
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { cashier } = useAuthStore()
  const { selectedBranchId } = useBranchStore()
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    tank_id: '',
    fuel_type_id: '',
    supplier_name: '',
    truck_number: '',
    driver_name: '',
    delivery_date: format(new Date(), 'yyyy-MM-dd'),
    delivery_time: format(new Date(), 'HH:mm'),
    waybill_number: '',
    delivery_ticket_number: '',
    opening_dip_reading: '',
    closing_dip_reading: '',
    waybill_quantity: '',
    temperature_celsius: '',
    cost_per_liter: '',
    notes: '',
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        await Promise.all([
          fetchTanks(selectedBranchId),
          fetchFuelTypes(),
          fetchDeliveries(selectedBranchId)
        ])
      } catch (err) {
        console.error('FuelDelivery fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedBranchId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const openingDip = parseFloat(formData.opening_dip_reading)
    const closingDip = parseFloat(formData.closing_dip_reading)
    const waybillQty = parseFloat(formData.waybill_quantity)

    if (isNaN(openingDip) || isNaN(closingDip) || isNaN(waybillQty)) {
      return toast.error('Please enter valid readings')
    }

    if (closingDip <= openingDip) {
      return toast.error('Closing dip must be greater than opening dip')
    }

    const actualReceived = closingDip - openingDip
    const variance = actualReceived - waybillQty
    const variancePercentage = (variance / waybillQty) * 100

    let status = 'pending'
    if (Math.abs(variancePercentage) <= 0.5) {
      status = 'verified'
    } else if (Math.abs(variancePercentage) > 1) {
      status = 'flagged'
    }

    const deliveryData = {
      ...formData,
      branch_id: selectedBranchId,
      cashier_id: cashier?.id,
      opening_dip_reading: openingDip,
      closing_dip_reading: closingDip,
      waybill_quantity: waybillQty,
      temperature_celsius: formData.temperature_celsius ? parseFloat(formData.temperature_celsius) : null,
      cost_per_liter: formData.cost_per_liter ? parseFloat(formData.cost_per_liter) : null,
      total_cost: formData.cost_per_liter ? parseFloat(formData.cost_per_liter) * actualReceived : null,
      status,
    }

    setLoading(true)
    const result = await createDelivery(deliveryData)
    
    if (result.success) {
      toast.success('Fuel delivery recorded successfully!')
      setShowForm(false)
      resetForm()
      fetchDeliveries(selectedBranchId)
    } else {
      toast.error(result.error || 'Failed to record delivery')
    }
    setLoading(false)
  }

  const resetForm = () => {
    setFormData({
      tank_id: '',
      fuel_type_id: '',
      supplier_name: '',
      truck_number: '',
      driver_name: '',
      delivery_date: format(new Date(), 'yyyy-MM-dd'),
      delivery_time: format(new Date(), 'HH:mm'),
      waybill_number: '',
      delivery_ticket_number: '',
      opening_dip_reading: '',
      closing_dip_reading: '',
      waybill_quantity: '',
      temperature_celsius: '',
      cost_per_liter: '',
      notes: '',
    })
  }

  const handleTankChange = (tankId) => {
    const tank = tanks.find(t => t.id === tankId)
    setFormData(prev => ({
      ...prev,
      tank_id: tankId,
      fuel_type_id: tank?.fuel_type_id || ''
    }))
  }

  const calculateVariance = () => {
    const opening = parseFloat(formData.opening_dip_reading)
    const closing = parseFloat(formData.closing_dip_reading)
    const waybill = parseFloat(formData.waybill_quantity)

    if (isNaN(opening) || isNaN(closing) || isNaN(waybill)) return null

    const actual = closing - opening
    const variance = actual - waybill
    const percentage = (variance / waybill) * 100

    return { actual, variance, percentage }
  }

  const variance = calculateVariance()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 mb-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/pos" className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft size={18} />
              <span className="text-sm font-medium">Back to POS</span>
            </a>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">Fuel Delivery</h1>
              <p className="text-xs text-gray-500">Record tank refills and deliveries</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{cashier?.full_name}</p>
            <p className="text-xs text-gray-500">{cashier?.branches?.name}</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'Record Delivery'}
          </button>
        </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Truck className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">New Fuel Delivery</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tank *</label>
                <select
                  value={formData.tank_id}
                  onChange={(e) => handleTankChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select Tank</option>
                  {tanks.map(tank => (
                    <option key={tank.id} value={tank.id}>
                      Tank {tank.tank_number} - {tank.tank_name} ({tank.fuel_types?.short_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., Petron, Shell"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Truck Number</label>
                <input
                  type="text"
                  value={formData.truck_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, truck_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., ABC-1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                <input
                  type="text"
                  value={formData.driver_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, driver_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date *</label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Time</label>
                <input
                  type="time"
                  value={formData.delivery_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Waybill Number</label>
                <input
                  type="text"
                  value={formData.waybill_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, waybill_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Ticket #</label>
                <input
                  type="text"
                  value={formData.delivery_ticket_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, delivery_ticket_number: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-md font-semibold text-gray-800 mb-4">Tank Dip Readings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opening Dip (Liters) *</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.opening_dip_reading}
                    onChange={(e) => setFormData(prev => ({ ...prev, opening_dip_reading: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    placeholder="0.000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Closing Dip (Liters) *</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.closing_dip_reading}
                    onChange={(e) => setFormData(prev => ({ ...prev, closing_dip_reading: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    placeholder="0.000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Waybill Quantity (Liters) *</label>
                  <input
                    type="number"
                    step="0.001"
                    value={formData.waybill_quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, waybill_quantity: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    placeholder="0.000"
                  />
                </div>
              </div>

              {variance && (
                <div className={`mt-4 p-4 rounded-lg ${
                  Math.abs(variance.percentage) <= 0.5 ? 'bg-green-50 border border-green-200' :
                  Math.abs(variance.percentage) <= 1 ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-start gap-3">
                    {Math.abs(variance.percentage) <= 0.5 ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">Delivery Variance</p>
                      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Actual Received:</span>
                          <p className="font-semibold font-mono">{variance.actual.toFixed(3)} L</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Variance:</span>
                          <p className={`font-semibold font-mono ${variance.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {variance.variance >= 0 ? '+' : ''}{variance.variance.toFixed(3)} L
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Percentage:</span>
                          <p className={`font-semibold font-mono ${Math.abs(variance.percentage) <= 0.5 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {variance.percentage >= 0 ? '+' : ''}{variance.percentage.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.temperature_celsius}
                  onChange={(e) => setFormData(prev => ({ ...prev, temperature_celsius: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g., 28.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Liter (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost_per_liter}
                  onChange={(e) => setFormData(prev => ({ ...prev, cost_per_liter: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Additional notes about this delivery..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save Delivery
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Recent Deliveries</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waybill</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No deliveries recorded yet
                  </td>
                </tr>
              ) : (
                deliveries.map(delivery => (
                  <tr key={delivery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(delivery.delivery_date), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      Tank {delivery.fuel_tanks?.tank_number} ({delivery.fuel_types?.short_code})
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {delivery.supplier_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {delivery.waybill_quantity?.toFixed(3)} L
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {delivery.actual_received?.toFixed(3)} L
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                      <span className={delivery.variance_liters >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {delivery.variance_liters >= 0 ? '+' : ''}{delivery.variance_liters?.toFixed(3)} L
                        ({delivery.variance_percentage >= 0 ? '+' : ''}{delivery.variance_percentage?.toFixed(2)}%)
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        delivery.status === 'verified' ? 'bg-green-100 text-green-800' :
                        delivery.status === 'flagged' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {delivery.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}
