import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Custom hook for data fetching with local loading state.
 * Guarantees fresh fetch on every mount (page navigation) and
 * prevents stale loading state from global stores.
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
      if (mountedRef.current) {
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
