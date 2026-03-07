# Testing Guide: Accountability Report Validation

This guide will help you test if the pump-centric system produces accurate accountability reports matching your client's sample.

---

## Prerequisites

1. ✅ Run the database cleanup script (`00_CLEAN_AND_SETUP.sql`)
2. ✅ Configure pumps in Pump Management
3. ✅ Have your client's sample accountability report ready

---

## Step 1: Set Up Test Pumps

Go to **Admin → Pump Management** and create pumps matching your actual setup.

### Example Setup (Manolo Branch):

```
Premium Pumps:
- Pump 1, Premium Regular, Category: Regular, Price: ₱67.35/L
- Pump 2, Premium Regular, Category: Regular, Price: ₱67.35/L

Diesel Pumps:
- Pump 1, Diesel Regular, Category: Regular, Price: ₱64.50/L
- Pump 2, Diesel Discounted, Category: Discounted, Price: ₱63.50/L
- Pump 3, Diesel Regular, Category: Regular, Price: ₱64.50/L

Unleaded Pumps:
- Pump 1, Unleaded Regular, Category: Regular, Price: ₱62.00/L
```

---

## Step 2: Record Shift Readings (Via POS)

### **Login as Cashier**
1. Go to `http://localhost:5174/pos`
2. Login with cashier credentials
3. Click **"Pump Readings"** button (top right)

### **Record Beginning Readings (Shift 1 Start)**

For each pump, enter the **beginning reading** from your sample report:

```
Example from Sample Report:
Premium 1: Beginning 5000.000 L
Premium 2: Beginning 4800.000 L
Diesel 1: Beginning 10000.000 L
Diesel 2: Beginning 8500.000 L
Diesel 3: Beginning 9200.000 L
Unleaded 1: Beginning 3000.000 L
```

Click **"Start Shift"** for each pump.

### **Record Sales Throughout the Shift**

Use the POS to record actual sales:

1. Select pump (e.g., "Premium 1")
2. Enter liters or amount
3. Record sale

**Important:** Each sale is automatically linked to the selected pump.

### **Record Ending Readings (Shift 1 End)**

At shift end, click **"Pump Readings"** again and enter **ending readings**:

```
Example from Sample Report:
Premium 1: Ending 5450.000 L (450 L dispensed)
Premium 2: Ending 5200.000 L (400 L dispensed)
Diesel 1: Ending 10800.000 L (800 L dispensed)
Diesel 2: Ending 9000.000 L (500 L dispensed)
Diesel 3: Ending 9900.000 L (700 L dispensed)
Unleaded 1: Ending 3300.000 L (300 L dispensed)
```

Click **"Close Shift"** for each pump.

---

## Step 3: Verify Accountability Report

Go to **Admin → Accountability Report**

### **What to Check:**

#### **1. Pump Grouping by Fuel Type + Category**

The report should group pumps like this:

```
Premium Regular:
  - Pump 1: 450.000 L @ ₱67.35/L = ₱30,307.50
  - Pump 2: 400.000 L @ ₱67.35/L = ₱26,940.00
  Subtotal: 850 L = ₱57,247.50

Diesel Regular:
  - Pump 1: 800.000 L @ ₱64.50/L = ₱51,600.00
  - Pump 3: 700.000 L @ ₱64.50/L = ₱45,150.00
  Subtotal: 1500 L = ₱96,750.00

Diesel Discounted:
  - Pump 2: 500.000 L @ ₱63.50/L = ₱31,750.00
  Subtotal: 500 L = ₱31,750.00

Unleaded Regular:
  - Pump 1: 300.000 L @ ₱62.00/L = ₱18,600.00
  Subtotal: 300 L = ₱18,600.00

GRAND TOTAL: 3,150 L = ₱204,347.50
```

#### **2. Compare with Client's Sample Report**

Match these values:
- ✅ **Total liters per pump** (beginning → ending)
- ✅ **Total liters per fuel type + category**
- ✅ **Total amount per fuel type + category**
- ✅ **Grand total liters**
- ✅ **Grand total amount**

#### **3. Verify Sales Match Pump Readings**

Check that:
- Total sales recorded in POS = Total liters dispensed from pump readings
- Each pump's sales are tracked separately
- Regular vs Discounted pumps are separated

---

## Step 4: Test Edge Cases

### **Test 1: Multiple Shifts**
1. Close Shift 1 for all pumps
2. Start Shift 2 - verify beginning readings auto-populate from Shift 1 ending
3. Record sales and close Shift 2
4. Check accountability report shows both shifts combined

### **Test 2: Pump Adjustments**
1. Record a 10L calibration test via **Pump Adjustments** page
2. Enter adjustment reason: "Calibration test"
3. Verify accountability report subtracts adjustment from total sales

### **Test 3: Mixed Regular/Discounted Sales**
1. Record sales on Diesel Regular pumps (P1, P3)
2. Record sales on Diesel Discounted pump (P2)
3. Verify they appear in separate sections of accountability report

---

## Step 5: Export and Compare

### **Generate Report**
1. Select date range in Accountability Report
2. Click **"Export to Excel"** (if available) or take screenshot
3. Compare side-by-side with client's sample

### **What Should Match:**
- ✅ Pump numbers and names
- ✅ Fuel type groupings
- ✅ Category separation (Regular vs Discounted)
- ✅ Liters dispensed per pump
- ✅ Price per liter
- ✅ Total amount per category
- ✅ Grand totals

---

## Common Issues & Solutions

### **Issue: Totals Don't Match**
**Check:**
- Did you record all sales via POS?
- Are pump readings accurate (beginning vs ending)?
- Did you account for adjustments (calibration tests)?

### **Issue: Pumps Not Grouped Correctly**
**Check:**
- Are fuel types spelled exactly the same? (Premium, Diesel, Unleaded)
- Are categories set correctly? (Regular vs Discounted)
- Did you use the dropdown for fuel type (not free text)?

### **Issue: Missing Pumps in Report**
**Check:**
- Are pumps marked as `is_active = true`?
- Did you record readings for those pumps?
- Is the date range correct?

---

## Sample Test Data Script

If you want to quickly populate test data, use this SQL:

```sql
-- Insert sample shift readings for testing
-- (Replace pump_ids with actual IDs from your pumps table)

INSERT INTO shift_pump_readings (
  branch_id, shift_date, shift_number, pump_id, cashier_id,
  beginning_reading, ending_reading, price_per_liter, status, closed_at
) VALUES
  -- Premium Pump 1
  ('your-branch-id', '2026-02-27', 1, 'premium-pump-1-id', 'cashier-id', 5000.000, 5450.000, 67.35, 'closed', NOW()),
  -- Premium Pump 2
  ('your-branch-id', '2026-02-27', 1, 'premium-pump-2-id', 'cashier-id', 4800.000, 5200.000, 67.35, 'closed', NOW()),
  -- Diesel Pump 1 (Regular)
  ('your-branch-id', '2026-02-27', 1, 'diesel-pump-1-id', 'cashier-id', 10000.000, 10800.000, 64.50, 'closed', NOW()),
  -- Diesel Pump 2 (Discounted)
  ('your-branch-id', '2026-02-27', 1, 'diesel-pump-2-id', 'cashier-id', 8500.000, 9000.000, 63.50, 'closed', NOW()),
  -- Diesel Pump 3 (Regular)
  ('your-branch-id', '2026-02-27', 1, 'diesel-pump-3-id', 'cashier-id', 9200.000, 9900.000, 64.50, 'closed', NOW()),
  -- Unleaded Pump 1
  ('your-branch-id', '2026-02-27', 1, 'unleaded-pump-1-id', 'cashier-id', 3000.000, 3300.000, 62.00, 'closed', NOW());
```

---

## Expected Accountability Report Output

```
=== ACCOUNTABILITY REPORT ===
Branch: Manolo
Date: February 27, 2026
Shift: 1

PREMIUM REGULAR
  Pump 1 - Premium Regular
    Beginning: 5,000.000 L
    Ending: 5,450.000 L
    Dispensed: 450.000 L
    Price: ₱67.35/L
    Amount: ₱30,307.50

  Pump 2 - Premium Regular
    Beginning: 4,800.000 L
    Ending: 5,200.000 L
    Dispensed: 400.000 L
    Price: ₱67.35/L
    Amount: ₱26,940.00

  SUBTOTAL: 850.000 L = ₱57,247.50

DIESEL REGULAR
  Pump 1 - Diesel Regular
    Dispensed: 800.000 L @ ₱64.50/L = ₱51,600.00

  Pump 3 - Diesel Regular
    Dispensed: 700.000 L @ ₱64.50/L = ₱45,150.00

  SUBTOTAL: 1,500.000 L = ₱96,750.00

DIESEL DISCOUNTED
  Pump 2 - Diesel Discounted
    Dispensed: 500.000 L @ ₱63.50/L = ₱31,750.00

  SUBTOTAL: 500.000 L = ₱31,750.00

UNLEADED REGULAR
  Pump 1 - Unleaded Regular
    Dispensed: 300.000 L @ ₱62.00/L = ₱18,600.00

  SUBTOTAL: 300.000 L = ₱18,600.00

=================================
GRAND TOTAL: 3,150.000 L
TOTAL AMOUNT: ₱204,347.50
=================================
```

---

## Next Steps

1. **Share client's sample report** - I can help verify if the system output matches
2. **Test with real data** - Use actual pump readings from one shift
3. **Validate calculations** - Ensure liters × price = amount for each pump
4. **Check grouping logic** - Verify Regular vs Discounted separation works

**If numbers don't match, provide:**
- Screenshot of your accountability report
- Client's sample report
- I'll help debug the discrepancies
