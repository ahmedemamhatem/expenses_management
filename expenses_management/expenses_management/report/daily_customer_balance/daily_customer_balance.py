# Copyright (c) 2026, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	if not filters:
		return [], []

	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	"""Return report columns"""
	return [
		{
			"fieldname": "customer",
			"label": _("Customer"),
			"fieldtype": "Link",
			"options": "Customer",
			"width": 150
		},
		{
			"fieldname": "customer_name",
			"label": _("Customer Name"),
			"fieldtype": "Data",
			"width": 200
		},
		{
			"fieldname": "opening_balance",
			"label": _("Opening Balance"),
			"fieldtype": "Currency",
			"width": 150
		},
		{
			"fieldname": "total_invoiced",
			"label": _("Total Invoiced"),
			"fieldtype": "Currency",
			"width": 150
		},
		{
			"fieldname": "total_payments",
			"label": _("Total Payments"),
			"fieldtype": "Currency",
			"width": 150
		},
		{
			"fieldname": "closing_balance",
			"label": _("Closing Balance"),
			"fieldtype": "Currency",
			"width": 150
		},
		{
			"fieldname": "overdue_balance",
			"label": _("Overdue Balance"),
			"fieldtype": "Currency",
			"width": 150
		},
		{
			"fieldname": "last_invoice_date",
			"label": _("Last Invoice Date"),
			"fieldtype": "Date",
			"width": 120
		},
		{
			"fieldname": "last_payment_date",
			"label": _("Last Payment Date"),
			"fieldtype": "Date",
			"width": 130
		},
	]


def get_data(filters):
	"""Fetch daily customer balance data"""
	date = filters.get("date")
	company = filters.get("company")
	customer_filter = filters.get("customer")

	customer_condition = ""
	if customer_filter:
		customer_condition = "AND si.customer = %(customer)s"

	# Opening balance: total outstanding from invoices posted before the selected date
	opening_data = frappe.db.sql("""
		SELECT
			si.customer,
			SUM(si.outstanding_amount) as opening_balance
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1
			AND si.company = %(company)s
			AND si.posting_date < %(date)s
			{customer_condition}
		GROUP BY si.customer
	""".format(customer_condition=customer_condition), filters, as_dict=1)

	# Day's invoiced: total grand_total from invoices posted on the selected date
	invoiced_data = frappe.db.sql("""
		SELECT
			si.customer,
			SUM(si.base_grand_total) as total_invoiced
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1
			AND si.company = %(company)s
			AND si.posting_date = %(date)s
			{customer_condition}
		GROUP BY si.customer
	""".format(customer_condition=customer_condition), filters, as_dict=1)

	# Day's payments: Payment Entries + paid amount on Sales Invoices (POS/cash)
	payment_customer_condition = ""
	if customer_filter:
		payment_customer_condition = "AND pe.party = %(customer)s"

	payment_data = frappe.db.sql("""
		SELECT customer, SUM(total_payments) as total_payments
		FROM (
			SELECT
				pe.party as customer,
				SUM(pe.paid_amount) as total_payments
			FROM `tabPayment Entry` pe
			WHERE pe.docstatus = 1
				AND pe.company = %(company)s
				AND pe.posting_date = %(date)s
				AND pe.party_type = 'Customer'
				AND pe.payment_type = 'Receive'
				{payment_customer_condition}
			GROUP BY pe.party

			UNION ALL

			SELECT
				si.customer,
				SUM(si.base_grand_total - si.outstanding_amount) as total_payments
			FROM `tabSales Invoice` si
			WHERE si.docstatus = 1
				AND si.company = %(company)s
				AND si.posting_date = %(date)s
				AND (si.base_grand_total - si.outstanding_amount) > 0
				{customer_condition}
			GROUP BY si.customer
		) combined
		GROUP BY customer
	""".format(
		payment_customer_condition=payment_customer_condition,
		customer_condition=customer_condition
	), filters, as_dict=1)

	# Overdue balance: outstanding from invoices where due_date has passed
	overdue_data = frappe.db.sql("""
		SELECT
			si.customer,
			SUM(si.outstanding_amount) as overdue_balance
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1
			AND si.company = %(company)s
			AND si.due_date < %(date)s
			AND si.outstanding_amount > 0
			AND si.posting_date <= %(date)s
			{customer_condition}
		GROUP BY si.customer
	""".format(customer_condition=customer_condition), filters, as_dict=1)

	# Last invoice date per customer (up to selected date)
	last_invoice_data = frappe.db.sql("""
		SELECT
			si.customer,
			MAX(si.posting_date) as last_invoice_date
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1
			AND si.company = %(company)s
			AND si.posting_date <= %(date)s
			{customer_condition}
		GROUP BY si.customer
	""".format(customer_condition=customer_condition), filters, as_dict=1)

	# Last payment date per customer (Payment Entries + paid invoices)
	last_payment_data = frappe.db.sql("""
		SELECT customer, MAX(last_payment_date) as last_payment_date
		FROM (
			SELECT
				pe.party as customer,
				MAX(pe.posting_date) as last_payment_date
			FROM `tabPayment Entry` pe
			WHERE pe.docstatus = 1
				AND pe.company = %(company)s
				AND pe.posting_date <= %(date)s
				AND pe.party_type = 'Customer'
				AND pe.payment_type = 'Receive'
				{payment_customer_condition}
			GROUP BY pe.party

			UNION ALL

			SELECT
				si.customer,
				MAX(si.posting_date) as last_payment_date
			FROM `tabSales Invoice` si
			WHERE si.docstatus = 1
				AND si.company = %(company)s
				AND si.posting_date <= %(date)s
				AND (si.base_grand_total - si.outstanding_amount) > 0
				{customer_condition}
			GROUP BY si.customer
		) combined
		GROUP BY customer
	""".format(
		payment_customer_condition=payment_customer_condition,
		customer_condition=customer_condition
	), filters, as_dict=1)

	# Merge all data into a single dict keyed by customer
	customers = {}

	for row in opening_data:
		customers.setdefault(row.customer, {})
		customers[row.customer]["opening_balance"] = flt(row.opening_balance)

	for row in invoiced_data:
		customers.setdefault(row.customer, {})
		customers[row.customer]["total_invoiced"] = flt(row.total_invoiced)

	for row in payment_data:
		customers.setdefault(row.customer, {})
		customers[row.customer]["total_payments"] = flt(row.total_payments)

	for row in overdue_data:
		customers.setdefault(row.customer, {})
		customers[row.customer]["overdue_balance"] = flt(row.overdue_balance)

	for row in last_invoice_data:
		customers.setdefault(row.customer, {})
		customers[row.customer]["last_invoice_date"] = row.last_invoice_date

	for row in last_payment_data:
		customers.setdefault(row.customer, {})
		customers[row.customer]["last_payment_date"] = row.last_payment_date

	# Customers with transactions today (invoices or payments on selected date)
	today_customers = set()
	for row in invoiced_data:
		today_customers.add(row.customer)
	for row in payment_data:
		today_customers.add(row.customer)

	today_only = filters.get("today_only")

	# Build final data list
	data = []
	for customer, values in sorted(customers.items()):
		# Skip customers with no transactions today if filter is checked
		if today_only and customer not in today_customers:
			continue

		opening = flt(values.get("opening_balance", 0))
		invoiced = flt(values.get("total_invoiced", 0))
		payments = flt(values.get("total_payments", 0))
		overdue = flt(values.get("overdue_balance", 0))
		closing = opening + invoiced - payments

		customer_name = frappe.db.get_value("Customer", customer, "customer_name") or customer

		data.append({
			"customer": customer,
			"customer_name": customer_name,
			"opening_balance": opening,
			"total_invoiced": invoiced,
			"total_payments": payments,
			"closing_balance": closing,
			"overdue_balance": overdue,
			"last_invoice_date": values.get("last_invoice_date"),
			"last_payment_date": values.get("last_payment_date"),
		})

	return data
