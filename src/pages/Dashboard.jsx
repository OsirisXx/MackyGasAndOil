import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useFuelStore } from '../stores/fuelStore'
import { useBranchStore } from '../stores/branchStore'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  Fuel, DollarSign, TrendingUp, Clock, Users,
  FileText, ArrowUpRight, ArrowDownRight, Calendar, RefreshCw, Package
} from 'lucide-react'
import toast from 'react-hot-toast'

function StatCard({ icon: Icon, label, value, sub, color = 'blue', trend }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-lg ${colors[color]}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { adminProfile: profile } = useAuthStore()
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { selectedBranchId, getSelectedBranch, initialized } = useBranchStore()
  const [today] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalCashSales: 0,
    totalPurchaseOrders: 0,
    unpaidPurchaseOrders: 0,
    totalProductSales: 0,
    cashSalesCount: 0,
    poCount: 0,
    productSalesCount: 0,
    activeCashiers: 0,
  })
  const [recentSales, setRecentSales] = useState([])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const startOfDay = today + 'T00:00:00'
      const endOfDay = today + 'T23:59:59'

      // Fetch today's cash sales
      let salesQ = supabase.from('cash_sales').select('*').gte('created_at', startOfDay).lte('created_at', endOfDay)
      if (selectedBranchId) salesQ = salesQ.eq('branch_id', selectedBranchId)

      // Fetch today's purchase orders
      let poQ = supabase.from('purchase_orders').select('*').gte('created_at', startOfDay).lte('created_at', endOfDay)
      if (selectedBranchId) poQ = poQ.eq('branch_id', selectedBranchId)

      // Fetch active cashiers count
      let cashierQ = supabase.from('cashiers').select('*', { count: 'exact', head: true }).eq('is_active', true)
      if (selectedBranchId) cashierQ = cashierQ.eq('branch_id', selectedBranchId)

      // Fetch today's product sales
      let productQ = supabase.from('product_sales').select('*').gte('created_at', startOfDay).lte('created_at', endOfDay)
      if (selectedBranchId) productQ = productQ.eq('branch_id', selectedBranchId)

      // Recent sales
      let recentCashQ = supabase.from('cash_sales').select('*, fuel_types(short_code), cashiers(full_name)').order('created_at', { ascending: false }).limit(5)
      if (selectedBranchId) recentCashQ = recentCashQ.eq('branch_id', selectedBranchId)

      let recentProdQ = supabase.from('product_sales').select('*, cashiers:cashier_id(full_name)').order('created_at', { ascending: false }).limit(5)
      if (selectedBranchId) recentProdQ = recentProdQ.eq('branch_id', selectedBranchId)

      const [{ data: cashSales }, { data: purchaseOrders }, { count: activeCashiers }, { data: productSales }, { data: recentCash }, { data: recentProd }] = await Promise.all([salesQ, poQ, cashierQ, productQ, recentCashQ, recentProdQ])

      const totalCashSales = (cashSales || []).reduce((sum, s) => sum + parseFloat(s.amount || 0), 0)
      const totalPurchaseOrders = (purchaseOrders || []).reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
      const unpaidPurchaseOrders = (purchaseOrders || [])
        .filter(p => p.status === 'unpaid')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)
      const totalProductSales = (productSales || []).reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0)

      setStats({
        totalCashSales,
        totalPurchaseOrders,
        unpaidPurchaseOrders,
        totalProductSales,
        cashSalesCount: (cashSales || []).length,
        poCount: (purchaseOrders || []).length,
        productSalesCount: (productSales || []).length,
        activeCashiers: activeCashiers || 0,
      })

      const combined = [
        ...(recentCash || []).map(s => ({ ...s, _type: 'cash' })),
        ...(recentProd || []).map(s => ({ ...s, _type: 'product' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
      setRecentSales(combined)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFuelTypes()
  }, [])

  useEffect(() => {
    if (initialized) {
      fetchDashboardData()
    }
  }, [selectedBranchId, initialized])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Welcome, {profile?.full_name || 'User'}! Today is {format(new Date(), 'MMMM d, yyyy')}
          </p>
        </div>
        <button onClick={fetchDashboardData} disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={Fuel}
          label="Cash Sales Today"
          value={`₱${stats.totalCashSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          sub={`${stats.cashSalesCount} transactions`}
          color="blue"
        />
        <StatCard
          icon={DollarSign}
          label="Total Sales"
          value={`₱${(stats.totalCashSales + stats.totalPurchaseOrders + stats.totalProductSales).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          sub="Fuel + Products + Credit"
          color="green"
        />
        <StatCard
          icon={Package}
          label="Product Sales"
          value={`₱${stats.totalProductSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          sub={`${stats.productSalesCount} items sold`}
          color="amber"
        />
        <StatCard
          icon={FileText}
          label="Purchase Orders"
          value={`₱${stats.totalPurchaseOrders.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          sub={`${stats.poCount} orders today`}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label="Unpaid POs"
          value={`₱${stats.unpaidPurchaseOrders.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
          sub="Pending collection"
          color="red"
        />
      </div>

      {/* Active Cashiers + Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-800">Active Cashiers</h2>
          </div>
          <p className="text-3xl font-bold text-gray-800">{stats.activeCashiers}</p>
          <p className="text-xs text-gray-400 mt-1">Registered and active</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-800">Recent Sales</h2>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-sm text-gray-400">No sales recorded yet today</p>
          ) : (
            <div className="space-y-2">
              {recentSales.map(s => (
                <div key={`${s._type}-${s.id}`} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    {s._type === 'product' ? (
                      <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium mr-2">
                        {s.product_name} x{s.quantity}
                      </span>
                    ) : (
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium mr-2">
                        {s.fuel_types?.short_code || 'FUEL'}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {s.cashiers?.full_name || 'Unknown'} • {format(new Date(s.created_at), 'h:mm a')}
                    </span>
                  </div>
                  <span className="font-bold text-gray-800">
                    ₱{parseFloat(s._type === 'product' ? s.total_amount : s.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fuel Prices */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Fuel size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">Current Fuel Prices</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {fuelTypes.map(fuel => (
            <div key={fuel.id} className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 font-medium mb-1">{fuel.short_code}</p>
              <p className="text-lg font-bold text-gray-800">₱{parseFloat(fuel.current_price).toFixed(2)}</p>
              <p className="text-[10px] text-gray-400">{fuel.name}</p>
              {fuel.is_discounted && (
                <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                  Discounted
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Daily Report', icon: FileText, href: '/admin/daily-report', color: 'blue' },
            { label: 'Purchase Orders', icon: Users, href: '/admin/purchase-orders', color: 'purple' },
            { label: 'Expenses', icon: DollarSign, href: '/admin/expenses', color: 'red' },
            { label: 'Reports', icon: TrendingUp, href: '/admin/reports', color: 'green' },
          ].map(action => {
            const Icon = action.icon
            return (
              <a
                key={action.label}
                href={action.href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-all group"
              >
                <Icon size={24} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
                <span className="text-sm text-gray-600 font-medium">{action.label}</span>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
