import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://obinxgdqklzwhhjkzpxu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaW54Z2Rxa2x6d2hoamt6cHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3MjU5NzcsImV4cCI6MjA1MTMwMTk3N30.sb_publishable_2KoBImVRHuoQ2GWmfMVWow_CzoMcVte'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkBranches() {
  const { data: branches, error } = await supabase
    .from('branches')
    .select('*')
  
  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Available branches:')
  branches.forEach(b => {
    console.log(`  - ${b.name} (ID: ${b.id})`)
  })
}

checkBranches()
