# Real-Time Sales Invoice Dashboard

A sophisticated real-time dashboard designed for CEOs to monitor sales invoices as they're submitted, featuring advanced popup cards and comprehensive invoice details.

## Features

### 🎯 Real-Time Monitoring
- **Auto-polling**: Checks for new invoices every 5 seconds
- **Instant Notifications**: New invoice appears in popup immediately upon submission
- **10-Minute Display**: Each popup remains visible for 10 minutes or until replaced by newer invoice
- **Full-Screen Experience**: Designed for large screens with no clutter

### 💳 Popup Card Display

Each invoice popup shows:
- **Customer Information**: Name, ID, and invoice date
- **Complete Item List**: Table with item names, quantities, rates, amounts, and discounts
- **Financial Summary**:
  - Subtotal (green gradient card)
  - Discount (yellow gradient card)
  - VAT/Tax (orange gradient card)
  - Grand Total (purple gradient card)
- **Customer History**:
  - Last invoice details (invoice number, date, amount)
  - Current customer balance after this invoice
- **Countdown Timer**: Shows remaining time (10:00 → 0:00) in top-right corner

### 📋 Invoice List

Below the popup, a scrollable list displays:
- All recent invoices (50 most recent)
- Sorted by submission time (newest first)
- Each card shows: invoice number, customer, date, time, and total
- Clickable cards - click any invoice to view in popup
- Grid layout for optimal space usage

### 🎨 Advanced Styling

- **Gradient Backgrounds**: Purple gradient full-screen background
- **Colored Cards**: Different gradients for each metric:
  - Customer section: Pink gradient (#f093fb → #f5576c)
  - Subtotal: Green gradient (#4ade80 → #22c55e)
  - Discount: Yellow gradient (#fbbf24 → #f59e0b)
  - Tax: Orange gradient (#fb923c → #f97316)
  - Grand Total: Blue gradient (#6366f1 → #4f46e5)
  - Last Invoice: Purple gradient (#a78bfa → #8b5cf6)
  - Balance: Pink gradient (#ec4899 → #db2777)
- **Smooth Animations**: Popup slides in with fade and scale effect
- **Modern UI**: Rounded corners, shadows, and backdrop blur effects
- **Responsive**: Optimized for large screens (up to 1200px popup width)

## Technical Implementation

### Files Structure

```
expenses_management/
└── expenses_management/
    └── page/
        └── sales_invoice_realtime/
            ├── __init__.py
            ├── sales_invoice_realtime.json    # Page configuration
            ├── sales_invoice_realtime.py      # Backend API
            └── sales_invoice_realtime.js      # Frontend dashboard
```

### Backend API

**File**: [sales_invoice_realtime.py](expenses_management/expenses_management/page/sales_invoice_realtime/sales_invoice_realtime.py)

Two main methods:

#### 1. get_realtime_invoice_data()
Returns the 50 most recent submitted sales invoices with complete details:
- Invoice basic info (name, customer, dates, totals)
- All invoice items with rates and discounts
- Customer's previous invoice (if any)
- Customer's current outstanding balance

#### 2. get_latest_invoice()
Returns only the most recent invoice for polling checks. Used to detect new submissions without loading all data.

### Frontend Dashboard

**File**: [sales_invoice_realtime.js](expenses_management/expenses_management/page/sales_invoice_realtime/sales_invoice_realtime.js)

**Class**: `SalesInvoiceRealtimeDashboard`

Key features:
- **Polling Mechanism**: `setInterval()` every 5 seconds to check for new invoices
- **Popup Management**: Shows/hides popup with animation
- **Timer System**: 10-minute countdown using `setInterval()`
- **List Rendering**: Dynamic grid of invoice cards
- **State Management**: Tracks current popup invoice and last checked invoice

### Polling Logic

```javascript
start_polling() {
    this.polling_interval = setInterval(async () => {
        const response = await frappe.call({
            method: '...get_latest_invoice'
        });

        if (response.message) {
            const latest = response.message;

            // Check if this is a new invoice
            if (this.last_checked_invoice !== latest.name) {
                this.show_popup(latest);
                this.last_checked_invoice = latest.name;
                this.load_invoices();
            }
        }
    }, 5000); // Every 5 seconds
}
```

### Timer Logic

```javascript
start_popup_timer() {
    const duration = 10 * 60 * 1000; // 10 minutes
    const start_time = Date.now();

    this.popup_timer = setInterval(() => {
        const elapsed = Date.now() - start_time;
        const remaining = duration - elapsed;

        if (remaining <= 0) {
            this.hide_popup();
            return;
        }

        // Update display: "9:45", "5:30", etc.
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        this.container.find('.timer-text').text(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
}
```

## Access

**URL**: `/app/sales-invoice-realtime`

**Roles with Access**:
- System Manager
- Sales Manager
- CEO

## User Experience Flow

1. **Page Load**:
   - Dashboard loads with gradient background
   - Fetches 50 most recent invoices
   - Displays latest invoice in popup (if any)
   - Shows invoice list at bottom

2. **New Invoice Submitted**:
   - Polling detects new invoice within 5 seconds
   - Current popup fades out (if showing)
   - New popup slides in with animation
   - Timer starts at 10:00
   - Invoice list updates with new entry

3. **Timer Countdown**:
   - Every second, timer updates: 10:00 → 9:59 → ... → 0:00
   - At 0:00, popup fades out automatically
   - Invoice list expands to full screen

4. **Manual Navigation**:
   - Click any invoice card in list
   - Opens that invoice in popup
   - Timer resets to 10:00
   - Can navigate through history this way

## Design Principles

### No Clutter
- No filters
- No buttons
- No page titles
- Clean, minimal interface
- Focus entirely on invoice data

### Large Screen Optimized
- Popup: 90% width (max 1200px)
- Large fonts (32px for titles, 28px for values)
- Generous padding and spacing
- High contrast colors

### Visual Hierarchy
- Most important info (Grand Total) has strongest color (purple)
- Customer section prominently placed at top
- Items table with clear structure
- Financial cards arranged logically (subtotal → discount → tax → total)

### Professional Aesthetics
- Gradient backgrounds for visual appeal
- Consistent border radius (8px, 12px, 16px, 24px)
- Smooth transitions and animations
- Box shadows for depth
- Semi-transparent overlays

## Performance Considerations

### Polling Frequency
- 5-second intervals balance real-time feel with server load
- `get_latest_invoice()` is lightweight (single query)
- Full data reload only when new invoice detected

### Memory Management
- Timer cleanup in `destroy()` method
- Popup removal clears DOM elements
- Invoice list limited to 50 items

### Animation Performance
- CSS animations (GPU-accelerated)
- `transform` and `opacity` for smooth transitions
- No layout thrashing

## Customization Options

### Adjust Polling Frequency
Change `5000` (5 seconds) to desired interval in milliseconds:
```javascript
}, 5000); // Poll every 5 seconds
```

### Adjust Popup Duration
Change `10 * 60 * 1000` (10 minutes) to desired duration:
```javascript
const duration = 10 * 60 * 1000; // 10 minutes
```

### Change Colors
Modify gradient values in CSS:
```css
.total-card.grand-total {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
}
```

### Adjust Invoice List Size
Change SQL LIMIT in `get_realtime_invoice_data()`:
```python
LIMIT 50  # Number of invoices to fetch
```

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires ES6+ support
- CSS Grid and Flexbox
- CSS animations and transforms
- Backdrop filter support recommended

## Troubleshooting

### Popup Not Appearing
- Check if any sales invoices exist and are submitted (docstatus = 1)
- Open browser console for errors
- Verify backend API is accessible

### Polling Not Working
- Check browser console for network errors
- Verify frappe.call() is not blocked
- Ensure page hasn't been navigated away

### Timer Not Counting Down
- Check `setInterval()` is running (console.log)
- Verify timer element exists in DOM
- Ensure no JavaScript errors

### Styling Issues
- Check if styles are loaded (inspect element)
- Verify no CSS conflicts with Frappe base styles
- Clear browser cache

## Future Enhancements

Potential improvements:
1. **Sound Notifications**: Play sound when new invoice appears
2. **WebSocket Support**: Replace polling with real-time WebSocket updates
3. **Export Feature**: Export invoice details as PDF
4. **Filtering by Amount**: Show only invoices above certain threshold
5. **Multiple Popup Queue**: Stack multiple new invoices
6. **Customer Insights**: Show customer trends and statistics
7. **Configurable Popup Duration**: Allow user to set timer duration
8. **Email Alerts**: Send email when high-value invoice is submitted
9. **Mobile Responsive**: Optimize for tablets
10. **Dark Mode**: Alternative dark color scheme

## Security Notes

- Access controlled by Frappe roles
- All backend methods use `@frappe.whitelist()`
- No direct database access from frontend
- SQL injection protected by parameterized queries

## License

MIT License - Same as Expenses Management app
