# Pump-Centric System Implementation Guide

## Overview
This document tracks the implementation of the pump-centric system that replaces the fuel-type-centric approach.

---

## ✅ COMPLETED COMPONENTS

### 1. Database Schema (`10_pump_management.sql`)
**Status:** ✅ Complete

**New Tables:**
- `pumps` - Branch-specific pump configuration
  - Custom pump names, fuel types, prices per pump
  - Links to tanks for reconciliation
  - Unique pump numbers per branch

- `shift_pump_readings` - Individual pump tracking per shift
  - Replaces `shift_fuel_readings` (fuel type grouping)
  - Tracks beginning/ending readings per pump
  - Automatic shift handover support
  - Adjustment tracking per pump

- `fuel_sales` - Records which pump dispensed each sale
  - Links sales to specific pumps
  - Enables detailed pump-level reporting

**Helper Functions:**
- `get_previous_shift_readings()` - Retrieves previous shift data for handover
- `create_shift_readings_with_handover()` - Auto-initializes shift with previous readings

---

### 2. Pump Management Store (`src/stores/pumpStore.js`)
**Status:** ✅ Complete

**Features:**
- Full CRUD operations for pumps
- Shift reading management (start, update, close)
- Automatic handover logic
- Fuel sales recording
- Safety checks (prevent deletion of pumps with active shifts)

---

### 3. Admin Pump Management Page (`src/pages/PumpManagement.jsx`)
**Status:** ✅ Complete

**Features:**
- Add/edit/delete pumps with double verification
- Custom configuration per branch:
  - Pump number
  - Pump name (e.g., "Pump 1 - Diesel Regular")
  - Fuel type (custom text)
  - Price per liter (different per pump)
  - Tank linkage
- Delete confirmation requires typing pump number
- Prevents deletion of pumps with active shift readings

**Navigation:** Admin → Pump Management

---

### 4. POS Pump Readings Panel (`src/components/PumpReadingsPanel.jsx`)
**Status:** ✅ Complete

**Features:**
- Modal panel accessible from POS page
- Displays all pumps for current branch
- Shift handover detection and auto-fill
- Beginning/ending reading input
- Real-time dispensed/net sales calculation
- Start/close shift per pump
- Unlock/lock closed readings for corrections
- Shift summary (total dispensed, adjustments, net sales, value)

**Access:** POS → "Pump Readings" button in header

---

### 5. POS Page Integration
**Status:** ✅ Complete

**Changes:**
- Added "Pump Readings" button to header
- Integrated PumpReadingsPanel component
- Cashiers can now manage pump readings directly from POS

---

### 6. Navigation & Routing
**Status:** ✅ Complete

**Updates:**
- Added Pump Management to admin sidebar
- Configured routes in App.jsx
- Icon: Droplet (Lucide)

---

## 🔄 IN PROGRESS / PENDING

### 7. Update Shift Readings Page
**Status:** 🔄 Pending

**Required Changes:**
- Replace fuel type loop with pump loop
- Use `usePumpStore` instead of `useFuelStore`
- Display pump names instead of fuel type names
- Update queries to use `shift_pump_readings` table

**File:** `src/pages/ShiftReadings.jsx`

---

### 8. Update POS Sales Recording
**Status:** 🔄 Pending

**Required Changes:**
- Replace fuel type selector with pump selector
- Show pump names (e.g., "Pump 1 - Diesel Regular - ₱64.50/L")
- Record `pump_id` instead of `fuel_type_id` in sales
- Update price calculation to use pump's price

**File:** `src/pages/POS.jsx` (sales form section)

---

### 9. Update Pump Adjustments Page
**Status:** 🔄 Pending

**Required Changes:**
- Replace fuel type selector with pump selector
- Update adjustment recording to use `pump_id`
- Link adjustments to specific pump's shift reading

**File:** `src/pages/PumpAdjustments.jsx`

---

### 10. Update Fuel Reconciliation
**Status:** 🔄 Pending

**Required Changes:**
- Query `shift_pump_readings` instead of `shift_fuel_readings`
- Group pump readings by linked tank
- Show pump-level breakdown in variance analysis
- Enable drilling down to specific pump issues

**File:** `src/pages/FuelReconciliation.jsx`

---

### 11. Update Fuel Delivery
**Status:** 🔄 Pending

**Required Changes:**
- Ensure tank-pump linkage is respected
- Update reconciliation calculations to use pump data

**File:** `src/pages/FuelDelivery.jsx`

---

## 📋 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] Review and test SQL migration (`10_pump_management.sql`)
- [ ] Backup existing database
- [ ] Test in development environment first

### Deployment Steps
1. [ ] Run SQL migration in Supabase
2. [ ] Configure pumps for each branch via Admin → Pump Management
3. [ ] Test pump creation/editing/deletion
4. [ ] Test shift handover functionality
5. [ ] Test POS pump readings panel
6. [ ] Verify all calculations (dispensed, adjustments, net sales)

### Post-Deployment
- [ ] Train admin on pump configuration
- [ ] Train cashiers on new pump readings workflow
- [ ] Monitor for any issues in first few shifts
- [ ] Verify reconciliation accuracy

---

## 🔑 KEY CONCEPTS

### Shift Handover Flow
1. **Cashier A ends Shift 1** → Records ending readings for all pumps
2. **Cashier B starts Shift 2** → System detects previous shift
3. **Auto-fill option** → Cashier B can accept previous readings as beginning
4. **Verification** → Cashier B verifies against physical meters
5. **Correction** → Can manually adjust if discrepancy found (logged in audit)

### Pump vs Fuel Type
**OLD:** One reading per fuel type (all Diesel pumps combined)
**NEW:** One reading per pump (Pump 1, Pump 2, Pump 3 tracked separately)

**Benefit:** Can identify which specific pump has variance issues

---

## 🚨 BREAKING CHANGES

### Database
- Old `shift_fuel_readings` table will be replaced
- Old `pumps` table structure changed
- Existing shift reading data needs migration (if preserving history)

### Frontend
- All components using `fuel_type_id` need to use `pump_id`
- `useFuelStore` replaced with `usePumpStore` in many places
- Price lookups now per-pump instead of per-fuel-type

---

## 📞 SUPPORT

If issues arise:
1. Check Supabase logs for SQL errors
2. Verify RLS policies are active
3. Ensure pumps are configured for branch
4. Check audit log for data changes
5. Verify shift handover function is working

---

## 🎯 NEXT STEPS

Priority order for remaining work:
1. Update POS sales recording (critical for daily operations)
2. Update Pump Adjustments page
3. Update Shift Readings page (can use PumpReadingsPanel instead)
4. Update Fuel Reconciliation
5. Update Fuel Delivery linkage
6. Full system testing

---

**Last Updated:** Feb 27, 2026
**Status:** ~60% Complete
