import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook for safe data fetching with automatic loading/error state management.
 * Prevents stuck loading states by always resetting loading in a finally block.
 * Deduplicates concurrent calls and supports dependency-based auto-refetch.
 *
 * Usage:
 *   const { loading, error, refetch } = useAutoFetch(async () => {
 *     const { data } = await supabase.from('table').select('*')
 *     setSomeState(data || [])
 *   }, [dep1, dep2])
 */
export function useAutoFetch(fetchFn, deps = [], { enabled = true } = {}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchRef = useRef(0)

  const execute = useCallback(async () => {
    if (!enabled) return
    const fetchId = ++fetchRef.current
    setLoading(true)
    setError(null)
    try {
      await fetchFn()
    } catch (err) {
      // Only update state if this is still the latest fetch
      if (fetchId === fetchRef.current) {
        console.error('Fetch error:', err)
        setError(err.message || 'An error occurred')
      }
    } finally {
      // Only update loading if this is still the latest fetch
      if (fetchId === fetchRef.current) {
        setLoading(false)
      }
    }
  }, [fetchFn, enabled])

  useEffect(() => {
    execute()
  }, deps)

  return { loading, error, refetch: execute }
}
