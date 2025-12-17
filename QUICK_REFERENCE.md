# Expenses Management - Quick Reference Card

## 🚀 Quick Start (3 Steps)

1. **Create Expense Types** → Define your expense categories
2. **Create Expense Entry** → Record expenses with tax
3. **Submit** → Auto-create Journal Entry

---

## 📋 Doctypes Overview

| DocType | Type | Purpose |
|---------|------|---------|
| **Expense Type** | Master | Define expense categories with accounts |
| **Expense Entry** | Transaction | Record expenses (submittable) |
| **Expense Entry Item** | Child Table | Multiple items per entry |

---

## 🔧 Key Fields

### Expense Type
```
├─ Expense Type Name (unique)
├─ Expense Account (link to Account)
└─ Default Tax Template (optional)
```

### Expense Entry
```
Header:
├─ Posting Date
├─ Company
├─ Cost Center (optional)
├─ Mode of Payment
└─ Bank Account

Items Table (can add multiple):
├─ Expense Type
├─ Amount (includes tax)
├─ Taxable (checkbox)
├─ Tax Template
├─ Tax Amount (auto-calculated)
└─ Amount Before Tax (auto-calculated)

Totals:
├─ Total Amount
├─ Total Tax Amount
└─ Total Amount Before Tax
```

---

## 💰 Tax Calculation

**Formula:** Amount INCLUDES tax (reverse calculation)

```
Input: $115 with 15% tax

Calculation:
Amount Before Tax = $115 ÷ 1.15 = $100.00
Tax Amount        = $115 - $100  = $15.00
```

**Common Tax Rates:**
- 5%:  Divisor = 1.05
- 10%: Divisor = 1.10
- 15%: Divisor = 1.15
- 20%: Divisor = 1.20

---

## 📊 Journal Entry Structure

```
On Submit:
┌─────────────────────────────────────────┐
│ JOURNAL ENTRY (auto-created)            │
├─────────────────────────────────────────┤
│ Credit: Bank Account      → Total Amt   │
│ Debit:  Expense Account   → Amt w/o Tax │
│ Debit:  Tax Account       → Tax Amt     │
└─────────────────────────────────────────┘
```

**Example:**
```
Credit: Main Bank          $115.00
Debit:  Travel Expenses    $100.00
Debit:  Input Tax          $15.00
```

---

## 📈 Expense Report Filters

| Filter | Required | Purpose |
|--------|----------|---------|
| Company | Yes | Filter by company |
| From Date | Yes | Start date |
| To Date | Yes | End date |
| Expense Type | No | Specific category |
| Expense Account | No | Specific GL account |
| Cost Center | No | Department/division |
| Mode of Payment | No | Payment method |

---

## ✅ Common Workflows

### Single Expense
```
1. New Expense Entry
2. Fill header (date, company, bank)
3. Add one expense item
4. Enter amount (incl. tax)
5. Check "Taxable"
6. Submit
```

### Multiple Expenses (One Entry)
```
1. New Expense Entry
2. Fill header once
3. Add multiple rows:
   ├─ Travel: $115 (taxable)
   ├─ Meals: $50 (non-taxable)
   └─ Supplies: $92 (taxable)
4. Submit (creates one JE)
```

### View & Export Report
```
1. Open Expense Report
2. Set date range
3. Apply filters
4. Refresh
5. Export (PDF/Excel/CSV)
```

---

## 🎯 Auto-Fill Features

| When You... | System Auto-fills... |
|-------------|---------------------|
| Select Expense Type | → Expense Account |
| Select Expense Type | → Tax Template (if set) |
| Select Bank Account | → Paid From Account |
| Enter Amount + Tax Template | → Tax Amount |
| Enter Amount + Tax Template | → Amount Before Tax |
| Add/Update Items | → All Totals |

---

## 🔐 Permissions

| Role | Create | Edit | Submit | Cancel | Delete | Amend |
|------|--------|------|--------|--------|--------|-------|
| Accounts Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Accounts User | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## ⚡ Keyboard Shortcuts (in form)

- `Ctrl + S` - Save
- `Ctrl + G` - Add row to child table
- `Ctrl + Enter` - Submit (when allowed)

---

## 🔍 Finding Things

| Need to find... | Go to... |
|----------------|----------|
| Module | Awesome Bar → "Expenses Management" |
| New Expense | Awesome Bar → "Expense Entry" |
| Expense Types | Awesome Bar → "Expense Type" |
| Reports | Awesome Bar → "Expense Report" |
| Workspace | Sidebar → Expenses Management |

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| Can't submit | Check: Bank account selected |
| Tax not calculating | Check: Taxable ✓, Tax Template set |
| JE not created | Check: Submit button clicked |
| Wrong account | Check: Expense Type setup |

---

## 💡 Pro Tips

✨ **Group Related Expenses** - Use one entry for related expenses (same date/bank)

✨ **Cost Center Tracking** - Always assign cost centers for better reporting

✨ **Consistent Naming** - Use clear expense type names (e.g., "Travel - Domestic" vs "Travel - International")

✨ **Monthly Reviews** - Run expense reports at month-end

✨ **Remarks Field** - Use for additional context (vendor, purpose, etc.)

---

## 📞 Need Help?

1. Check [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions
2. Check [README.md](README.md) for technical details
3. Contact system administrator

---

**Version:** 1.0
**Module:** Expenses Management
**License:** MIT
