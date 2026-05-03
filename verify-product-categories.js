import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function verifyCategories() {
  console.log('🔍 Verifying product sales categorization...\n')

  const today = '2026-05-03'
  const shift = 1
  const balingasagBranchId = 'e4573298-a370-4439-bb28-1af9446e5768'

  // Query product sales (same as AccountabilityReport)
  const { data: productSales, error: salesError } = await supabase
    .from('product_sales')
    .select('*')
    .eq('shift_date', today)
    .eq('shift_number', shift)
    .eq('branch_id', balingasagBranchId)

  if (salesError) {
    console.error('❌ Error fetching sales:', salesError)
    return
  }

  // Fetch all products to get categories
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, category')

  if (productsError) {
    console.error('❌ Error fetching products:', productsError)
    return
  }

  console.log(`✅ Found ${productSales.length} product sales:\n`)

  // Create product category map
  const productCategoryMap = {}
  products.forEach(product => {
    productCategoryMap[product.id] = { name: product.name, category: product.category }
  })

  const categorizedSales = {
    oil_lubes: 0,
    accessories: 0,
    services: 0,
    miscellaneous: 0
  }

  productSales.forEach((sale, i) => {
    const productInfo = productCategoryMap[sale.product_id]
    const category = productInfo?.category || 'miscellaneous'
    const amount = parseFloat(sale.total_amount || 0)
    
    console.log(`Sale #${i + 1}:`)
    console.log(`  Product: ${sale.product_name}`)
    console.log(`  Category: ${category}`)
    console.log(`  Amount: ₱${amount}`)
    console.log('')
    
    if (category in categorizedSales) {
      categorizedSales[category] += amount
    } else {
      categorizedSales.miscellaneous += amount
    }
  })

  console.log('📊 Categorized Totals:')
  console.log(`  TOTAL OIL / LUBES:  ₱${categorizedSales.oil_lubes.toFixed(2)}`)
  console.log(`  ACCESSORIES:        ₱${categorizedSales.accessories.toFixed(2)}`)
  console.log(`  SERVICES:           ₱${categorizedSales.services.toFixed(2)}`)
  console.log(`  MISCELLANEOUS:      ₱${categorizedSales.miscellaneous.toFixed(2)}`)
  console.log('')
  console.log('✨ These amounts should now appear in the correct categories in the accountability report!')
}

verifyCategories().catch(console.error)
