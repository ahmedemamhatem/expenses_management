import frappe
from frappe import _
from frappe.utils import now, get_datetime, formatdate, fmt_money


@frappe.whitelist()
def get_realtime_invoice_data():
	"""Get real-time sales invoice data with customer history and balance"""

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

	enriched_invoices = []

	for invoice in invoices:
		# Get invoice items with rates
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
		# Calculate from all submitted Sales Invoices
		balance_result = frappe.db.sql("""
			SELECT SUM(outstanding_amount) as total_outstanding
			FROM `tabSales Invoice`
			WHERE customer = %(customer)s
			AND docstatus = 1
		""", {"customer": invoice.customer}, as_dict=1)

		balance_after = balance_result[0].get("total_outstanding", 0) if balance_result else 0

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
			"items": items,
			"last_invoice": last_invoice[0] if last_invoice else None,
			"customer_balance": balance_after
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
	# Calculate from all submitted Sales Invoices
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
