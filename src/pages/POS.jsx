import { useEffect, useState, useMemo, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useFuelStore } from '../stores/fuelStore'
import { useProductStore } from '../stores/productStore'
import { usePumpStore } from '../stores/pumpStore'
import { useBranchStore } from '../stores/branchStore'
import { useCustomerStore } from '../stores/customerStore'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { getCurrentShift, getShiftsForBranch } from '../utils/shiftConfig'
import { ensureCurrentShiftSnapshots } from '../services/shiftService'
import {
  Fuel, DollarSign, Plus, ShoppingCart, FileText,
  Clock, LogOut, CheckCircle, Banknote, CreditCard, Package, Search, Minus, WifiOff, Wifi, Vault, Truck, Gauge, Beaker, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import LivePumpReadings from '../components/LivePumpReadings'
import CashierAccountability from '../components/CashierAccountability'

export default function POS() {
  const { cashier, cashierCheckOut } = useAuthStore()
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { products, fetchProducts } = useProductStore()
  const { pumps, fetchPumps } = usePumpStore()
  const { selectedBranchId, setSelectedBranch } = useBranchStore()
  const { customers, fetchCustomers } = useCustomerStore()
  const { isConnected, isOnline, isSupabaseConnected } = useConnectionStatus()

  // Transaction form
  const [pumpId, setPumpId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customerName, setCustomerName] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // PO form
  const [showPO, setShowPO] = useState(false)
  const [poCustomer, setPoCustomer] = useState('')
  const [poPumpId, setPoPumpId] = useState('')
  const [poAmount, setPoAmount] = useState('')
  const [poPlate, setPoPlate] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [poCustomerMode, setPoCustomerMode] = useState('select') // 'type' or 'select'
  const [showPoDropdown, setShowPoDropdown] = useState(false)
  const poDropdownRef = useRef(null)

  // Today's transactions
  const [todaySales, setTodaySales] = useState([])
  const [todayPOs, setTodayPOs] = useState([])
  const [todayProductSales, setTodayProductSales] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [allCustomers, setAllCustomers] = useState([])

  // Product sale state
  const [showProducts, setShowProducts] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [cart, setCart] = useState([]) // { product, quantity }
  const [productPaymentMethod, setProductPaymentMethod] = useState('cash')

  // Vault state (unified deposits & withdrawals)
  const [showVault, setShowVault] = useState(false)
  const [vaultTab, setVaultTab] = useState('deposit') // 'deposit' or 'withdraw'
  const [vaultAmount, setVaultAmount] = useState('')
  const [vaultNotes, setVaultNotes] = useState('')
  const [withdrawalReason, setWithdrawalReason] = useState('')
  const [todayDeposits, setTodayDeposits] = useState([])
  const [todayWithdrawals, setTodayWithdrawals] = useState([])
  const [vaultBalance, setVaultBalance] = useState(0)

  // Pump readings panel state
  const [showPumpReadings, setShowPumpReadings] = useState(false)
  const [showAccountability, setShowAccountability] = useState(false)

  // Calibration state
  const [showCalibration, setShowCalibration] = useState(false)
  const [calibrationPumpId, setCalibrationPumpId] = useState('')
  const [calibrationLiters, setCalibrationLiters] = useState('')
  const [calibrationNotes, setCalibrationNotes] = useState('')

  // Set branch to cashier's branch on mount
  useEffect(() => {
    if (cashier?.branch_id && selectedBranchId !== cashier.branch_id) {
      setSelectedBranch(cashier.branch_id)
    }
  }, [cashier])

  useEffect(() => {
    fetchFuelTypes()
    fetchProducts()
    fetchCustomers()
    fetchAllCustomers()
    if (cashier) {
      fetchTodayData()
      fetchPumps(cashier.branch_id || selectedBranchId)
      // Ensure shift snapshots exist for current shift
      ensureCurrentShiftSnapshots(cashier.branch_id || selectedBranchId, cashier.branches?.name)
    }
  }, [cashier, selectedBranchId])

  // Fetch all unique customers from purchase_orders for autocomplete
  const fetchAllCustomers = async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('customer_name, plate_number')
      .order('created_at', { ascending: false })
    if (data) {
      // Create unique customer entries with their most recent plate
      const customerMap = new Map()
      data.forEach(d => {
        if (d.customer_name && !customerMap.has(d.customer_name)) {
          customerMap.set(d.customer_name, d.plate_number || '')
        }
      })
      setAllCustomers(Array.from(customerMap.entries()).map(([name, plate]) => ({ name, plate })))
    }
  }

  // Filter suggestions based on input
  const customerSuggestions = useMemo(() => {
    if (!poCustomer || poCustomer.length < 2) return []
    const search = poCustomer.toLowerCase()
    return allCustomers.filter(c => c.name.toLowerCase().includes(search)).slice(0, 5)
  }, [poCustomer, allCustomers])

  const handleSelectCustomer = (customer) => {
    setPoCustomer(customer.name)
    if (customer.plate && !poPlate) {
      setPoPlate(customer.plate)
    }
    setShowCustomerSuggestions(false)
  }

  const fetchTodayData = async () => {
    if (!cashier) return
    setLoadingData(true)
    try {
      // Use local midnight → local 23:59:59 converted to UTC ISO so PH time (UTC+8) works correctly
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const startISO = startOfDay.toISOString()
      const endISO = endOfDay.toISOString()
      const [salesRes, poRes, prodRes, depositRes, withdrawalRes] = await Promise.all([
        supabase.from('cash_sales')
          .select('*, fuel_types(short_code, name), cashiers(full_name)')
          .eq('cashier_id', cashier.id)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
        supabase.from('purchase_orders')
          .select('*, fuel_types(short_code, name), cashiers(full_name)')
          .eq('cashier_id', cashier.id)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
        supabase.from('product_sales')
          .select('*')
          .eq('cashier_id', cashier.id)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
        supabase.from('cash_deposits')
          .select('*, cashiers(full_name)')
          .eq('cashier_id', cashier.id)
          .gte('deposit_date', startISO)
          .lte('deposit_date', endISO)
          .order('deposit_date', { ascending: false }),
        supabase.from('cash_withdrawals')
          .select('*, cashiers(full_name)')
          .eq('cashier_id', cashier.id)
          .gte('withdrawal_date', startISO)
          .lte('withdrawal_date', endISO)
          .order('withdrawal_date', { ascending: false }),
      ])
      setTodaySales(salesRes.data || [])
      setTodayPOs(poRes.data || [])
      setTodayProductSales(prodRes.data || [])
      setTodayDeposits(depositRes.data || [])
      setTodayWithdrawals(withdrawalRes.data || [])
      
      // Calculate vault balance for this branch
      const totalDeposits = (depositRes.data || []).reduce((sum, d) => sum + parseFloat(d.amount || 0), 0)
      const totalWithdrawals = (withdrawalRes.data || []).reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
      setVaultBalance(totalDeposits - totalWithdrawals)
    } catch (err) {
      console.error('POS fetch error:', err)
    } finally {
      setLoadingData(false)
    }
  }

  // Computed
  const selectedPump = pumps.find(p => p.id === pumpId)
  const liters = selectedPump && amount ? (parseFloat(amount) / parseFloat(selectedPump.price_per_liter)).toFixed(3) : null

  const totalCashToday = useMemo(() =>
    todaySales.reduce((s, t) => s + parseFloat(t.amount || 0), 0), [todaySales])
  const totalPOToday = useMemo(() =>
    todayPOs.reduce((s, t) => s + parseFloat(t.amount || 0), 0), [todayPOs])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isConnected) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    if (!pumpId || !amount) return toast.error('Please fill all required fields')
    setSaving(true)
    try {
      // IMPORTANT: Ensure shift snapshots exist BEFORE recording the sale
      // This guarantees the trigger can update the snapshot's ending_reading
      await ensureCurrentShiftSnapshots(cashier.branch_id || selectedBranchId, cashier.branches?.name)
      
      // Find fuel_type_id based on pump's fuel_type text
      const fuelTypeMatch = fuelTypes.find(ft => ft.name === selectedPump?.fuel_type)
      const { error } = await supabase.from('cash_sales').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        pump_id: pumpId,
        fuel_type_id: fuelTypeMatch?.id || null,
        amount: parseFloat(amount),
        liters: liters ? parseFloat(liters) : null,
        price_per_liter: selectedPump ? parseFloat(selectedPump.price_per_liter) : null,
        payment_method: paymentMethod,
        customer_name: customerName || null,
        plate_number: plateNumber || null,
        notes: notes || null,
      })
      if (error) throw error
      toast.success(`₱${parseFloat(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} sale recorded!`)
      logAudit('create', 'cash_sale', `Cash sale of ₱${parseFloat(amount).toFixed(2)} - ${selectedPump?.pump_name}`, {
        newValues: { amount: parseFloat(amount), pump_id: pumpId, payment_method: paymentMethod },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      // Reset
      setAmount('')
      setCustomerName('')
      setPlateNumber('')
      setNotes('')
      fetchTodayData()
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  const handleCreatePO = async (e) => {
    e.preventDefault()
    if (!isConnected) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    if (!poCustomer || !poAmount) return toast.error('Please fill all required fields')
    if (!poAmount || parseFloat(poAmount) <= 0) return toast.error('Enter a valid amount')
    setSaving(true)
    try {
      // IMPORTANT: Ensure shift snapshots exist BEFORE recording the PO
      await ensureCurrentShiftSnapshots(cashier.branch_id || selectedBranchId, cashier.branches?.name)
      
      const poPump = pumps.find(p => p.id === poPumpId)
      const poLiters = poPump && poAmount ? (parseFloat(poAmount) / parseFloat(poPump.price_per_liter)).toFixed(3) : null
      // Find fuel_type_id based on pump's fuel_type text
      const poFuelTypeMatch = fuelTypes.find(ft => ft.name === poPump?.fuel_type)
      const { error } = await supabase.from('purchase_orders').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        customer_name: poCustomer,
        pump_id: poPumpId || null,
        fuel_type_id: poFuelTypeMatch?.id || null,
        amount: parseFloat(poAmount),
        liters: poLiters ? parseFloat(poLiters) : null,
        price_per_liter: poPump ? parseFloat(poPump.price_per_liter) : null,
        plate_number: poPlate || null,
        notes: poNotes || null,
        status: 'unpaid',
      })
      if (error) throw error
      toast.success('Purchase order created!')
      logAudit('create', 'purchase_order', `Purchase order of ₱${parseFloat(poAmount).toFixed(2)} - ${poPump?.pump_name}`, {
        newValues: { amount: parseFloat(poAmount), pump_id: poPumpId },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      setPoCustomer('')
      setPoPumpId('')
      setPoAmount('')
      setPoPlate('')
      setPoNotes('')
      setShowPO(false)
      fetchTodayData()
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  const handleVaultDeposit = async (e) => {
    e.preventDefault()
    if (!isConnected) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    if (!vaultAmount || parseFloat(vaultAmount) <= 0) {
      return toast.error('Please enter a valid deposit amount')
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('cash_deposits').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        amount: parseFloat(vaultAmount),
        notes: vaultNotes || null,
        created_by: cashier.user_id,
      })
      if (error) throw error
      toast.success(`₱${parseFloat(vaultAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} deposited to vault!`)
      logAudit('create', 'cash_deposit', `Cash deposit of ₱${parseFloat(vaultAmount).toFixed(2)}`, {
        newValues: { amount: parseFloat(vaultAmount) },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      setVaultAmount('')
      setVaultNotes('')
      setShowVault(false)
      fetchTodayData()
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  const handleVaultWithdrawal = async (e) => {
    e.preventDefault()
    if (!isConnected) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    if (!vaultAmount || parseFloat(vaultAmount) <= 0) {
      return toast.error('Please enter a valid withdrawal amount')
    }
    if (!withdrawalReason || withdrawalReason.trim() === '') {
      return toast.error('Please provide a reason for withdrawal')
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('cash_withdrawals').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        amount: parseFloat(vaultAmount),
        reason: withdrawalReason,
        notes: vaultNotes || null,
        created_by: cashier.user_id,
      })
      if (error) throw error
      toast.success(`₱${parseFloat(vaultAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} withdrawn from vault!`)
      logAudit('create', 'cash_withdrawal', `Cash withdrawal of ₱${parseFloat(vaultAmount).toFixed(2)} - ${withdrawalReason}`, {
        newValues: { amount: parseFloat(vaultAmount), reason: withdrawalReason },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      setVaultAmount('')
      setWithdrawalReason('')
      setVaultNotes('')
      setShowVault(false)
      fetchTodayData()
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  const handleEndShift = async () => {
    if (!confirm('End your shift and check out?')) return
    await cashierCheckOut()
    toast.success('Shift ended. Goodbye!')
  }

  // Calibration handler
  const handleCalibration = async (e) => {
    e.preventDefault()
    if (!isConnected) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    if (!calibrationPumpId) return toast.error('Please select a pump')
    if (!calibrationLiters || parseFloat(calibrationLiters) <= 0) {
      return toast.error('Please enter valid liters')
    }
    
    const selectedCalibrationPump = pumps.find(p => p.id === calibrationPumpId)
    if (!selectedCalibrationPump) return toast.error('Invalid pump selected')
    
    setSaving(true)
    try {
      const litersVal = parseFloat(calibrationLiters)
      const pricePerLiter = parseFloat(selectedCalibrationPump.price_per_liter)
      const amountVal = litersVal * pricePerLiter
      
      const { error } = await supabase.from('pump_calibrations').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        pump_id: calibrationPumpId,
        liters: litersVal,
        price_per_liter: pricePerLiter,
        shift_date: format(new Date(), 'yyyy-MM-dd'),
        shift_number: getCurrentShift(cashier?.branches?.name),
        reason: 'Calibration',
        notes: calibrationNotes || null,
      })
      if (error) throw error
      
      toast.success(`Calibration recorded: ${litersVal} liters (₱${amountVal.toLocaleString('en-PH', { minimumFractionDigits: 2 })})`)
      logAudit('create', 'pump_calibration', `Calibration of ${litersVal}L on ${selectedCalibrationPump.pump_name}`, {
        newValues: { liters: litersVal, pump_id: calibrationPumpId, amount: amountVal },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      
      // Reset and close
      setCalibrationPumpId('')
      setCalibrationLiters('')
      setCalibrationNotes('')
      setShowCalibration(false)
      fetchTodayData()
      fetchPumps(cashier.branch_id || selectedBranchId) // Refresh pump readings
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  // Product cart functions
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    const search = productSearch.toLowerCase()
    return products.filter(p => 
      p.name.toLowerCase().includes(search) || 
      (p.sku || '').toLowerCase().includes(search)
    )
  }, [products, productSearch])

  const addToCart = (product) => {
    // Check if product has stock
    if (product.stock_quantity <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        // Check if adding more would exceed stock
        if (existing.quantity >= product.stock_quantity) {
          toast.error(`Only ${product.stock_quantity} ${product.name} in stock`)
          return prev
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const updateCartQuantity = (productId, delta) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta
          // Check stock limit when increasing
          if (delta > 0 && newQty > item.product.stock_quantity) {
            toast.error(`Only ${item.product.stock_quantity} ${item.product.name} in stock`)
            return item
          }
          return newQty > 0 ? { ...item, quantity: newQty } : null
        }
        return item
      }).filter(Boolean)
    })
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }

  const cartTotal = useMemo(() => 
    cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)
  , [cart])

  const handleProductSale = async () => {
    if (!isConnected) {
      toast.error('No connection. Please check your internet and try again.')
      return
    }
    if (cart.length === 0) return toast.error('Cart is empty')
    setSaving(true)
    try {
      // Insert each cart item as a product sale
      const salesData = cart.map(item => ({
        cashier_id: cashier.id,
        cashier_name: cashier.full_name,
        branch_id: cashier.branch_id || null,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        total_amount: item.product.price * item.quantity,
        payment_method: productPaymentMethod,
      }))
      
      const { error } = await supabase.from('product_sales').insert(salesData)
      if (error) throw error
      
      // Deduct stock from products
      const stockUpdates = []
      for (const item of cart) {
        // First get the current stock from database to ensure accuracy
        const { data: currentProduct, error: fetchError } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.product.id)
          .single()
        
        if (fetchError) {
          console.error('Failed to fetch product stock:', fetchError)
          continue
        }
        
        if (currentProduct) {
          const currentStock = currentProduct.stock_quantity || 0
          const newStock = Math.max(0, currentStock - item.quantity)
          
          const { error: updateError } = await supabase
            .from('products')
            .update({ stock_quantity: newStock })
            .eq('id', item.product.id)
          
          if (updateError) {
            console.error('Stock update error for product', item.product.id, ':', updateError)
            toast.error(`Failed to update stock for ${item.product.name}`)
          } else {
            stockUpdates.push({ name: item.product.name, from: currentStock, to: newStock })
          }
        }
      }
      
      if (stockUpdates.length > 0) {
        console.log('Stock updated:', stockUpdates)
      }
      
      // Refresh products to reflect new stock levels
      fetchProducts()
      
      const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0)
      const itemsList = cart.map(item => `${item.product.name} x${item.quantity} @₱${item.product.price.toFixed(2)}`).join(', ')
      toast.success(`₱${cartTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} product sale recorded!`)
      logAudit('create', 'product_sale', `Product sale: ${itemsList} — Total: ₱${cartTotal.toFixed(2)}`, {
        newValues: { 
          total: cartTotal, 
          items_count: totalQuantity, 
          payment_method: productPaymentMethod,
          items: cart.map(item => ({
            product_id: item.product.id,
            name: item.product.name,
            quantity: item.quantity,
            unit_price: item.product.price,
            subtotal: item.product.price * item.quantity
          }))
        },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      
      setCart([])
      setShowProducts(false)
      fetchTodayData()
    } catch (err) {
      toast.error(err.message)
    }
    setSaving(false)
  }

  const CATEGORIES = {
    oil_lubes: 'Oil / Lubes',
    accessories: 'Accessories',
    services: 'Services',
    miscellaneous: 'Misc',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="w-9 h-9 rounded-lg object-cover" />
          <div>
            <h1 className="font-bold text-gray-800 text-sm">MACKY OIL & GAS</h1>
            <p className="text-[10px] text-gray-400">POS Terminal {cashier?.branches?.name ? `— ${cashier.branches.name}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection Status Indicator */}
          {!isConnected && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <WifiOff size={14} className="text-red-600" />
              <span className="text-xs font-medium text-red-600">
                {!isOnline ? 'No Internet' : 'Database Offline'}
              </span>
            </div>
          )}
          {isConnected && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <Wifi size={14} className="text-green-600" />
              <span className="text-xs font-medium text-green-600">Connected</span>
            </div>
          )}
          <button
            onClick={() => setShowPumpReadings(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg text-sm font-medium transition-colors">
            <Gauge size={16} /> Pump Readings
          </button>
          <button
            onClick={() => setShowAccountability(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-sm font-medium transition-colors">
            <FileText size={16} /> Accountability
          </button>
          <button
            onClick={() => setShowCalibration(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-lg text-sm font-medium transition-colors">
            <Beaker size={16} /> Calibration
          </button>
          <a href="/fuel-delivery"
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors">
            <Truck size={16} /> Fuel Delivery
          </a>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{cashier?.full_name}</p>
            <p className="text-[10px] text-gray-400">
              {format(new Date(), 'MMM d, yyyy — h:mm a')} • <span className="font-semibold text-blue-600">{getShiftsForBranch(cashier?.branches?.name)?.find(s => s.number === getCurrentShift(cashier?.branches?.name))?.label || `Shift ${getCurrentShift(cashier?.branches?.name)}`}</span>
            </p>
          </div>
          <button onClick={handleEndShift}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors">
            <LogOut size={16} /> End Shift
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Banknote size={16} className="text-green-600" />
              <span className="text-xs text-gray-500">Cash Sales Today</span>
            </div>
            <p className="text-xl font-bold text-gray-800">₱{totalCashToday.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-gray-400">{todaySales.length} transactions</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={16} className="text-amber-600" />
              <span className="text-xs text-gray-500">Purchase Orders</span>
            </div>
            <p className="text-xl font-bold text-gray-800">₱{totalPOToday.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-gray-400">{todayPOs.length} orders (unpaid)</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-blue-600" />
              <span className="text-xs text-gray-500">Total Today</span>
            </div>
            <p className="text-xl font-bold text-blue-700">₱{(totalCashToday + totalPOToday).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-gray-400">{todaySales.length + todayPOs.length} total</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Input Forms - More prominent */}
          <div className="lg:col-span-3 space-y-4">
            {/* Cash Sale Form */}
            {!showPO ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Banknote size={18} className="text-green-600" />
                    <h2 className="font-semibold text-gray-800">Record Cash Sale</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowProducts(true)}
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                      <Package size={14} /> Products
                    </button>
                    <button onClick={() => setShowPO(true)}
                      className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                      <CreditCard size={14} /> Purchase Order
                    </button>
                    <button onClick={() => setShowVault(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      <Vault size={14} /> Vault
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* Pump Selection */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Select Pump</label>
                    {pumps.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-sm">
                        No pumps configured. Contact admin.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {pumps.sort((a, b) => {
                          // Sort by fuel type first (Premium, Diesel, Unleaded)
                          if (a.fuel_type !== b.fuel_type) {
                            return a.fuel_type.localeCompare(b.fuel_type)
                          }
                          // Then by pump number
                          return a.pump_number - b.pump_number
                        }).map(pump => (
                          <button key={pump.id} type="button"
                            onClick={() => setPumpId(pump.id)}
                            className={`p-3 rounded-lg border-2 transition-all ${
                              pumpId === pump.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className={`text-base font-bold ${pumpId === pump.id ? 'text-blue-700' : 'text-gray-800'}`}>
                                #{pump.pump_number} {pump.fuel_type}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                pump.category === 'discounted' 
                                  ? 'bg-amber-100 text-amber-700' 
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {pump.category === 'discounted' ? 'Discounted' : 'Regular'}
                              </span>
                              <span className={`text-xs font-bold ${pumpId === pump.id ? 'text-blue-700' : 'text-gray-700'}`}>
                                ₱{parseFloat(pump.price_per_liter).toFixed(2)}/L
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Amount (big input) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount (₱)</label>
                    <input type="number" step="0.01" value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full px-4 py-4 border border-gray-200 rounded-xl text-3xl font-bold text-center text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0.00" autoFocus required />
                    {liters && selectedPump && (
                      <p className="text-center text-sm text-blue-600 mt-1 font-medium">
                        ≈ {liters} liters • {selectedPump.pump_name}
                      </p>
                    )}
                  </div>

                  {/* Payment method */}
                  <div className="flex gap-2">
                    {[
                      { value: 'cash', label: 'Cash', icon: Banknote },
                      { value: 'gcash', label: 'GCash', icon: DollarSign },
                    ].map(pm => {
                      const Icon = pm.icon
                      return (
                        <button key={pm.value} type="button"
                          onClick={() => setPaymentMethod(pm.value)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                            paymentMethod === pm.value
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-100 text-gray-500 hover:border-gray-300'
                          }`}>
                          <Icon size={14} /> {pm.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Optional fields */}
                  <details className="text-sm">
                    <summary className="text-xs text-gray-400 cursor-pointer mb-2">Optional details</summary>
                    <div className="space-y-2">
                      <input type="text" value={plateNumber} onChange={e => setPlateNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Plate number" />
                      <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Customer name" />
                      <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Notes" />
                    </div>
                  </details>

                  <button type="submit" disabled={saving || !amount}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 rounded-xl text-lg transition-colors disabled:opacity-50">
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><CheckCircle size={20} /> Record Sale</>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              /* Purchase Order Form */
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CreditCard size={18} className="text-amber-600" />
                    <h2 className="font-semibold text-gray-800">Purchase Order</h2>
                  </div>
                  <button onClick={() => setShowPO(false)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                    <Banknote size={14} /> Cash Sale
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-4">Gas taken but not yet paid — will be recorded as credit</p>

                <form onSubmit={handleCreatePO} className="space-y-3">
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Customer Name *</label>
                    <div className="flex gap-1 mb-1.5">
                      <button type="button"
                        onClick={() => { setPoCustomerMode('select'); setPoCustomer('') }}
                        className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                          poCustomerMode === 'select'
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        Choose from list
                      </button>
                      <button type="button"
                        onClick={() => { setPoCustomerMode('type'); setPoCustomer(''); setShowPoDropdown(false) }}
                        className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                          poCustomerMode === 'type'
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        Type new name
                      </button>
                    </div>

                    {poCustomerMode === 'select' ? (
                      <div
                        className="relative"
                        ref={poDropdownRef}
                        onBlur={e => {
                          if (!poDropdownRef.current?.contains(e.relatedTarget)) {
                            setShowPoDropdown(false)
                          }
                        }}
                      >
                        <button type="button"
                          onClick={() => setShowPoDropdown(v => !v)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500 flex items-center justify-between bg-white text-left">
                          <span className={poCustomer ? 'text-gray-800' : 'text-gray-400'}>
                            {poCustomer || 'Select customer...'}
                          </span>
                          <ChevronDown size={16} className="text-gray-400 shrink-0" />
                        </button>
                        {showPoDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                            <div className="p-2 border-b border-gray-100">
                              <input
                                type="text"
                                autoFocus
                                placeholder="Search name..."
                                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-amber-500"
                                onChange={e => {
                                  const q = e.target.value.toLowerCase()
                                  poDropdownRef.current?.querySelectorAll('[data-name]').forEach(el => {
                                    el.style.display = el.dataset.name.toLowerCase().includes(q) ? '' : 'none'
                                  })
                                }}
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {allCustomers.length === 0 ? (
                                <p className="px-3 py-3 text-xs text-gray-400 text-center">No past customers found</p>
                              ) : (
                                allCustomers.map((c, i) => (
                                  <button key={i} type="button"
                                    data-name={c.name}
                                    onMouseDown={() => {
                                      setPoCustomer(c.name)
                                      if (c.plate && !poPlate) setPoPlate(c.plate)
                                      setShowPoDropdown(false)
                                    }}
                                    className="w-full px-3 py-2 text-left hover:bg-amber-50 border-b border-gray-100 last:border-0">
                                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                                    {c.plate && <p className="text-xs text-gray-400">Plate: {c.plate}</p>}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <input type="text" value={poCustomer}
                          onChange={e => { setPoCustomer(e.target.value); setShowCustomerSuggestions(true) }}
                          onFocus={() => setShowCustomerSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
                          placeholder="Type customer name..." required={poCustomerMode === 'type'} autoComplete="off" />
                        {showCustomerSuggestions && customerSuggestions.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {customerSuggestions.map((c, i) => (
                              <button key={i} type="button"
                                onClick={() => handleSelectCustomer(c)}
                                className="w-full px-3 py-2 text-left hover:bg-amber-50 border-b border-gray-100 last:border-0">
                                <p className="text-sm font-medium text-gray-800">{c.name}</p>
                                {c.plate && <p className="text-xs text-gray-400">Plate: {c.plate}</p>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Select Pump</label>
                    {pumps.length === 0 ? (
                      <div className="text-center py-4 text-gray-400 text-xs">
                        No pumps configured
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {pumps.sort((a, b) => {
                          // Sort by fuel type first (Premium, Diesel, Unleaded)
                          if (a.fuel_type !== b.fuel_type) {
                            return a.fuel_type.localeCompare(b.fuel_type)
                          }
                          // Then by pump number
                          return a.pump_number - b.pump_number
                        }).map(pump => (
                          <button key={pump.id} type="button"
                            onClick={() => setPoPumpId(pump.id)}
                            className={`p-2.5 rounded-lg border-2 transition-all ${
                              poPumpId === pump.id
                                ? 'border-amber-500 bg-amber-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className={`text-sm font-bold ${poPumpId === pump.id ? 'text-amber-700' : 'text-gray-800'}`}>
                                #{pump.pump_number} {pump.fuel_type}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                                pump.category === 'discounted' 
                                  ? 'bg-amber-100 text-amber-700' 
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {pump.category === 'discounted' ? 'Discounted' : 'Regular'}
                              </span>
                              <span className={`text-[10px] font-bold ${poPumpId === pump.id ? 'text-amber-700' : 'text-gray-700'}`}>
                                ₱{parseFloat(pump.price_per_liter).toFixed(2)}/L
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount (₱)</label>
                    <input type="number" step="0.01" value={poAmount}
                      onChange={e => setPoAmount(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-2xl font-bold text-center text-gray-800 focus:ring-2 focus:ring-amber-500 outline-none"
                      placeholder="0.00" required />
                  </div>

                  <input type="text" value={poPlate} onChange={e => setPoPlate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Plate number (optional)" />
                  <input type="text" value={poNotes} onChange={e => setPoNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Notes (optional)" />

                  <button type="submit" disabled={saving || !poAmount || !poCustomer}
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl text-lg transition-colors disabled:opacity-50">
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><FileText size={20} /> Create PO</>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* Quick Amount Buttons */}
            {!showPO && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs text-gray-400 mb-2">Quick amounts</p>
                <div className="grid grid-cols-4 gap-2">
                  {[100, 200, 300, 500, 700, 1000, 1500, 2000].map(val => (
                    <button key={val} onClick={() => setAmount(String(val))}
                      className="py-2 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-lg text-sm font-medium text-gray-600 transition-colors">
                      ₱{val}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Transaction History - Compact */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-400" />
                  <h3 className="font-semibold text-gray-800 text-sm">Today's Transactions</h3>
                </div>
                <button onClick={fetchTodayData} className="text-xs text-blue-600 hover:text-blue-700">Refresh</button>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {loadingData ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
                ) : (todaySales.length === 0 && todayPOs.length === 0 && todayProductSales.length === 0) ? (
                  <div className="p-8 text-center text-gray-400 text-sm">No transactions yet today</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {/* Cash Sales */}
                    {todaySales.map(sale => (
                      <div key={sale.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                        <div className="p-2 bg-green-50 rounded-lg">
                          <Banknote size={14} className="text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">
                              ₱{parseFloat(sale.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                            {sale.fuel_types && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                {sale.fuel_types.short_code}
                              </span>
                            )}
                            <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded capitalize">
                              {sale.payment_method}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">
                            {format(new Date(sale.created_at), 'h:mm a')}
                            {sale.cashiers?.full_name && ` • ${sale.cashiers.full_name}`}
                            {sale.fuel_types?.name && ` • ${sale.fuel_types.name}`}
                            {sale.plate_number && ` — ${sale.plate_number}`}
                            {sale.customer_name && ` — ${sale.customer_name}`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* Purchase Orders */}
                    {todayPOs.map(po => (
                      <div key={po.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                        <div className="p-2 bg-amber-50 rounded-lg">
                          <CreditCard size={14} className="text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">
                              ₱{parseFloat(po.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                            {po.fuel_types && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                {po.fuel_types.short_code}
                              </span>
                            )}
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium uppercase">
                              {po.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">
                            {format(new Date(po.created_at), 'h:mm a')}
                            {po.cashiers?.full_name && ` • ${po.cashiers.full_name}`}
                            {po.fuel_types?.name && ` • ${po.fuel_types.name}`}
                            {` — PO: ${po.customer_name}`}
                            {po.plate_number && ` (${po.plate_number})`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {/* Product Sales */}
                    {todayProductSales.map(ps => (
                      <div key={ps.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
                        <div className="p-2 bg-purple-50 rounded-lg">
                          <Package size={14} className="text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">
                              ₱{parseFloat(ps.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">
                              {ps.product_name}
                            </span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              x{ps.quantity}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400">
                            {format(new Date(ps.created_at), 'h:mm a')}
                            {ps.cashier_name && ` • ${ps.cashier_name}`}
                            {` • ${ps.payment_method}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products Modal */}
      {showProducts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Package size={20} className="text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-800">Sell Products</h2>
              </div>
              <button onClick={() => { setShowProducts(false); setCart([]); setProductSearch('') }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Left: Product List */}
              <div className="flex-1 flex flex-col border-r border-gray-200">
                {/* Search */}
                <div className="p-3 border-b border-gray-100">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      placeholder="Search products..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                  </div>
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto p-3">
                  {filteredProducts.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">No products found</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {filteredProducts.map(p => (
                        <button key={p.id} onClick={() => addToCart(p)}
                          disabled={p.stock_quantity <= 0}
                          className={`p-3 border rounded-lg text-left transition-colors ${
                            p.stock_quantity <= 0 
                              ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed' 
                              : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                          }`}>
                          <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{CATEGORIES[p.category] || p.category}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-purple-600 font-bold text-sm">₱{parseFloat(p.price).toFixed(2)}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              p.stock_quantity <= 0 
                                ? 'bg-red-100 text-red-600' 
                                : p.stock_quantity <= p.reorder_level 
                                  ? 'bg-amber-100 text-amber-600' 
                                  : 'bg-green-100 text-green-600'
                            }`}>
                              {p.stock_quantity <= 0 ? 'Out of stock' : `${p.stock_quantity} in stock`}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Cart */}
              <div className="w-72 flex flex-col bg-gray-50">
                <div className="p-3 border-b border-gray-200 bg-white">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <ShoppingCart size={16} /> Cart ({cart.length})
                  </h3>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {cart.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-8">Cart is empty</div>
                  ) : (
                    cart.map(item => (
                      <div key={item.product.id} className="bg-white rounded-lg p-2 border border-gray-200">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
                            <p className="text-xs text-gray-400">₱{parseFloat(item.product.price).toFixed(2)} each</p>
                            <p className="text-[10px] text-gray-400">Stock: {item.product.stock_quantity}</p>
                          </div>
                          <button onClick={() => removeFromCart(item.product.id)}
                            className="text-red-400 hover:text-red-600 text-xs">×</button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateCartQuantity(item.product.id, -1)}
                              className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                              <Minus size={12} />
                            </button>
                            <span className={`w-8 text-center text-sm font-medium ${
                              item.quantity >= item.product.stock_quantity ? 'text-red-600' : ''
                            }`}>{item.quantity}</span>
                            <button onClick={() => updateCartQuantity(item.product.id, 1)}
                              disabled={item.quantity >= item.product.stock_quantity}
                              className={`w-6 h-6 rounded flex items-center justify-center ${
                                item.quantity >= item.product.stock_quantity 
                                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed' 
                                  : 'bg-gray-100 hover:bg-gray-200'
                              }`}>
                              <Plus size={12} />
                            </button>
                          </div>
                          <p className="text-sm font-bold text-purple-600">
                            ₱{(item.product.price * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Cart Footer */}
                <div className="p-3 border-t border-gray-200 bg-white space-y-3">
                  {/* Payment Method */}
                  <div className="flex gap-1">
                    {['cash', 'gcash'].map(pm => (
                      <button key={pm} onClick={() => setProductPaymentMethod(pm)}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                          productPaymentMethod === pm
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {pm === 'cash' ? 'Cash' : 'GCash'}
                      </button>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Total</span>
                    <span className="text-xl font-bold text-gray-800">₱{cartTotal.toFixed(2)}</span>
                  </div>

                  {/* Checkout Button */}
                  <button onClick={handleProductSale} disabled={saving || cart.length === 0}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><CheckCircle size={18} /> Complete Sale</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vault Modal (Unified Deposit & Withdrawal) */}
      {showVault && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Vault size={20} className="text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Vault Management</h2>
                  <p className="text-xs text-gray-500">{cashier?.branches?.name}</p>
                </div>
              </div>
              <button onClick={() => setShowVault(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <Plus size={20} className="rotate-45 text-gray-400" />
              </button>
            </div>

            {/* Two Column Layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* LEFT SIDE - Form */}
              <div className="w-1/2 border-r border-gray-200 flex flex-col">
                {/* Tabs */}
                <div className="flex border-b">
                  <button
                    onClick={() => setVaultTab('deposit')}
                    className={`flex-1 py-3 text-sm font-semibold ${
                      vaultTab === 'deposit'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500'
                    }`}
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setVaultTab('withdraw')}
                    className={`flex-1 py-3 text-sm font-semibold ${
                      vaultTab === 'withdraw'
                        ? 'text-orange-600 border-b-2 border-orange-600'
                        : 'text-gray-500'
                    }`}
                  >
                    Withdraw
                  </button>
                </div>

                {/* Forms */}
                <div className="flex-1 overflow-y-auto">
                  {vaultTab === 'deposit' && (
                    <form onSubmit={handleVaultDeposit} className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱)</label>
                        <input type="number" step="0.01" value={vaultAmount}
                          onChange={e => setVaultAmount(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-2xl font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="0.00" required autoFocus />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <textarea value={vaultNotes} onChange={e => setVaultNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                          placeholder="Optional notes..." rows="3" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setShowVault(false)}
                          className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">
                          Cancel
                        </button>
                        <button type="submit" disabled={saving || !vaultAmount}
                          className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {saving ? 'Saving...' : 'Deposit'}
                        </button>
                      </div>
                    </form>
                  )}

                  {vaultTab === 'withdraw' && (
                    <form onSubmit={handleVaultWithdrawal} className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱)</label>
                        <input type="number" step="0.01" value={vaultAmount}
                          onChange={e => setVaultAmount(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-2xl font-bold text-center focus:ring-2 focus:ring-orange-500 outline-none"
                          placeholder="0.00" required autoFocus />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                        <select value={withdrawalReason} onChange={e => setWithdrawalReason(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                          required>
                          <option value="">Select reason...</option>
                          <option value="Change for customer">Change for customer</option>
                          <option value="Petty cash">Petty cash</option>
                          <option value="Expenses">Expenses</option>
                          <option value="Emergency">Emergency</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <textarea value={vaultNotes} onChange={e => setVaultNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                          placeholder="Optional notes..." rows="3" />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setShowVault(false)}
                          className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">
                          Cancel
                        </button>
                        <button type="submit" disabled={saving || !vaultAmount || !withdrawalReason}
                          className="flex-1 py-2.5 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50">
                          {saving ? 'Saving...' : 'Withdraw'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE - Balance & Logs */}
              <div className="w-1/2 flex flex-col overflow-hidden">
                {/* Balance */}
                <div className="bg-blue-600 p-6 text-center text-white">
                  <p className="text-xs mb-1">Current Balance</p>
                  <p className="text-4xl font-bold">₱{vaultBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  <div className="flex gap-6 justify-center mt-3 text-sm">
                    <div>
                      <p className="text-xs opacity-80">Deposits</p>
                      <p className="font-semibold">₱{todayDeposits.reduce((s, d) => s + parseFloat(d.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs opacity-80">Withdrawals</p>
                      <p className="font-semibold">₱{todayWithdrawals.reduce((s, w) => s + parseFloat(w.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                  <h3 className="text-xs font-semibold text-gray-600 mb-3">Today's Transactions</h3>
                  <div className="space-y-2">
                    {[...todayDeposits.map(d => ({ ...d, type: 'deposit' })), ...todayWithdrawals.map(w => ({ ...w, type: 'withdrawal' }))]
                      .sort((a, b) => new Date(b.deposit_date || b.withdrawal_date) - new Date(a.deposit_date || a.withdrawal_date))
                      .map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-white p-3 rounded-lg border">
                          <div className="flex items-center gap-2">
                            {t.type === 'deposit' ? <Plus size={14} className="text-blue-600" /> : <Minus size={14} className="text-orange-600" />}
                            <div>
                              <p className="font-medium">{t.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</p>
                              <p className="text-[10px] text-gray-500">
                                {format(new Date(t.deposit_date || t.withdrawal_date), 'h:mm a')} • {t.cashiers?.full_name || 'Unknown'}
                              </p>
                              {t.reason && <p className="text-[10px] text-orange-600">{t.reason}</p>}
                            </div>
                          </div>
                          <span className={`font-semibold ${t.type === 'deposit' ? 'text-blue-600' : 'text-orange-600'}`}>
                            {t.type === 'deposit' ? '+' : '-'}₱{parseFloat(t.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    {todayDeposits.length === 0 && todayWithdrawals.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">No transactions today</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Pump Readings (View Only) */}
      <LivePumpReadings 
        isOpen={showPumpReadings} 
        onClose={() => setShowPumpReadings(false)} 
      />

      {/* Cashier Accountability */}
      <CashierAccountability
        isOpen={showAccountability}
        onClose={() => setShowAccountability(false)}
      />

      {/* Calibration Modal */}
      {showCalibration && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-pink-600 to-pink-700 text-white p-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Beaker className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold">Pump Calibration</h2>
                    <p className="text-pink-100 text-xs">Record calibration (not a sale)</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCalibration(false)
                    setCalibrationPumpId('')
                    setCalibrationLiters('')
                    setCalibrationNotes('')
                  }}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleCalibration} className="p-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Calibration adds liters to the pump reading but is NOT counted as a sale. 
                  It will be shown as a deduction in the accountability report.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Pump *</label>
                <select
                  value={calibrationPumpId}
                  onChange={(e) => setCalibrationPumpId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                  required
                >
                  <option value="">Choose a pump...</option>
                  {pumps.map(pump => (
                    <option key={pump.id} value={pump.id}>
                      #{pump.pump_number} {pump.pump_name} - ₱{parseFloat(pump.price_per_liter).toFixed(2)}/L
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Liters *</label>
                <input
                  type="number"
                  step="0.001"
                  value={calibrationLiters}
                  onChange={(e) => setCalibrationLiters(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none font-mono text-lg"
                  placeholder="e.g., 10"
                  required
                />
              </div>

              {calibrationPumpId && calibrationLiters && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">
                    Amount (deduction): <span className="font-mono font-semibold text-pink-600">
                      ₱{(parseFloat(calibrationLiters || 0) * parseFloat(pumps.find(p => p.id === calibrationPumpId)?.price_per_liter || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={calibrationNotes}
                  onChange={(e) => setCalibrationNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                  placeholder="e.g., Monthly calibration test"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving || !calibrationPumpId || !calibrationLiters}
                  className="flex-1 py-2.5 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Beaker size={18} />
                  Record Calibration
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCalibration(false)
                    setCalibrationPumpId('')
                    setCalibrationLiters('')
                    setCalibrationNotes('')
                  }}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
