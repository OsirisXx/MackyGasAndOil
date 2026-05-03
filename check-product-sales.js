import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkProductSales() {
  console.log('🔍 Checking product sales for Balingasag branch...\n')

  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  // Balingasag branch ID (from your screenshot)
  const balingasagBranchId = 'e4573298-a370-4439-bb28-1af9446e5768'
  
  const { data: productSales, error } = await supabase
    .from('product_sales')
    .select('*')
    .eq('branch_id', balingasagBranchId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`📊 Found ${productSales.length} product sales for Balingasag today:\n`)

  productSales.forEach((sale, i) => {
    console.log(`Product Sale #${i + 1}:`)
    console.log(`  ID: ${sale.id}`)
    console.log(`  Product: ${sale.product_name}`)
    console.log(`  Quantity: ${sale.quantity}`)
    console.log(`  Unit Price: ₱${sale.unit_price}`)
    console.log(`  Total: ₱${sale.total_amount}`)
    console.log(`  Created: ${new Date(sale.created_at).toLocaleString()}`)
    console.log(`  Cashier: ${sale.cashier_name}`)
    console.log(`  Branch ID: ${sale.branch_id}`)
    console.log('')
  })

  // Check if product_sales table has shift_date and shift_number columns
  console.log('🔎 Checking if product_sales has shift tracking columns...\n')
  
  const { data: columns, error: colError } = await supabase
    .from('product_sales')
    .select('*')
    .limit(1)

  if (columns && columns.length > 0) {
    const firstSale = columns[0]
    console.log('Product sales columns:', Object.keys(firstSale))
    console.log('\n⚠️  Does product_sales have shift_date?', 'shift_date' in firstSale)
    console.log('⚠️  Does product_sales have shift_number?', 'shift_number' in firstSale)
  }
}

checkProductSales().catch(console.error)
