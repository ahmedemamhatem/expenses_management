# Expenses Management - Setup & Usage Guide

## Quick Start

The **Expenses Management** app has been successfully installed and is ready to use!

## Access the Module

1. Open your ERPNext/Frappe instance
2. Look for **"Expenses Management"** in the module list (sidebar or Awesome Bar)
3. Click to access the workspace

## Step-by-Step Setup

### Step 1: Create Tax Templates (Prerequisites)

Before creating expenses, you need tax templates:

1. Go to **Accounts > Purchase Taxes and Charges Template**
2. Create a new template (e.g., "VAT 15%")
3. Add tax rows with account head and rate
   - Example: Tax Account = "Input Tax", Rate = 15%

### Step 2: Create Expense Types

1. Navigate to: **Expenses Management > Expense Type** (or search "Expense Type")
2. Click **New**
3. Fill in:
   - **Expense Type Name**: e.g., "Travel Expense", "Office Supplies", "Utilities"
   - **Expense Account**: Select from Chart of Accounts (e.g., "Travel Expenses - Company")
   - **Default Tax Template**: (Optional) Select the tax template to apply by default

4. **Save**

Example Expense Types to create:
- Travel Expense → Travel Expenses Account
- Office Supplies → Office Expenses Account
- Utilities → Utilities Account
- Rent → Rent Account
- Meals & Entertainment → Entertainment Account

### Step 3: Create Expense Entry

1. Navigate to: **Expenses Management > Expense Entry**
2. Click **New**
3. Fill in header information:
   - **Posting Date**: Date of expense
   - **Company**: Select your company
   - **Cost Center**: (Optional) Select cost center for reporting
   - **Mode of Payment**: Select payment method (Cash, Bank Transfer, etc.)
   - **Bank Account**: Select the bank account used for payment

4. Add Expense Items:
   - Click **Add Row** in Expense Items table
   - **Expense Type**: Select from dropdown (auto-fills expense account and tax template)
   - **Amount**: Enter total amount **including tax**
   - **Taxable**: Check if this expense is subject to tax
   - **Tax Template**: Auto-filled or select different template
   - System automatically calculates:
     - **Tax Amount**: Extracted tax from total
     - **Amount Before Tax**: Net amount

5. Add multiple expense items as needed
6. Review totals:
   - Total Amount (Incl. Tax)
   - Total Tax Amount
   - Total Amount Before Tax

7. **Save** the document
8. **Submit** to create Journal Entry

### Step 4: Review Journal Entry

After submission:
1. A Journal Entry is automatically created and submitted
2. Click the **Journal Entry** link in the document
3. Review accounting entries:
   - Credit: Payment account (bank/cash)
   - Debit: Expense accounts (grouped)
   - Debit: Tax accounts (distributed)

## Example Workflow

### Scenario: Office Supplies Purchase with Tax

**Purchase Details:**
- Bought office supplies for $230 (including 15% VAT)
- Paid from Main Bank Account
- Should be charged to Marketing Cost Center

**Steps:**

1. Create Expense Entry:
   - Posting Date: Today
   - Company: Your Company
   - Cost Center: Marketing
   - Bank Account: Main Bank - Company

2. Add Expense Item:
   - Expense Type: Office Supplies
   - Amount: 230.00
   - Taxable: ✓ (checked)
   - Tax Template: VAT 15%

3. System calculates:
   - Amount Before Tax: 230 / 1.15 = 200.00
   - Tax Amount: 230 - 200 = 30.00

4. Submit

5. Journal Entry created:
   ```
   Debit:  Office Expenses - 200.00
   Debit:  Input Tax - 30.00
   Credit: Main Bank - 230.00
   ```

## Multiple Expense Items Example

**Scenario:** Combined expense entry for multiple items

1. **Travel - Taxable:**
   - Amount: 115.00 (incl. 15% tax)
   - Calculated: 100.00 base + 15.00 tax

2. **Meals - Non-taxable:**
   - Amount: 50.00
   - Taxable: ✗ (unchecked)
   - Calculated: 50.00 base, 0 tax

3. **Office Supplies - Taxable:**
   - Amount: 92.00 (incl. 15% tax)
   - Calculated: 80.00 base + 12.00 tax

**Totals:**
- Total Amount: 257.00
- Total Tax: 27.00
- Total Before Tax: 230.00

**Journal Entry:**
```
Debit:  Travel Expenses - 100.00
Debit:  Meals Account - 50.00
Debit:  Office Expenses - 80.00
Debit:  Input Tax - 27.00
Credit: Bank Account - 257.00
```

## Viewing Reports

### Expense Report

1. Navigate to: **Expenses Management > Expense Report**
2. Set filters:
   - **Company**: (Required) Select company
   - **From Date**: Start date
   - **To Date**: End date
   - **Expense Type**: (Optional) Filter by specific type
   - **Expense Account**: (Optional) Filter by account
   - **Cost Center**: (Optional) Filter by cost center
   - **Mode of Payment**: (Optional) Filter by payment method

3. Click **Refresh**
4. Report shows all submitted expense entries with:
   - Date, Expense Entry reference
   - Company, Expense Type, Account
   - Cost Center, Payment details
   - Amounts (before tax, tax, total)
   - Linked Journal Entry

5. Export options: PDF, Excel, CSV

## Amending Expenses

If you need to modify a submitted expense:

1. Open the submitted Expense Entry
2. Click **Amend**
3. Make necessary changes
4. **Submit**
5. Old Journal Entry is cancelled
6. New Journal Entry is created

## Cancelling Expenses

To cancel an expense:

1. Open the submitted Expense Entry
2. Click **Cancel**
3. Linked Journal Entry is automatically cancelled
4. Accounting entries are reversed

## Tips & Best Practices

1. **Organize Expense Types**: Create specific expense types for better reporting
2. **Use Cost Centers**: Assign cost centers for departmental expense tracking
3. **Tax Templates**: Set up tax templates for different tax scenarios
4. **Batch Entries**: Use multiple expense items in one entry for related expenses
5. **Remarks**: Add remarks for future reference
6. **Regular Reports**: Run expense reports monthly/quarterly for analysis

## Troubleshooting

### Error: "Please select a Bank Account"
- **Solution**: You must select a bank account to set the paid from account

### Tax not calculating
- **Check**:
  1. "Taxable" checkbox is checked
  2. Tax template is selected
  3. Tax template has valid rates

### Journal Entry not created
- **Check**:
  1. Bank account is selected
  2. All required fields are filled
  3. User has permissions to create Journal Entries

## Permissions

**Accounts Manager Role:**
- Full access to all features
- Can create, edit, delete, submit, cancel, amend

**Accounts User Role:**
- Can create and submit expense entries
- Cannot delete or cancel

## Technical Notes

### Tax Calculation Formula

Since amount **includes** tax (reverse calculation):

```
Given:
  Total Amount = A (includes tax)
  Tax Rate = R%

Calculate:
  Amount Before Tax = A / (1 + R/100)
  Tax Amount = A - Amount Before Tax
```

Example:
```
Total = 115.00
Rate = 15%
Before Tax = 115 / 1.15 = 100.00
Tax = 115 - 100 = 15.00
```

### Journal Entry Logic

1. Group all expense items by expense account
2. Sum amounts before tax for each account
3. Group all tax items by tax account (from tax template)
4. Distribute tax proportionally across tax accounts
5. Create single Journal Entry with:
   - One credit line for payment account (total)
   - Multiple debit lines for expense accounts
   - Multiple debit lines for tax accounts

## Support

For issues or questions:
- Check the main README.md
- Review Frappe/ERPNext documentation
- Contact your system administrator

## Next Steps

1. ✅ Create your expense types
2. ✅ Set up tax templates
3. ✅ Create your first expense entry
4. ✅ Review the generated journal entry
5. ✅ Run your first expense report
6. ✅ Integrate into your accounting workflow
