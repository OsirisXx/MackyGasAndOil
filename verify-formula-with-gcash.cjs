const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function verifyFormula() {
  try {
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('name', 'Balingasag')
      .single();
    
    const branchId = branches.id;
    
    // Query for shift 3 on May 1, 2026
    const { data: deposits } = await supabase
      .from('cash_deposits')
      .select('amount, deposit_type')
      .eq('shift_date', '2026-05-01')
      .eq('shift_number', 3)
      .eq('branch_id', branchId)
      .is('deleted_at', null);
    
    const { data: withdrawals } = await supabase
      .from('cash_withdrawals')
      .select('amount')
      .eq('shift_date', '2026-05-01')
      .eq('shift_number', 3)
      .eq('branch_id', branchId);
    
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('amount')
      .eq('shift_date', '2026-05-01')
      .eq('shift_number', 3)
      .eq('branch_id', branchId);
    
    // Calculate totals
    const depositsByType = { vault_deposit: 0, cash_register: 0, gcash: 0 };
    deposits?.forEach(d => {
      const type = d.deposit_type || 'vault_deposit';
      depositsByType[type] = (depositsByType[type] || 0) + parseFloat(d.amount || 0);
    });
    
    const totalCashDeposit = depositsByType.vault_deposit;
    const totalGcash = depositsByType.gcash;
    const totalCashRegister = depositsByType.cash_register;
    const totalWithdrawals = withdrawals?.reduce((s, w) => s + parseFloat(w.amount || 0), 0) || 0;
    const totalChargeInvoices = pos?.reduce((s, p) => s + parseFloat(p.amount || 0), 0) || 0;
    
    // NEW FORMULA (with GCash included)
    const totalRemittance = totalCashDeposit + totalGcash + totalCashRegister + totalWithdrawals;
    
    // Assume totalAccountability from Sir Mark's Excel
    const totalAccountability = 6132.44;
    
    const shortOver = (totalRemittance + totalChargeInvoices) - totalAccountability;
    
    console.log('=== SYSTEM CALCULATION (NEW FORMULA WITH GCASH) ===');
    console.log('vault_deposit:', totalCashDeposit.toFixed(2));
    console.log('GCash:', totalGcash.toFixed(2));
    console.log('A. TOTAL CASH DEPOSIT (vault + GCash):', (totalCashDeposit + totalGcash).toFixed(2));
    console.log('B. TOTAL CASH REGISTER:', totalCashRegister.toFixed(2));
    console.log('C. TOTAL CASH OUT:', totalWithdrawals.toFixed(2));
    console.log('D. CHARGE INVOICES:', totalChargeInvoices.toFixed(2));
    console.log('TOTAL REMITTANCE:', totalRemittance.toFixed(2));
    console.log('TOTAL ACCOUNTABILITY:', totalAccountability.toFixed(2));
    console.log('SHORT/OVER:', shortOver.toFixed(2));
    
    console.log('\n=== SIR MARK EXPECTED ===');
    console.log('A. TOTAL CASH DEPOSIT: 2,620.00');
    console.log('B. TOTAL CASH REGISTER: 13.00');
    console.log('C. TOTAL CASH OUT: 2,000.00');
    console.log('D. CHARGE INVOICES: 1,500.00');
    console.log('TOTAL REMITTANCE: 4,633.00');
    console.log('TOTAL ACCOUNTABILITY: 6,132.44');
    console.log('SHORT/OVER: 0.56');
    
    console.log('\n=== COMPARISON ===');
    console.log('Cash Deposit:', (totalCashDeposit + totalGcash) === 2620 ? '✓ MATCH' : '✗ MISMATCH');
    console.log('Cash Register:', totalCashRegister === 13 ? '✓ MATCH' : '✗ MISMATCH');
    console.log('Cash Out:', totalWithdrawals === 2000 ? '✓ MATCH' : '✗ MISMATCH');
    console.log('Charge Invoices:', totalChargeInvoices === 1500 ? '✓ MATCH' : '✗ MISMATCH');
    console.log('Total Remittance:', totalRemittance === 4633 ? '✓ MATCH' : '✗ MISMATCH');
    console.log('Short/Over:', Math.abs(shortOver - 0.56) < 0.01 ? '✓ MATCH' : '✗ MISMATCH');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyFormula();
