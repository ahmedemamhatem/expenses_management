# Expenses Management App

A custom Frappe/ERPNext application for managing company expenses with automatic tax calculations and journal entry creation.

## Features

- **Expense Type Master**: Define different types of expenses with linked expense accounts and default tax templates
- **Multi-item Expense Entry**: Add multiple expense types in a single expense entry document
- **Flexible Payment Options**: Select mode of payment or bank account for expenses
- **Tax Calculation**: Automatic tax calculation based on tax templates (amount includes taxes)
- **Automatic Journal Entry**: Creates journal entries automatically on submit with proper accounting entries
- **Cost Center Assignment**: Assign expenses to specific cost centers
- **Workspace**: Dedicated workspace with shortcuts and organized access
- **Expense Report**: Comprehensive report with filtering options

## Installation

The app has already been installed in your site. To install in another site:

```bash
bench --site <site-name> install-app expenses_management
```

## Usage

### 1. Create Expense Types

Navigate to: **Expenses Management > Expense Type**

Create expense types with:
- **Expense Type Name**: Name of the expense (e.g., "Travel", "Office Supplies")
- **Expense Account**: Link to the general ledger expense account
- **Default Tax Template**: Optional default tax template for this expense type

### 2. Create Expense Entries

Navigate to: **Expenses Management > Expense Entry**

Fill in the following:
- **Posting Date**: Date of the expense
- **Company**: Select your company
- **Cost Center**: Optional cost center assignment
- **Mode of Payment**: Select payment method
- **Bank Account**: Select bank account (auto-fills Paid From Account)

#### Adding Expense Items:
In the **Expense Items** table:
1. Select **Expense Type** (auto-fills expense account and tax template)
2. Enter **Amount** (including tax)
3. Check **Taxable** if the expense is subject to tax
4. Select **Tax Template** if different from default
5. System automatically calculates:
   - Tax Amount
   - Amount Before Tax

Add multiple expense items as needed.

### 3. Submit to Create Journal Entry

When you submit the Expense Entry:
- A Journal Entry is automatically created with:
  - **Credit Entry**: Payment from bank/cash account (total amount)
  - **Debit Entries**:
    - Expense accounts (amounts before tax, grouped by account)
    - Tax accounts (tax amounts, distributed according to tax template)
- The Journal Entry is automatically submitted
- Link to Journal Entry is stored in the Expense Entry

### 4. View Expense Reports

Navigate to: **Expenses Management > Expense Report**

Filter expenses by:
- Company (required)
- Date Range (from/to dates)
- Expense Type
- Expense Account
- Cost Center
- Mode of Payment

The report shows all submitted expense entries with detailed breakdown.

## Tax Calculation Logic

The system uses **reverse tax calculation** since amounts include tax:

**Example:**
- Amount entered: $115.00
- Tax rate: 15%
- Amount before tax: $115.00 / 1.15 = $100.00
- Tax amount: $115.00 - $100.00 = $15.00

## Journal Entry Structure

For an expense entry with:
- Total: $115.00
- Expense before tax: $100.00
- Tax: $15.00

**Journal Entry:**
```
Credit: Bank Account           $115.00
Debit:  Expense Account        $100.00
Debit:  Tax Account            $15.00
```

## Permissions

Two roles have access:
- **Accounts Manager**: Full access (create, edit, delete, submit, cancel, amend)
- **Accounts User**: Create, edit, submit (no delete/cancel/amend)

## Technical Details

### DocTypes Created:
1. **Expense Type**: Master for expense categories
2. **Expense Entry**: Main document for recording expenses
3. **Expense Entry Item**: Child table for multiple expense items

### Key Files:
- expense_type.py
- expense_entry.py
- expense_entry_item.py
- expense_report.py

### Client-Side Features:
- Auto-fetch expense account from Expense Type
- Auto-fetch tax template from Expense Type
- Real-time tax calculation
- Running totals display
- Filter bank accounts and cost centers by company

### Server-Side Features:
- Validate and calculate taxes on save
- Create and link Journal Entry on submit
- Cancel linked Journal Entry on cancel
- Group expenses by account in Journal Entry

## License

MIT# expenses_management
