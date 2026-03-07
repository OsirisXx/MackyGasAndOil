import { useState, useEffect } from 'react'
import { supabase, recoverSession } from '../lib/supabase'

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

    // Periodic Supabase health check with session recovery
    const checkSupabase = async () => {
      try {
        const { error } = await supabase.from('branches').select('id').limit(1)
        if (error) {
          console.warn('[ConnectionCheck] Query failed:', error.message)
          // Attempt session recovery before marking as disconnected
          const recovered = await recoverSession()
          if (recovered) {
            // Retry the query after recovery
            const { error: retryError } = await supabase.from('branches').select('id').limit(1)
            setIsSupabaseConnected(!retryError)
          } else {
            setIsSupabaseConnected(false)
          }
        } else {
          setIsSupabaseConnected(true)
        }
        setLastChecked(Date.now())
      } catch (err) {
        setIsSupabaseConnected(false)
        setLastChecked(Date.now())
      }
    }

    // Check immediately and then every 60 seconds (reduced from 30s to avoid excessive calls)
    checkSupabase()
    const interval = setInterval(checkSupabase, 60000)

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

