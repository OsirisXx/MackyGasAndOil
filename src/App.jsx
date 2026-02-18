import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import { AdminRoute, CashierRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DailyReport from './pages/DailyReport'
import FuelManagement from './pages/FuelManagement'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import POS from './pages/POS'
import QRManagement from './pages/QRManagement'
import Attendance from './pages/Attendance'
import PurchaseOrders from './pages/PurchaseOrders'
import BranchManagement from './pages/BranchManagement'
import AuditLog from './pages/AuditLog'
import ShiftReadings from './pages/ShiftReadings'
import AccountabilityReport from './pages/AccountabilityReport'

function App() {
  const { initialize, loading, mode } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm font-medium">Loading Macky POS...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Cashier POS (full-screen, no sidebar) */}
      <Route path="/pos" element={
        <CashierRoute>
          <POS />
        </CashierRoute>
      } />

      {/* Admin Panel (sidebar layout) */}
      <Route path="/admin/*" element={
        <AdminRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/qr-management" element={<QRManagement />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/daily-report" element={<DailyReport />} />
              <Route path="/fuel-management" element={<FuelManagement />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/purchase-orders" element={<PurchaseOrders />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/branches" element={<BranchManagement />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/shift-readings" element={<ShiftReadings />} />
              <Route path="/accountability-report" element={<AccountabilityReport />} />
            </Routes>
          </Layout>
        </AdminRoute>
      } />

      {/* Default redirect based on auth state */}
      <Route path="*" element={
        mode === 'cashier' ? <Navigate to="/pos" replace /> :
        mode === 'admin' ? <Navigate to="/admin" replace /> :
        <Navigate to="/login" replace />
      } />
    </Routes>
  )
}

export default App
