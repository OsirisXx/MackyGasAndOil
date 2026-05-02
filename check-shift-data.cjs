const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkShiftData() {
  try {
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('name', 'Balingasag')
      .single();
    
    const reportDate = '2026-05-01';
    const branchId = branches.id;
    const start = new Date(2026, 4, 1, 0, 0, 0, 0).toISOString();
    const end = new Date(2026, 4, 1, 23, 59, 59, 999).toISOString();
    
    // Get deposits with timestamps
    const { data: deposits } = await supabase
      .from('cash_deposits')
      .select('id, amount, deposit_type, deposit_date, shift_number, shift_date')
      .gte('deposit_date', start)
      .lte('deposit_date', end)
      .eq('branch_id', branchId)
      .is('deleted_at', null)
      .order('deposit_date');
    
    // Get withdrawals with timestamps
    const { data: withdrawals } = await supabase
      .from('cash_withdrawals')
      .select('id, amount, withdrawal_date, shift_number, shift_date')
      .gte('withdrawal_date', start)
      .lte('withdrawal_date', end)
      .eq('branch_id', branchId)
      .order('withdrawal_date');
    
    // Get POs with timestamps
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id, amount, created_at, shift_number, shift_date')
      .gte('created_at', start)
      .lte('created_at', end)
      .eq('branch_id', branchId)
      .order('created_at');
    
    console.log('\n=== DEPOSITS (16 total) ===');
    deposits?.forEach(d => {
      const date = new Date(d.deposit_date);
      const hour = date.getHours();
      const isShift3 = (hour >= 21 || hour < 5);
      const type = (d.deposit_type || 'vault_deposit').padEnd(15);
      const amt = d.amount.toString().padStart(8);
      const h = hour.toString().padStart(2);
      const s3 = isShift3 ? '✓' : '✗';
      const sn = d.shift_number || 'null';
      console.log(`${type} ${amt} | ${date.toISOString()} | Hour: ${h} | Shift3: ${s3} | shift_number: ${sn}`);
    });
    
    console.log('\n=== WITHDRAWALS (7 total) ===');
    withdrawals?.forEach(w => {
      const date = new Date(w.withdrawal_date);
      const hour = date.getHours();
      const isShift3 = (hour >= 21 || hour < 5);
      const amt = w.amount.toString().padStart(8);
      const h = hour.toString().padStart(2);
      const s3 = isShift3 ? '✓' : '✗';
      const sn = w.shift_number || 'null';
      console.log(`${amt} | ${date.toISOString()} | Hour: ${h} | Shift3: ${s3} | shift_number: ${sn}`);
    });
    
    console.log('\n=== PURCHASE ORDERS (5 total) ===');
    pos?.forEach(p => {
      const date = new Date(p.created_at);
      const hour = date.getHours();
      const isShift3 = (hour >= 21 || hour < 5);
      const amt = p.amount.toString().padStart(8);
      const h = hour.toString().padStart(2);
      const s3 = isShift3 ? '✓' : '✗';
      const sn = p.shift_number || 'null';
      console.log(`${amt} | ${date.toISOString()} | Hour: ${h} | Shift3: ${s3} | shift_number: ${sn}`);
    });
    
    // Filter by shift 3 hours (21:00 to 05:00)
    const shift3Deposits = deposits?.filter(d => {
      const hour = new Date(d.deposit_date).getHours();
      return hour >= 21 || hour < 5;
    });
    
    const shift3Withdrawals = withdrawals?.filter(w => {
      const hour = new Date(w.withdrawal_date).getHours();
      return hour >= 21 || hour < 5;
    });
    
    const shift3POs = pos?.filter(p => {
      const hour = new Date(p.created_at).getHours();
      return hour >= 21 || hour < 5;
    });
    
    console.log('\n=== SHIFT 3 FILTERED DATA (9PM-5AM) ===');
    console.log('Deposits:', shift3Deposits?.length || 0);
    console.log('Withdrawals:', shift3Withdrawals?.length || 0);
    console.log('Purchase Orders:', shift3POs?.length || 0);
    
    // Calculate totals
    const depositsByType = { vault_deposit: 0, cash_register: 0, gcash: 0 };
    shift3Deposits?.forEach(d => {
      const type = d.deposit_type || 'vault_deposit';
      depositsByType[type] = (depositsByType[type] || 0) + parseFloat(d.amount || 0);
    });
    
    const totalWithdrawals = shift3Withdrawals?.reduce((s, w) => s + parseFloat(w.amount || 0), 0) || 0;
    const totalPOs = shift3POs?.reduce((s, p) => s + parseFloat(p.amount || 0), 0) || 0;
    
    console.log('\nA. TOTAL CASH DEPOSIT:', depositsByType.vault_deposit.toFixed(2));
    console.log('B. TOTAL CASH REGISTER:', depositsByType.cash_register.toFixed(2));
    console.log('   GCash:', depositsByType.gcash.toFixed(2));
    console.log('C. TOTAL CASH OUT:', totalWithdrawals.toFixed(2));
    console.log('D. CHARGE INVOICES:', totalPOs.toFixed(2));
    console.log('TOTAL REMITTANCE:', (depositsByType.vault_deposit + depositsByType.cash_register + totalWithdrawals).toFixed(2));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkShiftData();
