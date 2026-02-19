import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import {
  LayoutDashboard, Fuel, FileText, Users, Package,
  ChevronLeft, ChevronRight, LogOut, Menu, X,
  Receipt, DollarSign, Settings, TrendingUp,
  QrCode, Clock, ShoppingCart, Building2, ClipboardList, Gauge
} from 'lucide-react'

const adminNav = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/qr-management', label: 'QR & Cashiers', icon: QrCode },
  { path: '/admin/attendance', label: 'Attendance', icon: Clock },
  { path: '/admin/daily-report', label: 'Daily Report', icon: FileText },
  { path: '/admin/accountability-report', label: 'Accountability Report', icon: FileText },
  { path: '/admin/fuel-management', label: 'Fuel Management', icon: Fuel },
  { path: '/admin/shift-readings', label: 'Shift Readings', icon: Gauge },
  { path: '/admin/customers', label: 'Customers', icon: Users },
  { path: '/admin/products', label: 'Products & Inventory', icon: Package },
  { path: '/admin/purchase-orders', label: 'Purchase Orders', icon: Receipt },
  { path: '/admin/expenses', label: 'Expenses', icon: DollarSign },
  { path: '/admin/reports', label: 'Reports', icon: TrendingUp },
  { path: '/admin/branches', label: 'Branches', icon: Building2 },
  { path: '/admin/audit-log', label: 'Audit Log', icon: ClipboardList },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { adminProfile, signOut } = useAuthStore()
  const { branches, selectedBranchId, setSelectedBranch, fetchBranches } = useBranchStore()

  useEffect(() => { fetchBranches() }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const navItems = adminNav

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        bg-gradient-to-b from-blue-900 to-blue-950 text-white
        transition-all duration-300 ease-in-out flex flex-col
        ${collapsed ? 'w-20' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className={`flex items-center gap-3 p-4 border-b border-blue-800 ${collapsed ? 'justify-center' : ''}`}>
          <img src="/logo.png" alt="Logo" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-sm leading-tight">MACKY OIL & GAS</h1>
              <p className="text-[10px] text-blue-300 leading-tight">Admin Panel</p>
            </div>
          )}
        </div>

        {/* Branch Selector */}
        {!collapsed && branches.length > 0 && (
          <div className="px-3 py-3 border-b border-blue-800">
            <label className="block text-[10px] text-blue-400 mb-1 font-medium uppercase tracking-wide">Branch</label>
            <select
              value={selectedBranchId || ''}
              onChange={e => setSelectedBranch(e.target.value || null)}
              className="w-full px-2 py-1.5 bg-blue-800/50 border border-blue-700 rounded-lg text-sm text-white outline-none focus:ring-1 focus:ring-amber-400 appearance-none cursor-pointer"
            >
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        {collapsed && branches.length > 1 && (
          <div className="px-2 py-2 border-b border-blue-800 flex justify-center">
            <button
              onClick={() => setCollapsed(false)}
              className="p-2 text-blue-300 hover:text-white rounded-lg hover:bg-blue-800/50"
              title="Expand to select branch"
            >
              <Building2 size={18} />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto sidebar-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgb(29 78 216 / 0.5) transparent' }}>
          {navItems.map(item => {
            const Icon = item.icon
            const active = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center mx-2 px-3 py-2.5 rounded-lg mb-1
                  transition-all duration-200 text-sm
                  ${active
                    ? 'bg-blue-700/50 text-white font-medium shadow-sm'
                    : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
                title={collapsed ? item.label : undefined}
              >
                <span className="w-5 flex items-center justify-center shrink-0">
                  <Icon size={20} />
                </span>
                {!collapsed && <span className="ml-3">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User + Collapse */}
        <div className="border-t border-blue-800 p-3">
          {!collapsed && (
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-sm font-medium">
                {adminProfile?.full_name?.charAt(0)?.toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{adminProfile?.full_name || 'Admin'}</p>
                <p className="text-[10px] text-blue-300 capitalize">{adminProfile?.role || 'admin'}</p>
              </div>
              <button onClick={handleSignOut} className="text-blue-300 hover:text-white p-1" title="Sign Out">
                <LogOut size={18} />
              </button>
            </div>
          )}
          {collapsed && (
            <button onClick={handleSignOut} className="w-full flex justify-center text-blue-300 hover:text-white p-2 mb-2" title="Sign Out">
              <LogOut size={18} />
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-full py-1.5 text-blue-300 hover:text-white rounded-lg hover:bg-blue-800/50 transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {!collapsed && (
            <div className="mt-3 pt-3 border-t border-blue-800/50 text-center">
              <p className="text-[9px] text-blue-400/70">Powered by</p>
              <p className="text-[10px] text-blue-300 font-medium">Raijin Tech Solutions</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setMobileOpen(true)} className="text-gray-600">
            <Menu size={24} />
          </button>
          <h1 className="font-bold text-gray-800">Macky Oil & Gas — Admin</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
