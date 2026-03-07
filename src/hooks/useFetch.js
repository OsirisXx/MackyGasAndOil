import { useState, useEffect, useCallback, useRef } from 'react'
import { recoverSession, isAuthError } from '../lib/supabase'

/**
 * Custom hook for data fetching with local loading state.
 * Guarantees fresh fetch on every mount (page navigation) and
 * prevents stale loading state from global stores.
 * 
 * Now includes automatic retry with session recovery on auth errors.
 * 
 * @param {Function} fetchFn - Async function to call
 * @param {Array} deps - Dependencies that trigger a re-fetch (beyond initial mount)
 * @returns {{ loading: boolean, error: string|null, refresh: Function }}
 */
export function useFetch(fetchFn, deps = []) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await fetchFn()
    } catch (e) {
      // If it looks like an auth/session error, try to recover and retry once
      if (isAuthError(e)) {
        console.warn('[useFetch] Auth error detected, attempting session recovery...', e.message)
        const recovered = await recoverSession()
        if (recovered && mountedRef.current) {
          try {
            await fetchFn()
            // Recovery succeeded, clear any error
            if (mountedRef.current) setError(null)
          } catch (retryError) {
            if (mountedRef.current) {
              setError(retryError?.message || 'An error occurred after session recovery')
            }
          }
        } else if (mountedRef.current) {
          setError(e?.message || 'Session expired. Please refresh the page.')
        }
      } else if (mountedRef.current) {
        setError(e?.message || 'An error occurred')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mountedRef.current = true
    refresh()
    return () => { mountedRef.current = false }
  }, [refresh])

  return { loading, error, refresh }
}

