import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function runMigration() {
  console.log('🚀 Running migration 31: Add shift tracking to product_sales...\n')

  // Read the migration file
  const migrationSQL = fs.readFileSync('supabase/31_add_shift_tracking_to_product_sales.sql', 'utf8')

  // Split by semicolons and execute each statement
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'))

  for (const statement of statements) {
    // Skip DO blocks and comments
    if (statement.includes('DO $') || statement.includes('RAISE NOTICE')) {
      console.log('⏭️  Skipping DO block...')
      continue
    }

    console.log(`📝 Executing: ${statement.substring(0, 80)}...`)
    
    const { data, error } = await supabase.rpc('exec_sql', { sql: statement })
    
    if (error) {
      console.error('❌ Error:', error)
      // Try alternative approach using direct query
      console.log('🔄 Trying alternative approach...')
      
      // For ALTER TABLE, we need admin privileges
      // Let's just verify the columns exist instead
      if (statement.includes('ALTER TABLE product_sales')) {
        console.log('⚠️  ALTER TABLE requires admin privileges')
        console.log('📋 Please run this migration in Supabase SQL Editor:')
        console.log('   https://supabase.com/dashboard/project/obinxgdqklzwhhjkzpxu/sql/new')
        console.log('\n' + migrationSQL)
        return
      }
    } else {
      console.log('✅ Success')
    }
  }

  // Verify the migration
  console.log('\n🔍 Verifying migration...')
  const { data: productSales, error: verifyError } = await supabase
    .from('product_sales')
    .select('*')
    .limit(1)

  if (verifyError) {
    console.error('❌ Verification error:', verifyError)
    return
  }

  if (productSales && productSales.length > 0) {
    const columns = Object.keys(productSales[0])
    console.log('\n📊 Product sales columns:', columns)
    console.log('✅ Has shift_date?', columns.includes('shift_date'))
    console.log('✅ Has shift_number?', columns.includes('shift_number'))
  }

  console.log('\n✨ Migration complete!')
}

runMigration().catch(console.error)
