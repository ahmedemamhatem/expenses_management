#!/usr/bin/env python3
"""
Demo Invoice Generator for Real-time Dashboard Simulation
Creates random sales invoices every 15 seconds for video recording
"""

import frappe
import time
import random
from datetime import datetime
from frappe.utils import now, nowdate, nowtime

def get_random_customer():
	"""Get a random customer from the database"""
	customers = frappe.get_all("Customer", fields=["name"], limit=20)
	if not customers:
		# Create some demo customers if none exist
		demo_customers = [
			"West View Software Ltd",
			"Tech Solutions Inc",
			"Digital Marketing Co",
			"Cloud Services LLC",
			"Data Analytics Corp",
			"Mobile Apps Studio",
			"Web Development Agency",
			"IT Consulting Firm",
			"Software House Ltd",
			"Innovation Labs Inc"
		]
		for customer_name in demo_customers:
			if not frappe.db.exists("Customer", customer_name):
				customer = frappe.get_doc({
					"doctype": "Customer",
					"customer_name": customer_name,
					"customer_type": "Company",
					"customer_group": "Commercial",
					"territory": "All Territories"
				})
				customer.insert(ignore_permissions=True)
				frappe.db.commit()
		customers = frappe.get_all("Customer", fields=["name"], limit=20)

	return random.choice(customers).name

def get_random_items():
	"""Get random items from the database"""
	items = frappe.get_all("Item",
		filters={"disabled": 0, "is_sales_item": 1},
		fields=["name", "item_name", "standard_rate"],
		limit=50
	)

	if not items:
		# Create some demo items if none exist
		demo_items = [
			{"name": "Television", "rate": 1000.00},
			{"name": "Coffee Mug", "rate": 100.00},
			{"name": "Book", "rate": 100.00},
			{"name": "Smartphone", "rate": 500.00},
			{"name": "T-shirt", "rate": 80.00},
			{"name": "Laptop", "rate": 2000.00},
			{"name": "Headphones", "rate": 150.00},
			{"name": "Mouse", "rate": 50.00},
			{"name": "Keyboard", "rate": 120.00},
			{"name": "Monitor", "rate": 800.00}
		]

		for item_data in demo_items:
			if not frappe.db.exists("Item", item_data["name"]):
				item = frappe.get_doc({
					"doctype": "Item",
					"item_code": item_data["name"],
					"item_name": item_data["name"],
					"item_group": "Products",
					"stock_uom": "Nos",
					"is_stock_item": 0,
					"is_sales_item": 1,
					"standard_rate": item_data["rate"]
				})
				item.insert(ignore_permissions=True)
				frappe.db.commit()

		items = frappe.get_all("Item",
			filters={"disabled": 0, "is_sales_item": 1},
			fields=["name", "item_name", "standard_rate"],
			limit=50
		)

	# Select random number of items (1-3)
	num_items = random.randint(1, 3)
	selected_items = random.sample(items, min(num_items, len(items)))

	return selected_items

def create_random_invoice():
	"""Create a random sales invoice"""
	try:
		frappe.set_user("Administrator")

		# Get random customer
		customer = get_random_customer()

		# Get random items
		items = get_random_items()

		# Create sales invoice
		invoice = frappe.get_doc({
			"doctype": "Sales Invoice",
			"customer": customer,
			"posting_date": nowdate(),
			"posting_time": nowtime(),
			"due_date": nowdate(),
			"items": []
		})

		# Add items with random quantities
		for item in items:
			qty = random.randint(1, 100)
			rate = item.get("standard_rate") or random.uniform(50, 1000)

			invoice.append("items", {
				"item_code": item.name,
				"item_name": item.get("item_name") or item.name,
				"qty": qty,
				"rate": rate,
				"uom": "Nos"
			})

		# Randomly add tax (15% VAT)
		if random.choice([True, False]):
			# Get or create tax template
			tax_template = frappe.db.exists("Sales Taxes and Charges Template", "VAT 15%")
			if not tax_template:
				# Create simple tax row instead
				invoice.append("taxes", {
					"charge_type": "On Net Total",
					"account_head": "VAT - E",
					"description": "VAT 15%",
					"rate": 15
				})
			else:
				invoice.taxes_and_charges = tax_template

		# Randomly add discount
		if random.choice([True, False]):
			invoice.discount_amount = random.uniform(10, 100)

		# Insert and submit
		invoice.insert(ignore_permissions=True)
		invoice.submit()
		frappe.db.commit()

		print(f"✓ Created invoice {invoice.name} for {customer} - Total: {invoice.grand_total:.2f}")
		return invoice.name

	except Exception as e:
		print(f"✗ Error creating invoice: {str(e)}")
		frappe.db.rollback()
		return None

def run_simulation(duration_minutes=5, interval_seconds=15):
	"""
	Run the invoice generation simulation

	Args:
		duration_minutes: How long to run the simulation (default: 5 minutes)
		interval_seconds: Time between invoice creation (default: 15 seconds)
	"""
	print("=" * 60)
	print("Real-time Sales Invoice Dashboard - Demo Simulation")
	print("=" * 60)
	print(f"Duration: {duration_minutes} minutes")
	print(f"Interval: {interval_seconds} seconds")
	print(f"Expected invoices: {int(duration_minutes * 60 / interval_seconds)}")
	print("=" * 60)
	print()

	start_time = time.time()
	end_time = start_time + (duration_minutes * 60)
	invoice_count = 0

	try:
		while time.time() < end_time:
			# Create invoice
			invoice_name = create_random_invoice()
			if invoice_name:
				invoice_count += 1

			# Calculate remaining time
			remaining = int(end_time - time.time())
			print(f"   Invoices created: {invoice_count} | Time remaining: {remaining}s")
			print()

			# Wait for next interval
			if time.time() < end_time:
				time.sleep(interval_seconds)

	except KeyboardInterrupt:
		print("\n\nSimulation stopped by user")

	print()
	print("=" * 60)
	print(f"Simulation completed!")
	print(f"Total invoices created: {invoice_count}")
	print(f"Total time: {int(time.time() - start_time)}s")
	print("=" * 60)

if __name__ == "__main__":
	import sys

	# Get duration from command line argument (default: 5 minutes)
	duration = int(sys.argv[1]) if len(sys.argv) > 1 else 5

	# Get interval from command line argument (default: 15 seconds)
	interval = int(sys.argv[2]) if len(sys.argv) > 2 else 15

	run_simulation(duration_minutes=duration, interval_seconds=interval)
