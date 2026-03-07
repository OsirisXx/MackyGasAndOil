import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Use a unique storage key to avoid any cross-app conflicts
    storageKey: 'macky-pos-supabase-auth',
  },
})

/**
 * Attempt to recover the Supabase session.
 * Call this when a query fails with an auth-related error.
 * Returns true if the session was successfully recovered.
 */
export async function recoverSession() {
  try {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      console.warn('[Supabase] Session recovery failed:', error.message)
      return false
    }
    if (data?.session) {
      console.log('[Supabase] Session recovered successfully')
      return true
    }
    return false
  } catch (e) {
    console.warn('[Supabase] Session recovery error:', e)
    return false
  }
}

/**
 * Check if an error looks like an auth/session failure.
 */
export function isAuthError(error) {
  if (!error) return false
  const msg = (error.message || error.msg || '').toLowerCase()
  const code = error.code || ''
  return (
    code === 'PGRST301' || // JWT expired
    code === '401' ||
    code === '403' ||
    msg.includes('jwt') ||
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('not authenticated') ||
    msg.includes('invalid claim')
  )
}
