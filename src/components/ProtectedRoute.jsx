import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function AdminRoute({ children }) {
  const { mode, adminUser, loading } = useAuthStore()

  // Only show loading during initial auth check, not during cashier operations
  // Check if we have adminUser - if yes, ignore loading state from cashier actions
  if (loading && !adminUser) return <LoadingScreen />
  if (!adminUser || mode !== 'admin') return <Navigate to="/login" replace />
  return children
}

export function CashierRoute({ children }) {
  const { mode, cashier, loading } = useAuthStore()

  if (loading) return <LoadingScreen />
  if (!cashier || mode !== 'cashier') return <Navigate to="/login" replace />
  return children
}

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  )
}
