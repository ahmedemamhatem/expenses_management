# Testing the Real-Time Sales Invoice Dashboard

## Quick Start

The dashboard is now live at: `/app/sales-invoice-realtime`

However, it requires **submitted Sales Invoices** to display data.

## Creating Test Data

### Option 1: Create a Sales Invoice via UI

1. Go to **Selling → Sales Invoice → New**
2. Fill in the required fields:
   - Customer: Select or create a customer
   - Items: Add at least one item with quantity and rate
   - Posting Date: Today's date
3. **Submit** the invoice (Status must be "Submitted")
4. Navigate to `/app/sales-invoice-realtime`
5. You should see the invoice appear in a spectacular popup!

### Option 2: Create via Console (Quick Test)

Open the Frappe console and run:

```bash
bench --site mh.localhost console
```

Then paste this code:

```python
import frappe
from frappe.utils import nowdate, nowtime

# Create a test customer if doesn't exist
if not frappe.db.exists("Customer", "Test Customer Ltd."):
    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": "Test Customer Ltd.",
        "customer_type": "Company",
        "customer_group": "Commercial",
        "territory": "All Territories"
    })
    customer.insert(ignore_permissions=True)

# Create a test Sales Invoice
invoice = frappe.get_doc({
    "doctype": "Sales Invoice",
    "customer": "Test Customer Ltd.",
    "posting_date": nowdate(),
    "posting_time": nowtime(),
    "items": [{
        "item_code": "Sample Item",  # Use an existing item or create one
        "item_name": "Test Product",
        "qty": 2,
        "rate": 1000,
        "amount": 2000
    }],
    "taxes_and_charges": "",
    "total": 2000,
    "grand_total": 2000
})

invoice.insert(ignore_permissions=True)
invoice.submit()

print(f"Created and submitted: {invoice.name}")
```

### Option 3: Create Multiple Test Invoices

```python
import frappe
from frappe.utils import nowdate, add_days, nowtime
import random

customers = ["ABC Corp", "XYZ Ltd", "Tech Solutions", "Global Trading"]
items = ["Laptop", "Monitor", "Keyboard", "Mouse", "Headphones"]

for i in range(10):
    customer_name = random.choice(customers)

    # Create customer if doesn't exist
    if not frappe.db.exists("Customer", customer_name):
        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "customer_type": "Company",
            "customer_group": "Commercial",
            "territory": "All Territories"
        })
        customer.insert(ignore_permissions=True)

    # Create invoice
    invoice = frappe.get_doc({
        "doctype": "Sales Invoice",
        "customer": customer_name,
        "posting_date": add_days(nowdate(), -i),
        "posting_time": nowtime(),
        "items": [{
            "item_code": "Sample Item",
            "item_name": random.choice(items),
            "qty": random.randint(1, 5),
            "rate": random.randint(500, 5000),
        }]
    })

    invoice.set_missing_values()
    invoice.insert(ignore_permissions=True)
    invoice.submit()

    print(f"Created: {invoice.name} - {invoice.grand_total}")

frappe.db.commit()
print("\n✅ Created 10 test invoices!")
```

## What You Should See

### With Data:
1. **Animated gradient background** (purple, blue, pink, cyan shifting)
2. **Large popup card** in center with:
   - Rainbow glowing border
   - Customer information in pink gradient section
   - Complete items table
   - 4 colorful financial cards (green, orange, red, purple)
   - Customer history cards (purple & pink)
   - 10-minute countdown timer
3. **Invoice list** at bottom (30% height) with recent invoices

### Without Data (Empty State):
- Message indicating no invoices found
- Still shows the beautiful animated background

## Dashboard Features

### Real-Time Updates
- Polls every 5 seconds for new invoices
- New invoice automatically appears in popup
- Popup stays for 10 minutes then disappears

### Interactive
- Click any invoice card in the bottom list to view it in popup
- Hover effects on all cards
- Smooth animations throughout

### Full-Screen Experience
- No Frappe header/sidebar
- Pure immersive dashboard view
- Perfect for large display screens

## Troubleshooting

### "Empty" or No Data Showing
**Cause**: No submitted Sales Invoices in the system

**Solution**: Create at least one submitted Sales Invoice (see options above)

### Dashboard Not Loading
**Cause**: JavaScript not loaded or cache issue

**Solution**:
```bash
bench --site mh.localhost clear-cache
bench build --app expenses_management
```

Then hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

### Styles Not Applying
**Cause**: CSS not injected

**Solution**: The styles are injected via JavaScript. Check browser console for errors.

## Accessing the Dashboard

**Direct URL**: `http://your-domain/app/sales-invoice-realtime`

**Roles Required**:
- System Manager
- Sales Manager
- CEO

Make sure your user has one of these roles assigned.

## Pro Tips

1. **Best Viewed**: Full screen on large monitors (1920x1080 or higher)
2. **Create Data**: Have at least 5-10 invoices for the best visual experience
3. **Watch Live**: Submit a new invoice while viewing the dashboard to see the real-time popup!
4. **Color Scheme**: Each financial metric has its own unique gradient color
5. **Timer**: Watch the countdown timer in the top-right of the popup (10:00 → 0:00)

## Next Steps

Once you have test data:
1. Visit `/app/sales-invoice-realtime`
2. Watch the spectacular popup appear with your latest invoice
3. Hover over the financial cards to see lift animations
4. Click invoice cards in the bottom list to switch views
5. Wait 10 minutes to see the popup automatically disappear

Enjoy your stunning real-time dashboard! 🎉✨
