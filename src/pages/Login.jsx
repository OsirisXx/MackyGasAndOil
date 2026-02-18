import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Fuel, Eye, EyeOff, LogIn, QrCode, Shield, Camera, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  // 'select' | 'admin' | 'cashier-scan'
  const [screen, setScreen] = useState('select')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { adminSignIn, cashierLoginByToken, loading, error, clearError, mode } = useAuthStore()
  const navigate = useNavigate()
  const scannerRef = useRef(null)
  const html5QrRef = useRef(null)

  // Redirect if already logged in (only if on login page)
  useEffect(() => {
    if (mode === 'admin') navigate('/admin', { replace: true })
    if (mode === 'cashier') navigate('/pos', { replace: true })
  }, [mode, navigate])

  // QR scanner setup
  useEffect(() => {
    if (screen === 'cashier-scan') {
      startScanner()
    }
    return () => stopScanner()
  }, [screen])

  const startScanner = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      html5QrRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          stopScanner()
          const result = await cashierLoginByToken(decodedText.trim())
          if (result.success) {
            toast.success(`Welcome, ${result.cashier.full_name}!`)
            navigate('/pos')
          } else {
            toast.error(result.error)
            setScreen('select')
          }
        },
        () => {} // ignore scan errors
      )
    } catch (err) {
      console.error('Scanner error:', err)
      toast.error('Camera not available. Please try again.')
      setScreen('select')
    }
  }

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try {
        const scanner = html5QrRef.current
        html5QrRef.current = null
        if (scanner.isScanning) {
          await scanner.stop()
        }
        scanner.clear()
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    clearError()
    const result = await adminSignIn(email, password)
    if (result.success) {
      toast.success('Welcome, Admin!')
      navigate('/admin')
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl mb-4 shadow-lg shadow-amber-500/25">
            <Fuel size={32} className="text-blue-900" />
          </div>
          <h1 className="text-2xl font-bold text-white">MACKY OIL & GAS</h1>
          <p className="text-blue-300 text-sm mt-1">Lower Sosohon, Manolo Fortich, Bukidnon</p>
          <p className="text-blue-400 text-xs mt-0.5">Point of Sale System</p>
        </div>

        {/* ===== SELECT SCREEN ===== */}
        {screen === 'select' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">Welcome</h2>
            <p className="text-gray-500 text-sm text-center mb-6">How would you like to sign in?</p>

            <div className="space-y-3">
              <button
                onClick={() => setScreen('cashier-scan')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
                  <QrCode size={24} className="text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-800">Scan QR Code</p>
                  <p className="text-xs text-gray-500">Cashier check-in with QR</p>
                </div>
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
              </div>

              <button
                onClick={() => setScreen('admin')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-100 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all group"
              >
                <div className="p-3 bg-amber-100 rounded-xl group-hover:bg-amber-200 transition-colors">
                  <Shield size={24} className="text-amber-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-800">Admin Login</p>
                  <p className="text-xs text-gray-500">Manage system settings & reports</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ===== QR SCAN SCREEN ===== */}
        {screen === 'cashier-scan' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <button onClick={() => { stopScanner(); setScreen('select') }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ArrowLeft size={16} /> Back
            </button>
            <div className="text-center mb-4">
              <Camera size={24} className="mx-auto text-blue-600 mb-2" />
              <h2 className="text-lg font-semibold text-gray-800">Scan Your QR Code</h2>
              <p className="text-xs text-gray-500 mt-1">Point your QR code at the camera</p>
            </div>
            <div id="qr-reader" className="rounded-xl overflow-hidden mb-4" style={{ minHeight: 280 }} />
            {loading && (
              <div className="flex items-center justify-center gap-2 text-blue-600 text-sm">
                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                Verifying...
              </div>
            )}
          </div>
        )}

        {/* ===== ADMIN SCREEN ===== */}
        {screen === 'admin' && (
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <button onClick={() => { setEmail(''); setPassword(''); clearError(); setScreen('select') }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ArrowLeft size={16} /> Back
            </button>
            <div className="text-center mb-6">
              <Shield size={24} className="mx-auto text-amber-600 mb-2" />
              <h2 className="text-lg font-semibold text-gray-800">Admin Login</h2>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  placeholder="admin@example.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm pr-10"
                    placeholder="Enter password" required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-xl">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><LogIn size={18} /> Sign In</>}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
