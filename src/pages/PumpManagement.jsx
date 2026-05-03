import { useEffect, useState } from 'react'
import { usePumpStore } from '../stores/pumpStore'
import { useBranchStore } from '../stores/branchStore'
import { useFuelDeliveryStore } from '../stores/fuelDeliveryStore'
import { Plus, Edit2, Trash2, Save, X, AlertTriangle, Fuel, Gauge, Settings, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'
import SchedulePriceChangeForm from '../components/SchedulePriceChangeForm'
import ScheduleList from '../components/ScheduleList'

export default function PumpManagement() {
  const { pumps, fetchPumps, createPump, updatePump, deletePump, initializePumpReading, adjustPumpReading, loading } = usePumpStore()
  const { selectedBranchId, branches } = useBranchStore()
  const { tanks, fetchTanks } = useFuelDeliveryStore()
  const [showForm, setShowForm] = useState(false)
  const [editingPump, setEditingPump] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [readingModal, setReadingModal] = useState(null) // { pump, mode: 'initialize' | 'adjust' }
  const [readingInput, setReadingInput] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  
  // Schedule management state
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [showSchedules, setShowSchedules] = useState(false)

  const [formData, setFormData] = useState({
    pump_number: '',
    pump_name: '',
    fuel_type: '',
    category: 'regular',
    price_per_liter: '',
    tank_id: '',
    notes: '',
  })

  useEffect(() => {
    if (selectedBranchId) {
      fetchPumps(selectedBranchId)
      fetchTanks(selectedBranchId)
    }
  }, [selectedBranchId])

  const resetForm = () => {
    setFormData({
      pump_number: '',
      pump_name: '',
      fuel_type: '',
      category: 'regular',
      price_per_liter: '',
      tank_id: '',
      notes: '',
    })
    setEditingPump(null)
    setShowForm(false)
  }

  const handleEdit = (pump) => {
    setEditingPump(pump)
    setFormData({
      pump_number: pump.pump_number,
      pump_name: pump.pump_name,
      fuel_type: pump.fuel_type,
      category: pump.category || 'regular',
      price_per_liter: pump.price_per_liter,
      tank_id: pump.tank_id || '',
      notes: pump.notes || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedBranchId) {
      return toast.error('Please select a branch first')
    }

    const pumpData = {
      ...formData,
      branch_id: selectedBranchId,
      pump_number: parseInt(formData.pump_number),
      price_per_liter: parseFloat(formData.price_per_liter),
      tank_id: formData.tank_id || null,
    }

    let result
    if (editingPump) {
      result = await updatePump(editingPump.id, pumpData)
      if (result.success) {
        toast.success('Pump updated successfully')
        logAudit('update', 'pump', `Updated pump ${formData.pump_number}`, {
          entityId: editingPump.id,
          oldValues: editingPump,
          newValues: pumpData,
          branchId: selectedBranchId,
        })
      }
    } else {
      result = await createPump(pumpData)
      if (result.success) {
        toast.success('Pump created successfully')
        logAudit('create', 'pump', `Created pump ${formData.pump_number}`, {
          entityId: result.data.id,
          newValues: pumpData,
          branchId: selectedBranchId,
        })
      }
    }

    if (result.success) {
      resetForm()
    } else {
      toast.error(result.error || 'Failed to save pump')
    }
  }

  const handleDeleteClick = (pump) => {
    setDeleteConfirm(pump)
    setDeleteInput('')
  }

  const handleOpenReadingModal = (pump, mode) => {
    setReadingModal({ pump, mode })
    setReadingInput(mode === 'adjust' ? (pump.current_reading || '').toString() : '')
    setAdjustReason('')
  }

  const handleReadingSubmit = async () => {
    if (!readingInput || isNaN(parseFloat(readingInput))) {
      return toast.error('Please enter a valid reading')
    }

    const reading = parseFloat(readingInput)
    const { pump, mode } = readingModal

    let result
    if (mode === 'initialize') {
      result = await initializePumpReading(pump.id, reading)
      if (result.success) {
        toast.success(`Pump ${pump.pump_number} initialized with reading ${reading.toLocaleString()}`)
        logAudit('create', 'pump_reading', `Initialized pump ${pump.pump_number} reading to ${reading}`, {
          entityId: pump.id,
          newValues: { initial_reading: reading, current_reading: reading },
          branchId: selectedBranchId,
        })
      }
    } else {
      result = await adjustPumpReading(pump.id, reading, adjustReason || 'Manual adjustment')
      if (result.success) {
        toast.success(`Pump ${pump.pump_number} reading adjusted to ${reading.toLocaleString()}`)
        logAudit('update', 'pump_reading', `Adjusted pump ${pump.pump_number} reading to ${reading}`, {
          entityId: pump.id,
          oldValues: { current_reading: pump.current_reading },
          newValues: { current_reading: reading, reason: adjustReason },
          branchId: selectedBranchId,
        })
      }
    }

    if (result.success) {
      setReadingModal(null)
      setReadingInput('')
      setAdjustReason('')
      fetchPumps(selectedBranchId)
    } else {
      toast.error(result.error || 'Failed to update reading')
    }
  }

  const handleDeleteConfirm = async () => {
    if (deleteInput !== deleteConfirm.pump_number.toString()) {
      return toast.error('Pump number does not match')
    }

    const result = await deletePump(deleteConfirm.id)
    if (result.success) {
      toast.success('Pump deleted successfully')
      logAudit('delete', 'pump', `Deleted pump ${deleteConfirm.pump_number}`, {
        entityId: deleteConfirm.id,
        oldValues: deleteConfirm,
        branchId: selectedBranchId,
      })
      setDeleteConfirm(null)
      setDeleteInput('')
    } else {
      toast.error(result.error)
    }
  }

  // Schedule management handlers
  const handleScheduleSuccess = () => {
    setShowScheduleForm(false)
    setEditingSchedule(null)
    toast.success(editingSchedule ? 'Schedule updated' : 'Schedule created')
  }

  const handleScheduleCancel = () => {
    setShowScheduleForm(false)
    setEditingSchedule(null)
  }

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule)
    setShowScheduleForm(true)
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId)

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pump Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure pumps for {selectedBranch?.name || 'selected branch'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowSchedules(!showSchedules)
              setShowScheduleForm(false)
            }}
            disabled={!selectedBranchId}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Clock className="w-4 h-4" />
            {showSchedules ? 'Hide Schedules' : 'View Schedules'}
          </button>
          <button
            onClick={() => {
              setShowScheduleForm(!showScheduleForm)
              setEditingSchedule(null)
              setShowSchedules(false)
            }}
            disabled={!selectedBranchId}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Clock className="w-4 h-4" />
            Schedule Price Change
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={!selectedBranchId}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'Add Pump'}
          </button>
        </div>
      </div>

      {!selectedBranchId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <p className="text-sm text-amber-800">Please select a branch to manage pumps</p>
          </div>
        </div>
      )}

      {/* Schedule Price Change Form */}
      {showScheduleForm && selectedBranchId && (
        <SchedulePriceChangeForm
          branchId={selectedBranchId}
          pumps={pumps}
          onSuccess={handleScheduleSuccess}
          onCancel={handleScheduleCancel}
          editingSchedule={editingSchedule}
        />
      )}

      {/* Scheduled Changes List */}
      {showSchedules && selectedBranchId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Scheduled Price Changes</h2>
          <ScheduleList
            branchId={selectedBranchId}
            onEdit={handleEditSchedule}
            onRefresh={() => {}}
          />
        </div>
      )}

      {showForm && selectedBranchId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            {editingPump ? 'Edit Pump' : 'Add New Pump'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pump Number *
                </label>
                <input
                  type="number"
                  value={formData.pump_number}
                  onChange={(e) => setFormData({ ...formData, pump_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pump Name *
                </label>
                <input
                  type="text"
                  value={formData.pump_name}
                  onChange={(e) => setFormData({ ...formData, pump_name: e.target.value })}
                  placeholder="e.g., Pump 1 - Diesel Regular"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuel Type *
                </label>
                <select
                  value={formData.fuel_type}
                  onChange={(e) => setFormData({ ...formData, fuel_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                >
                  <option value="">Select Fuel Type</option>
                  <option value="Premium">Premium</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Unleaded">Unleaded</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                >
                  <option value="regular">Regular</option>
                  <option value="discounted">Discounted</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Use "Discounted" for pumps with special pricing (e.g., PWD, Senior Citizen)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price per Liter (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price_per_liter}
                  onChange={(e) => setFormData({ ...formData, price_per_liter: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link to Tank (Optional)
                </label>
                <select
                  value={formData.tank_id}
                  onChange={(e) => setFormData({ ...formData, tank_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">No tank linked</option>
                  {tanks.map((tank) => (
                    <option key={tank.id} value={tank.id}>
                      Tank {tank.tank_number} - {tank.tank_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {editingPump ? 'Update Pump' : 'Create Pump'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedBranchId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">
              Configured Pumps ({pumps.length})
            </h2>
          </div>

          {pumps.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Fuel className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No pumps configured yet</p>
              <p className="text-sm text-gray-400 mt-1">Click "Add Pump" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Pump #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Fuel Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Price/L
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Linked Tank
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Current Reading
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pumps.map((pump) => (
                    <tr key={pump.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-gray-900">{pump.pump_number}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{pump.pump_name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{pump.fuel_type}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          pump.category === 'discounted' 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {pump.category === 'discounted' ? 'Discounted' : 'Regular'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900">
                          ₱{parseFloat(pump.price_per_liter).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {pump.fuel_tanks
                            ? `Tank ${pump.fuel_tanks.tank_number}`
                            : 'Not linked'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {pump.current_reading > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-gray-900">
                              {parseFloat(pump.current_reading).toLocaleString('en-PH', { minimumFractionDigits: 3 })}
                            </span>
                            <button
                              onClick={() => handleOpenReadingModal(pump, 'adjust')}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Adjust reading"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenReadingModal(pump, 'initialize')}
                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded transition-colors"
                          >
                            <Gauge className="w-3.5 h-3.5" />
                            Set Initial
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(pump)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit pump"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(pump)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete pump"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Pump</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  You are about to delete:
                </p>
                <p className="font-semibold text-gray-900">
                  Pump {deleteConfirm.pump_number} - {deleteConfirm.pump_name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {deleteConfirm.fuel_type} • ₱{parseFloat(deleteConfirm.price_per_liter).toFixed(2)}/L
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type the pump number <span className="font-bold">{deleteConfirm.pump_number}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder={deleteConfirm.pump_number.toString()}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleteInput !== deleteConfirm.pump_number.toString() || loading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Permanently Delete
                </button>
                <button
                  onClick={() => {
                    setDeleteConfirm(null)
                    setDeleteInput('')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reading Initialization/Adjustment Modal */}
      {readingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-full ${readingModal.mode === 'initialize' ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  <Gauge className={`w-6 h-6 ${readingModal.mode === 'initialize' ? 'text-blue-600' : 'text-amber-600'}`} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {readingModal.mode === 'initialize' ? 'Initialize Pump Reading' : 'Adjust Pump Reading'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Pump {readingModal.pump.pump_number} - {readingModal.pump.pump_name}
                  </p>
                </div>
              </div>

              {readingModal.mode === 'initialize' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>Important:</strong> This sets the initial meter reading for this pump. 
                    All future sales will automatically update this reading.
                  </p>
                </div>
              )}

              {readingModal.mode === 'adjust' && readingModal.pump.current_reading > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-gray-600">
                    Current reading: <span className="font-mono font-semibold">{parseFloat(readingModal.pump.current_reading).toLocaleString('en-PH', { minimumFractionDigits: 3 })}</span>
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {readingModal.mode === 'initialize' ? 'Initial Reading' : 'New Reading'} *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={readingInput}
                    onChange={(e) => setReadingInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-lg"
                    placeholder="e.g., 12345.678"
                    autoFocus
                  />
                </div>

                {readingModal.mode === 'adjust' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason for Adjustment
                    </label>
                    <input
                      type="text"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="e.g., Meter calibration, correction"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-6">
                <button
                  onClick={handleReadingSubmit}
                  disabled={!readingInput || loading}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    readingModal.mode === 'initialize' 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {readingModal.mode === 'initialize' ? 'Initialize Reading' : 'Update Reading'}
                </button>
                <button
                  onClick={() => {
                    setReadingModal(null)
                    setReadingInput('')
                    setAdjustReason('')
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
