import { useEffect, useState } from 'react'
import { useFuelStore } from '../stores/fuelStore'
import { useAuthStore } from '../stores/authStore'
import { Fuel, Save, History, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export default function FuelManagement() {
  const { fuelTypes, fetchFuelTypes, updateFuelPrice } = useFuelStore()
  const { adminProfile: profile } = useAuthStore()
  const [editPrices, setEditPrices] = useState({})
  const [priceHistory, setPriceHistory] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchFuelTypes()
    fetchPriceHistory()
  }, [])

  useEffect(() => {
    const map = {}
    fuelTypes.forEach(f => { map[f.id] = f.current_price })
    setEditPrices(map)
  }, [fuelTypes])

  const fetchPriceHistory = async () => {
    const { data } = await supabase
      .from('fuel_price_history')
      .select('*, fuel_types(name, short_code)')
      .order('created_at', { ascending: false })
      .limit(20)
    setPriceHistory(data || [])
  }

  const handleSavePrice = async (fuelId) => {
    setLoading(true)
    const result = await updateFuelPrice(fuelId, editPrices[fuelId], profile?.id)
    if (result.success) {
      toast.success('Price updated!')
      fetchPriceHistory()
    } else {
      toast.error(result.error || 'Failed to update')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Fuel Management</h1>
        <p className="text-gray-500 text-sm">Manage fuel types and update prices</p>
      </div>

      {/* Fuel Price Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fuelTypes.map(fuel => (
          <div key={fuel.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Fuel size={18} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">{fuel.name}</h3>
                  <p className="text-xs text-gray-400">{fuel.short_code}</p>
                </div>
              </div>
              {fuel.is_discounted && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Disc.</span>
              )}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Price per Liter (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editPrices[fuel.id] || ''}
                  onChange={e => setEditPrices(p => ({ ...p, [fuel.id]: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-lg font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button
                onClick={() => handleSavePrice(fuel.id)}
                disabled={loading || editPrices[fuel.id] === parseFloat(fuel.current_price)}
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-30"
              >
                <Save size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Price History */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <History size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">Price Change History</h2>
        </div>
        {priceHistory.length === 0 ? (
          <p className="text-sm text-gray-400">No price changes recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {priceHistory.map(h => {
              const increased = parseFloat(h.new_price) > parseFloat(h.old_price)
              return (
                <div key={h.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <div className={`p-1.5 rounded ${increased ? 'bg-red-100' : 'bg-green-100'}`}>
                    {increased ? <TrendingUp size={14} className="text-red-600" /> : <TrendingDown size={14} className="text-green-600" />}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{h.fuel_types?.short_code}</span>
                  <span className="text-sm text-gray-400">₱{parseFloat(h.old_price).toFixed(2)}</span>
                  <span className="text-gray-300">→</span>
                  <span className={`text-sm font-bold ${increased ? 'text-red-600' : 'text-green-600'}`}>₱{parseFloat(h.new_price).toFixed(2)}</span>
                  <span className="flex-1 text-right text-xs text-gray-400">
                    {h.created_at ? format(new Date(h.created_at), 'MMM d, yyyy h:mm a') : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
