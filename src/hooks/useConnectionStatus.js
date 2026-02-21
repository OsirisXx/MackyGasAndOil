import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(true)
  const [lastChecked, setLastChecked] = useState(Date.now())

  useEffect(() => {
    // Monitor browser online/offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Periodic Supabase health check
    const checkSupabase = async () => {
      try {
        const { error } = await supabase.from('branches').select('id').limit(1)
        setIsSupabaseConnected(!error)
        setLastChecked(Date.now())
      } catch (err) {
        setIsSupabaseConnected(false)
        setLastChecked(Date.now())
      }
    }

    // Check immediately and then every 30 seconds
    checkSupabase()
    const interval = setInterval(checkSupabase, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  return {
    isOnline,
    isSupabaseConnected,
    isConnected: isOnline && isSupabaseConnected,
    lastChecked,
  }
}
