import { Vault, DollarSign, Smartphone, Banknote } from 'lucide-react'

/**
 * Vault tab configuration for the POS vault modal
 */
export const VAULT_TABS = [
  { key: 'vault_deposit', label: 'Vault Deposit', icon: Vault, color: 'blue' },
  { key: 'withdraw', label: 'Cash Out', icon: DollarSign, color: 'orange' },
  { key: 'gcash', label: 'GCash', icon: Smartphone, color: 'green' },
  { key: 'cash_register', label: 'Cash Reg', icon: Banknote, color: 'purple' },
]

/**
 * Get display label for a deposit type
 * @param {string|null} depositType - The deposit_type value from the database
 * @returns {string} Human-readable label
 */
export function getDepositTypeLabel(depositType) {
  const labels = {
    vault_deposit: 'Vault Deposit',
    gcash: 'GCash',
    cash_register: 'Cash Register',
  }
  return labels[depositType] || 'Vault Deposit' // null defaults to Vault Deposit
}

/**
 * Get display label for a unit type
 * @param {string|null} unitType - The unit_type value from the database
 * @returns {string} Human-readable label or dash for null
 */
export function getUnitTypeLabel(unitType) {
  const labels = { liters: 'Liters', pcs: 'Pcs' }
  return labels[unitType] || '—'
}

/**
 * Group deposits by type and sum amounts
 * @param {Array} deposits - Array of deposit records
 * @returns {Object} { vault_deposit: number, gcash: number, cash_register: number }
 */
export function groupDepositsByType(deposits) {
  const groups = { vault_deposit: 0, gcash: 0, cash_register: 0 }
  ;(deposits || []).forEach(d => {
    const type = d.deposit_type || 'vault_deposit' // null treated as vault_deposit
    if (groups[type] !== undefined) {
      groups[type] += parseFloat(d.amount || 0)
    } else {
      groups.vault_deposit += parseFloat(d.amount || 0)
    }
  })
  return groups
}

/**
 * Filter out soft-deleted deposits (records where deleted_at is not null)
 * @param {Array} deposits - Array of deposit records
 * @returns {Array} Only active (non-deleted) deposits
 */
export function filterActiveDeposits(deposits) {
  return (deposits || []).filter(d => !d.deleted_at)
}
