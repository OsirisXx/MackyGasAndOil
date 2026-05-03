import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkSales() {
  console.log('🔍 Checking recent sales...\n')

  // Get today's sales
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  const { data: sales, error } = await supabase
    .from('cash_sales')
    .select('*')
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`📊 Found ${sales.length} sales today:\n`)

  sales.forEach((sale, i) => {
    console.log(`Sale #${i + 1}:`)
    console.log(`  ID: ${sale.id}`)
    console.log(`  Amount: ₱${sale.amount}`)
    console.log(`  Created: ${new Date(sale.created_at).toLocaleString()}`)
    console.log(`  Shift Date: ${sale.shift_date}`)
    console.log(`  Shift Number: ${sale.shift_number}`)
    console.log(`  Cashier ID: ${sale.cashier_id}`)
    console.log(`  Branch ID: ${sale.branch_id}`)
    console.log(`  Pump ID: ${sale.pump_id}`)
    console.log('')
  })

  // Check what the accountability report is looking for
  const reportDate = today.toISOString().split('T')[0] // YYYY-MM-DD
  const shiftNumber = 1

  console.log(`🔎 Accountability report is looking for:`)
  console.log(`  shift_date = '${reportDate}'`)
  console.log(`  shift_number = ${shiftNumber}\n`)

  const matchingSales = sales.filter(s => 
    s.shift_date === reportDate && s.shift_number === shiftNumber
  )

  console.log(`✅ Sales matching report criteria: ${matchingSales.length}`)
  
  if (matchingSales.length === 0 && sales.length > 0) {
    console.log('\n⚠️  MISMATCH FOUND!')
    console.log('Sales exist but don\'t match the report criteria.')
    console.log('\nPossible issues:')
    sales.forEach((sale, i) => {
      if (sale.shift_date !== reportDate) {
        console.log(`  - Sale #${i + 1}: shift_date is '${sale.shift_date}' (expected '${reportDate}')`)
      }
      if (sale.shift_number !== shiftNumber) {
        console.log(`  - Sale #${i + 1}: shift_number is ${sale.shift_number} (expected ${shiftNumber})`)
      }
    })
  }
}

checkSales().catch(console.error)
