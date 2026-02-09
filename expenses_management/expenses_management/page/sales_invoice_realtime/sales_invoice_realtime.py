import frappe
from frappe import _
from frappe.utils import now, get_datetime, formatdate, fmt_money


@frappe.whitelist()
def get_realtime_invoice_data():
	"""Get real-time sales invoice data with customer history and balance"""

	# 1. Get the 50 most recent invoices
	invoices = frappe.db.sql("""
		SELECT
			si.name,
			si.customer,
			si.customer_name,
			si.posting_date,
			si.posting_time,
			si.grand_total,
			si.total,
			si.total_taxes_and_charges,
			si.discount_amount,
			si.outstanding_amount,
			si.status,
			si.is_return,
			si.creation,
			si.modified
		FROM
			`tabSales Invoice` si
		WHERE
			si.docstatus = 1
		ORDER BY
			si.creation DESC
		LIMIT 50
	""", as_dict=1)

	if not invoices:
		return []

	invoice_names = [inv.name for inv in invoices]
	customer_list = list(set(inv.customer for inv in invoices))

	# 2. Batch: get all items for all 50 invoices in ONE query
	all_items = frappe.db.sql("""
		SELECT
			parent,
			item_code,
			item_name,
			qty,
			uom,
			rate,
			amount,
			discount_percentage,
			discount_amount
		FROM
			`tabSales Invoice Item`
		WHERE
			parent IN %(names)s
		ORDER BY
			parent, idx
	""", {"names": invoice_names}, as_dict=1)

	# Group items by parent invoice
	items_by_invoice = {}
	for item in all_items:
		items_by_invoice.setdefault(item.parent, []).append(item)

	# 3. Batch: get customer outstanding balances in ONE query
	balance_results = frappe.db.sql("""
		SELECT customer, SUM(outstanding_amount) as total_outstanding
		FROM `tabSales Invoice`
		WHERE customer IN %(customers)s
		AND docstatus = 1
		GROUP BY customer
	""", {"customers": customer_list}, as_dict=1)

	balance_map = {r.customer: r.total_outstanding or 0 for r in balance_results}

	# 4. Batch: get last invoice before each invoice per customer
	# Use a single query with window function approach
	last_invoice_data = frappe.db.sql("""
		SELECT
			si2.customer,
			si2.name as last_name,
			si2.posting_date as last_date,
			si2.grand_total as last_total,
			si2.creation as last_creation,
			si1.name as current_name
		FROM `tabSales Invoice` si1
		INNER JOIN `tabSales Invoice` si2
			ON si1.customer = si2.customer
			AND si2.docstatus = 1
			AND si2.creation < si1.creation
		WHERE si1.name IN %(names)s
		AND si2.creation = (
			SELECT MAX(si3.creation)
			FROM `tabSales Invoice` si3
			WHERE si3.customer = si1.customer
			AND si3.docstatus = 1
			AND si3.creation < si1.creation
		)
	""", {"names": invoice_names}, as_dict=1)

	last_invoice_map = {}
	for row in last_invoice_data:
		last_invoice_map[row.current_name] = {
			"name": row.last_name,
			"posting_date": row.last_date,
			"grand_total": row.last_total,
		}

	# 5. Build enriched result
	enriched_invoices = []
	for invoice in invoices:
		invoice_data = {
			"name": invoice.name,
			"customer": invoice.customer,
			"customer_name": invoice.customer_name,
			"posting_date": invoice.posting_date,
			"posting_time": invoice.posting_time,
			"grand_total": invoice.grand_total,
			"total": invoice.total,
			"taxes": invoice.total_taxes_and_charges or 0,
			"discount": invoice.discount_amount or 0,
			"outstanding": invoice.outstanding_amount,
			"status": invoice.status,
			"is_return": invoice.is_return or 0,
			"creation": invoice.creation,
			"modified": invoice.modified,
			"items": items_by_invoice.get(invoice.name, []),
			"last_invoice": last_invoice_map.get(invoice.name),
			"customer_balance": balance_map.get(invoice.customer, 0),
		}
		enriched_invoices.append(invoice_data)

	return enriched_invoices


@frappe.whitelist()
def get_latest_invoice():
	"""Get the most recent submitted sales invoice"""

	invoice = frappe.db.sql("""
		SELECT
			si.name,
			si.customer,
			si.customer_name,
			si.posting_date,
			si.posting_time,
			si.grand_total,
			si.total,
			si.total_taxes_and_charges,
			si.discount_amount,
			si.outstanding_amount,
			si.status,
			si.is_return,
			si.creation,
			si.modified
		FROM
			`tabSales Invoice` si
		WHERE
			si.docstatus = 1
		ORDER BY
			si.creation DESC
		LIMIT 1
	""", as_dict=1)

	if not invoice:
		return None

	invoice = invoice[0]

	# Get invoice items
	items = frappe.db.sql("""
		SELECT
			item_code,
			item_name,
			qty,
			uom,
			rate,
			amount,
			discount_percentage,
			discount_amount
		FROM
			`tabSales Invoice Item`
		WHERE
			parent = %(invoice)s
		ORDER BY
			idx
	""", {"invoice": invoice.name}, as_dict=1)

	# Get customer's last invoice before this one
	last_invoice = frappe.db.sql("""
		SELECT
			name,
			posting_date,
			grand_total
		FROM
			`tabSales Invoice`
		WHERE
			customer = %(customer)s
			AND docstatus = 1
			AND creation < %(current_creation)s
		ORDER BY
			creation DESC
		LIMIT 1
	""", {
		"customer": invoice.customer,
		"current_creation": invoice.creation
	}, as_dict=1)

	# Get customer's current outstanding balance
	balance_result = frappe.db.sql("""
		SELECT SUM(outstanding_amount) as total_outstanding
		FROM `tabSales Invoice`
		WHERE customer = %(customer)s
		AND docstatus = 1
	""", {"customer": invoice.customer}, as_dict=1)

	balance_after = balance_result[0].get("total_outstanding", 0) if balance_result else 0

	return {
		"name": invoice.name,
		"customer": invoice.customer,
		"customer_name": invoice.customer_name,
		"posting_date": invoice.posting_date,
		"posting_time": invoice.posting_time,
		"grand_total": invoice.grand_total,
		"total": invoice.total,
		"taxes": invoice.total_taxes_and_charges or 0,
		"discount": invoice.discount_amount or 0,
		"outstanding": invoice.outstanding_amount,
		"status": invoice.status,
		"is_return": invoice.is_return or 0,
		"creation": invoice.creation,
		"modified": invoice.modified,
		"items": items,
		"last_invoice": last_invoice[0] if last_invoice else None,
		"customer_balance": balance_after
	}
