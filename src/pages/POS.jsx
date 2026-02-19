import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useFuelStore } from '../stores/fuelStore'
import { useProductStore } from '../stores/productStore'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  Fuel, DollarSign, Plus, ShoppingCart, FileText,
  Clock, LogOut, CheckCircle, Banknote, CreditCard, Package, Search, Minus
} from 'lucide-react'
import toast from 'react-hot-toast'
import { logAudit } from '../stores/auditStore'

export default function POS() {
  const { cashier, cashierCheckOut } = useAuthStore()
  const { fuelTypes, fetchFuelTypes } = useFuelStore()
  const { products, fetchProducts } = useProductStore()

  // Transaction form
  const [fuelTypeId, setFuelTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customerName, setCustomerName] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // PO form
  const [showPO, setShowPO] = useState(false)
  const [poCustomer, setPoCustomer] = useState('')
  const [poFuelTypeId, setPoFuelTypeId] = useState('')
  const [poAmount, setPoAmount] = useState('')
  const [poPlate, setPoPlate] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)

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

  useEffect(() => {
    fetchFuelTypes()
    fetchProducts()
    fetchAllCustomers()
    if (cashier) fetchTodayData()
  }, [cashier])

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
      const today = format(new Date(), 'yyyy-MM-dd')
      const [salesRes, poRes, prodRes] = await Promise.all([
        supabase.from('cash_sales')
          .select('*, fuel_types(short_code, name)')
          .eq('cashier_id', cashier.id)
          .gte('created_at', today + 'T00:00:00')
          .lte('created_at', today + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase.from('purchase_orders')
          .select('*, fuel_types(short_code, name)')
          .eq('cashier_id', cashier.id)
          .gte('created_at', today + 'T00:00:00')
          .lte('created_at', today + 'T23:59:59')
          .order('created_at', { ascending: false }),
        supabase.from('product_sales')
          .select('*')
          .eq('cashier_id', cashier.id)
          .gte('created_at', today + 'T00:00:00')
          .lte('created_at', today + 'T23:59:59')
          .order('created_at', { ascending: false }),
      ])
      setTodaySales(salesRes.data || [])
      setTodayPOs(poRes.data || [])
      setTodayProductSales(prodRes.data || [])
    } catch (err) {
      console.error('POS fetch error:', err)
    } finally {
      setLoadingData(false)
    }
  }

  // Computed
  const selectedFuel = fuelTypes.find(f => f.id === fuelTypeId)
  const liters = selectedFuel && amount ? (parseFloat(amount) / parseFloat(selectedFuel.current_price)).toFixed(3) : null

  const totalCashToday = useMemo(() =>
    todaySales.reduce((s, t) => s + parseFloat(t.amount || 0), 0), [todaySales])
  const totalPOToday = useMemo(() =>
    todayPOs.reduce((s, t) => s + parseFloat(t.amount || 0), 0), [todayPOs])

  const handleRecordSale = async (e) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter a valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('cash_sales').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        fuel_type_id: fuelTypeId || null,
        amount: parseFloat(amount),
        liters: liters ? parseFloat(liters) : null,
        price_per_liter: selectedFuel ? parseFloat(selectedFuel.current_price) : null,
        payment_method: paymentMethod,
        customer_name: customerName || null,
        plate_number: plateNumber || null,
        notes: notes || null,
      })
      if (error) throw error
      toast.success(`₱${parseFloat(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} sale recorded!`)
      logAudit('create', 'cash_sale', `Cash sale of ₱${parseFloat(amount).toFixed(2)}`, {
        newValues: { amount: parseFloat(amount), fuel_type_id: fuelTypeId, payment_method: paymentMethod },
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
    if (!poCustomer) return toast.error('Customer name is required')
    if (!poAmount || parseFloat(poAmount) <= 0) return toast.error('Enter a valid amount')
    setSaving(true)
    try {
      const poFuel = fuelTypes.find(f => f.id === poFuelTypeId)
      const poLiters = poFuel && poAmount ? (parseFloat(poAmount) / parseFloat(poFuel.current_price)).toFixed(3) : null
      const { error } = await supabase.from('purchase_orders').insert({
        cashier_id: cashier.id,
        branch_id: cashier.branch_id || null,
        customer_name: poCustomer,
        fuel_type_id: poFuelTypeId || null,
        amount: parseFloat(poAmount),
        liters: poLiters ? parseFloat(poLiters) : null,
        price_per_liter: poFuel ? parseFloat(poFuel.current_price) : null,
        plate_number: poPlate || null,
        notes: poNotes || null,
        status: 'unpaid',
      })
      if (error) throw error
      toast.success('Purchase order created!')
      logAudit('create', 'purchase_order', `Purchase order of ₱${parseFloat(poAmount).toFixed(2)}`, {
        newValues: { amount: parseFloat(poAmount), fuel_type_id: poFuelTypeId },
        branchId: cashier.branch_id,
        branchName: cashier.branches?.name,
        cashierId: cashier.id,
        cashierName: cashier.full_name,
      })
      setPoCustomer('')
      setPoFuelTypeId('')
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

  const handleEndShift = async () => {
    if (!confirm('End your shift and check out?')) return
    await cashierCheckOut()
    toast.success('Shift ended. Goodbye!')
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
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
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
    if (cart.length === 0) return toast.error('Cart is empty')
    setSaving(true)
    try {
      // Insert each cart item as a product sale
      const salesData = cart.map(item => ({
        cashier_id: cashier.id,
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
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">{cashier?.full_name}</p>
            <p className="text-[10px] text-gray-400">{format(new Date(), 'MMM d, yyyy — h:mm a')}</p>
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
                  </div>
                </div>

                <form onSubmit={handleRecordSale} className="space-y-3">
                  {/* Fuel Type Quick Select */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Fuel Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {fuelTypes.filter(f => !f.is_discounted).map(ft => (
                        <button key={ft.id} type="button"
                          onClick={() => setFuelTypeId(ft.id)}
                          className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                            fuelTypeId === ft.id
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-100 hover:border-gray-300 text-gray-600'
                          }`}>
                          <p className="font-bold text-sm">{ft.short_code}</p>
                          <p className="text-[10px] text-gray-400">₱{parseFloat(ft.current_price).toFixed(2)}/L</p>
                        </button>
                      ))}
                    </div>
                    {fuelTypes.some(f => f.is_discounted) && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-gray-400 cursor-pointer">Discounted prices</summary>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {fuelTypes.filter(f => f.is_discounted).map(ft => (
                            <button key={ft.id} type="button"
                              onClick={() => setFuelTypeId(ft.id)}
                              className={`p-2 rounded-lg border-2 text-center transition-all ${
                                fuelTypeId === ft.id
                                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                                  : 'border-gray-100 hover:border-gray-300 text-gray-600'
                              }`}>
                              <p className="font-bold text-xs">{ft.short_code}</p>
                              <p className="text-[10px] text-gray-400">₱{parseFloat(ft.current_price).toFixed(2)}/L</p>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>

                  {/* Amount (big input) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount (₱)</label>
                    <input type="number" step="0.01" value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full px-4 py-4 border border-gray-200 rounded-xl text-3xl font-bold text-center text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="0.00" autoFocus required />
                    {liters && (
                      <p className="text-center text-sm text-blue-600 mt-1 font-medium">
                        ≈ {liters} liters of {selectedFuel?.short_code}
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
                    <input type="text" value={poCustomer} 
                      onChange={e => { setPoCustomer(e.target.value); setShowCustomerSuggestions(true) }}
                      onFocus={() => setShowCustomerSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Who took the gas?" required autoComplete="off" />
                    
                    {/* Customer Suggestions Dropdown */}
                    {showCustomerSuggestions && customerSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {customerSuggestions.map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelectCustomer(c)}
                            className="w-full px-3 py-2 text-left hover:bg-amber-50 border-b border-gray-100 last:border-0"
                          >
                            <p className="text-sm font-medium text-gray-800">{c.name}</p>
                            {c.plate && <p className="text-xs text-gray-400">Plate: {c.plate}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Fuel Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {fuelTypes.filter(f => !f.is_discounted).map(ft => (
                        <button key={ft.id} type="button"
                          onClick={() => setPoFuelTypeId(ft.id)}
                          className={`p-2 rounded-lg border-2 text-center transition-all text-xs ${
                            poFuelTypeId === ft.id
                              ? 'border-amber-500 bg-amber-50 text-amber-700'
                              : 'border-gray-100 hover:border-gray-300 text-gray-600'
                          }`}>
                          <p className="font-bold">{ft.short_code}</p>
                          <p className="text-[10px] text-gray-400">₱{parseFloat(ft.current_price).toFixed(2)}</p>
                        </button>
                      ))}
                    </div>
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
                            {format(new Date(po.created_at), 'h:mm a')} — PO: {po.customer_name}
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
                            {format(new Date(ps.created_at), 'h:mm a')} • {ps.payment_method}
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
                          className="p-3 border border-gray-200 rounded-lg text-left hover:border-purple-300 hover:bg-purple-50 transition-colors">
                          <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{CATEGORIES[p.category] || p.category}</p>
                          <p className="text-purple-600 font-bold text-sm mt-1">₱{parseFloat(p.price).toFixed(2)}</p>
                          {p.stock_quantity <= p.reorder_level && (
                            <p className="text-[9px] text-red-500 mt-0.5">Low stock: {p.stock_quantity}</p>
                          )}
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
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => updateCartQuantity(item.product.id, 1)}
                              className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
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
    </div>
  )
}
