# Real-time Sales Invoice Dashboard - Demo Simulation

This script automatically creates random sales invoices every 15 seconds for video recording and demonstration purposes.

## Quick Start

### Method 1: Using the Shell Script (Recommended)

```bash
cd /workspace/frappe-bench
./apps/expenses_management/run_demo.sh
```

**With custom settings:**
```bash
# Run for 10 minutes with 15-second intervals
./apps/expenses_management/run_demo.sh 10 15

# Run for 2 minutes with 5-second intervals
./apps/expenses_management/run_demo.sh 2 5
```

### Method 2: Using Bench Execute

```bash
cd /workspace/frappe-bench
bench --site expenses_management.local execute expenses_management.scripts.create_demo_invoices.run_simulation
```

**With custom parameters:**
```bash
bench --site expenses_management.local execute expenses_management.scripts.create_demo_invoices.run_simulation --kwargs "{'duration_minutes': 10, 'interval_seconds': 15}"
```

### Method 3: Using Python Directly

```bash
cd /workspace/frappe-bench
bench --site expenses_management.local console
```

Then in the console:
```python
from expenses_management.scripts.create_demo_invoices import run_simulation

# Run for 5 minutes with 15-second intervals (default)
run_simulation()

# Custom settings
run_simulation(duration_minutes=10, interval_seconds=15)
```

## Parameters

- **duration_minutes**: How long to run the simulation (default: 5 minutes)
- **interval_seconds**: Time between each invoice creation (default: 15 seconds)

## What the Script Does

1. Creates random customers if they don't exist
2. Creates random items if they don't exist
3. Generates sales invoices with:
   - Random customer
   - 1-3 random items
   - Random quantities (1-100)
   - Random prices
   - Optional VAT (15%)
   - Optional discount
4. Submits each invoice automatically
5. Displays progress in real-time

## Example Output

```
============================================================
Real-time Sales Invoice Dashboard - Demo Simulation
============================================================
Duration: 5 minutes
Interval: 15 seconds
Expected invoices: 20
============================================================

✓ Created invoice ACC-SINV-2025-00011 for West View Software Ltd - Total: 229000.00
   Invoices created: 1 | Time remaining: 285s

✓ Created invoice ACC-SINV-2025-00012 for Tech Solutions Inc - Total: 15750.00
   Invoices created: 2 | Time remaining: 270s
...
```

## Tips for Video Recording

1. **Open the dashboard** in your browser before starting the simulation:
   ```
   http://localhost:8000/app/sales-invoice-realtime
   ```

2. **Start the simulation** in a separate terminal

3. **Recommended settings for video:**
   - 5-minute video: `./run_demo.sh 5 15`
   - 2-minute video: `./run_demo.sh 2 10`
   - Quick demo: `./run_demo.sh 1 5`

4. **Stop anytime** by pressing `Ctrl+C`

## Cleanup

To remove demo invoices after recording:

```bash
cd /workspace/frappe-bench
bench --site expenses_management.local console
```

```python
import frappe

# Delete all sales invoices (BE CAREFUL!)
invoices = frappe.get_all("Sales Invoice")
for inv in invoices:
    doc = frappe.get_doc("Sales Invoice", inv.name)
    doc.cancel()
    doc.delete()
frappe.db.commit()
```

## Troubleshooting

### Error: "Site does not exist"
Make sure you're using the correct site name:
```bash
bench --site expenses_management.local execute ...
```

### Error: "No items found"
The script will automatically create demo items on first run.

### Error: "Permission denied"
Make the script executable:
```bash
chmod +x /workspace/frappe-bench/apps/expenses_management/run_demo.sh
```

## Notes

- The script creates submitted invoices (docstatus = 1)
- All invoices are created with today's date and current time
- The dashboard polls every 5 seconds, so new invoices will appear within 5 seconds
- The script uses random data, so each run will be different
