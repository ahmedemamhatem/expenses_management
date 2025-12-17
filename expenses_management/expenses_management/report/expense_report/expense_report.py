# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	"""Return report columns"""
	return [
		{
			"fieldname": "posting_date",
			"label": _("Date"),
			"fieldtype": "Date",
			"width": 100
		},
		{
			"fieldname": "expense_entry",
			"label": _("Expense Entry"),
			"fieldtype": "Link",
			"options": "Expense Entry",
			"width": 150
		},
		{
			"fieldname": "company",
			"label": _("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"width": 150
		},
		{
			"fieldname": "expense_type",
			"label": _("Expense Type"),
			"fieldtype": "Link",
			"options": "Expense Type",
			"width": 150
		},
		{
			"fieldname": "expense_account",
			"label": _("Expense Account"),
			"fieldtype": "Link",
			"options": "Account",
			"width": 180
		},
		{
			"fieldname": "cost_center",
			"label": _("Cost Center"),
			"fieldtype": "Link",
			"options": "Cost Center",
			"width": 150
		},
		{
			"fieldname": "mode_of_payment",
			"label": _("Mode of Payment"),
			"fieldtype": "Link",
			"options": "Mode of Payment",
			"width": 150
		},
		{
			"fieldname": "bank_account",
			"label": _("Bank Account"),
			"fieldtype": "Link",
			"options": "Bank Account",
			"width": 150
		},
		{
			"fieldname": "taxable",
			"label": _("Taxable"),
			"fieldtype": "Check",
			"width": 80
		},
		{
			"fieldname": "amount_before_tax",
			"label": _("Amount Before Tax"),
			"fieldtype": "Currency",
			"width": 140
		},
		{
			"fieldname": "tax_amount",
			"label": _("Tax Amount"),
			"fieldtype": "Currency",
			"width": 120
		},
		{
			"fieldname": "amount",
			"label": _("Total Amount"),
			"fieldtype": "Currency",
			"width": 130
		},
		{
			"fieldname": "journal_entry",
			"label": _("Journal Entry"),
			"fieldtype": "Link",
			"options": "Journal Entry",
			"width": 150
		},
		{
			"fieldname": "remarks",
			"label": _("Remarks"),
			"fieldtype": "Small Text",
			"width": 200
		}
	]


def get_data(filters):
	"""Fetch expense data based on filters"""
	conditions = get_conditions(filters)

	data = frappe.db.sql("""
		SELECT
			ee.posting_date,
			ee.name as expense_entry,
			ee.company,
			eei.expense_type,
			eei.expense_account,
			ee.cost_center,
			ee.mode_of_payment,
			ee.bank_account,
			eei.taxable,
			eei.amount_before_tax,
			eei.tax_amount,
			eei.amount,
			ee.journal_entry,
			ee.remarks
		FROM
			`tabExpense Entry` ee
		INNER JOIN
			`tabExpense Entry Item` eei ON eei.parent = ee.name
		WHERE
			ee.docstatus = 1
			{conditions}
		ORDER BY
			ee.posting_date DESC, ee.name
	""".format(conditions=conditions), filters, as_dict=1)

	return data


def get_conditions(filters):
	"""Build filter conditions"""
	conditions = []

	if filters.get("company"):
		conditions.append("AND ee.company = %(company)s")

	if filters.get("from_date"):
		conditions.append("AND ee.posting_date >= %(from_date)s")

	if filters.get("to_date"):
		conditions.append("AND ee.posting_date <= %(to_date)s")

	if filters.get("expense_type"):
		conditions.append("AND eei.expense_type = %(expense_type)s")

	if filters.get("cost_center"):
		conditions.append("AND ee.cost_center = %(cost_center)s")

	if filters.get("mode_of_payment"):
		conditions.append("AND ee.mode_of_payment = %(mode_of_payment)s")

	if filters.get("expense_account"):
		conditions.append("AND eei.expense_account = %(expense_account)s")

	return " ".join(conditions)
