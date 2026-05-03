import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function verifyFix() {
  console.log('🔍 Verifying product sales fix...\n')

  const today = '2026-05-03' // Today's date from the screenshot
  const shift = 1
  const balingasagBranchId = 'e4573298-a370-4439-bb28-1af9446e5768'

  console.log(`📅 Checking for shift ${shift} on ${today} at Balingasag branch\n`)

  // Query product sales with shift tracking (same as AccountabilityReport)
  const { data: productSales, error } = await supabase
    .from('product_sales')
    .select('*')
    .eq('shift_date', today)
    .eq('shift_number', shift)
    .eq('branch_id', balingasagBranchId)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`✅ Found ${productSales.length} product sales for this shift:\n`)

  let totalAmount = 0
  productSales.forEach((sale, i) => {
    console.log(`Product Sale #${i + 1}:`)
    console.log(`  Product: ${sale.product_name}`)
    console.log(`  Quantity: ${sale.quantity}`)
    console.log(`  Unit Price: ₱${sale.unit_price}`)
    console.log(`  Total: ₱${sale.total_amount}`)
    console.log(`  Cashier: ${sale.cashier_name}`)
    console.log(`  Shift: ${sale.shift_number} on ${sale.shift_date}`)
    console.log(`  Created: ${new Date(sale.created_at).toLocaleString()}`)
    console.log('')
    totalAmount += parseFloat(sale.total_amount)
  })

  console.log(`💰 Total Product Sales: ₱${totalAmount.toFixed(2)}`)
  console.log('\n✨ This amount should now appear in the accountability report under "MISCELLANEOUS"')
}

verifyFix().catch(console.error)
