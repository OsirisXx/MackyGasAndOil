const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkShift3Data() {
  try {
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('name', 'Balingasag')
      .single();
    
    const branchId = branches.id;
    
    // Query for shift 3 on May 1, 2026 using shift_number and shift_date columns
    const { data: deposits } = await supabase
      .from('cash_deposits')
      .select('amount, deposit_type, deposit_date, shift_number, shift_date')
      .eq('shift_date', '2026-05-01')
      .eq('shift_number', 3)
      .eq('branch_id', branchId)
      .is('deleted_at', null);
    
    const { data: withdrawals } = await supabase
      .from('cash_withdrawals')
      .select('amount, withdrawal_date, shift_number, shift_date')
      .eq('shift_date', '2026-05-01')
      .eq('shift_number', 3)
      .eq('branch_id', branchId);
    
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('amount, created_at, shift_number, shift_date')
      .eq('shift_date', '2026-05-01')
      .eq('shift_number', 3)
      .eq('branch_id', branchId);
    
    console.log('=== SHIFT 3 DATA (using shift_number=3 and shift_date=2026-05-01) ===');
    console.log('Deposits:', deposits?.length || 0);
    console.log('Withdrawals:', withdrawals?.length || 0);
    console.log('Purchase Orders:', pos?.length || 0);
    
    const depositsByType = { vault_deposit: 0, cash_register: 0, gcash: 0 };
    deposits?.forEach(d => {
      const type = d.deposit_type || 'vault_deposit';
      depositsByType[type] = (depositsByType[type] || 0) + parseFloat(d.amount || 0);
      console.log(`  ${type}: ${d.amount}`);
    });
    
    const totalWithdrawals = withdrawals?.reduce((s, w) => s + parseFloat(w.amount || 0), 0) || 0;
    withdrawals?.forEach(w => console.log(`  withdrawal: ${w.amount}`));
    
    const totalPOs = pos?.reduce((s, p) => s + parseFloat(p.amount || 0), 0) || 0;
    pos?.forEach(p => console.log(`  PO: ${p.amount}`));
    
    console.log('\n=== TOTALS ===');
    console.log('A. TOTAL CASH DEPOSIT:', depositsByType.vault_deposit.toFixed(2));
    console.log('B. TOTAL CASH REGISTER:', depositsByType.cash_register.toFixed(2));
    console.log('   GCash:', depositsByType.gcash.toFixed(2));
    console.log('C. TOTAL CASH OUT:', totalWithdrawals.toFixed(2));
    console.log('D. CHARGE INVOICES:', totalPOs.toFixed(2));
    console.log('TOTAL REMITTANCE:', (depositsByType.vault_deposit + depositsByType.cash_register + totalWithdrawals).toFixed(2));
    
    console.log('\n=== SIR MARK EXPECTED ===');
    console.log('A. TOTAL CASH DEPOSIT: 2,620.00');
    console.log('B. TOTAL CASH REGISTER: 13.00');
    console.log('C. TOTAL CASH OUT: 2,000.00');
    console.log('D. CHARGE INVOICES: 1,500.00');
    console.log('TOTAL REMITTANCE: 4,633.00');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkShift3Data();
