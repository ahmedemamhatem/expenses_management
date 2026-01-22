# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	"""Return report columns"""
	return [
		{
			"fieldname": "item_code",
			"label": _("Item Code"),
			"fieldtype": "Link",
			"options": "Item",
			"width": 150
		},
		{
			"fieldname": "item_name",
			"label": _("Item Name"),
			"fieldtype": "Data",
			"width": 200
		},
		{
			"fieldname": "warehouse",
			"label": _("Warehouse"),
			"fieldtype": "Link",
			"options": "Warehouse",
			"width": 180
		},
		{
			"fieldname": "stock_uom",
			"label": _("UOM"),
			"fieldtype": "Link",
			"options": "UOM",
			"width": 80
		},
		{
			"fieldname": "weight_per_unit",
			"label": _("Weight Per Unit"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "last_purchase_rate",
			"label": _("Last Purchase Rate"),
			"fieldtype": "Currency",
			"width": 140
		},
		{
			"fieldname": "purchase_uom",
			"label": _("Purchase UOM"),
			"fieldtype": "Link",
			"options": "UOM",
			"width": 100
		},
		{
			"fieldname": "rate_per_ton",
			"label": _("Rate Per Ton"),
			"fieldtype": "Currency",
			"width": 130
		},
		{
			"fieldname": "rate_source",
			"label": _("Rate Source"),
			"fieldtype": "Data",
			"width": 130
		},
		{
			"fieldname": "source_document",
			"label": _("Source Document"),
			"fieldtype": "Dynamic Link",
			"options": "source_doctype",
			"width": 180
		},
		{
			"fieldname": "posting_date",
			"label": _("Posting Date"),
			"fieldtype": "Date",
			"width": 110
		},
		{
			"fieldname": "source_doctype",
			"label": _("Source DocType"),
			"fieldtype": "Data",
			"hidden": 1
		}
	]


def get_data(filters):
	"""Fetch stock items data"""
	conditions = get_conditions(filters)

	# Get all stock items with their warehouse balances
	data = frappe.db.sql("""
		SELECT
			bin.item_code,
			item.item_name,
			bin.warehouse,
			item.stock_uom,
			item.weight_per_unit,
			item.weight_uom
		FROM
			`tabBin` bin
		INNER JOIN
			`tabItem` item ON item.name = bin.item_code
		WHERE
			item.is_stock_item = 1
			AND bin.actual_qty > 0
			{conditions}
		ORDER BY
			bin.item_code, bin.warehouse
	""".format(conditions=conditions), filters, as_dict=1)

	# Process each row to add rate information
	for row in data:
		row["last_purchase_rate"] = 0
		row["purchase_uom"] = ""
		row["rate_per_ton"] = 0
		row["rate_source"] = ""
		row["source_document"] = ""
		row["posting_date"] = ""
		row["source_doctype"] = ""

		# Get last purchase rate from Purchase Receipt before 2026-01-01
		pr_data = get_last_purchase_receipt_rate(
			row["item_code"],
			row["warehouse"],
			"2026-01-01"
		)

		if pr_data:
			row["last_purchase_rate"] = flt(pr_data.get("rate"))
			row["purchase_uom"] = pr_data.get("uom")
			row["rate_source"] = _("Purchase Receipt")
			row["source_document"] = pr_data.get("name")
			row["posting_date"] = pr_data.get("posting_date")
			row["source_doctype"] = "Purchase Receipt"
			# Calculate rate per ton using weight_per_unit
			row["rate_per_ton"] = calculate_rate_per_ton(
				pr_data.get("rate"),
				pr_data.get("uom"),
				row["weight_per_unit"],
				row.get("weight_uom")
			)
		else:
			# Try Purchase Invoice if no Purchase Receipt found
			pi_data = get_last_purchase_invoice_rate(
				row["item_code"],
				row["warehouse"],
				"2026-01-01"
			)
			if pi_data:
				row["last_purchase_rate"] = flt(pi_data.get("rate"))
				row["purchase_uom"] = pi_data.get("uom")
				row["rate_source"] = _("Purchase Invoice")
				row["source_document"] = pi_data.get("name")
				row["posting_date"] = pi_data.get("posting_date")
				row["source_doctype"] = "Purchase Invoice"
				# Calculate rate per ton using weight_per_unit
				row["rate_per_ton"] = calculate_rate_per_ton(
					pi_data.get("rate"),
					pi_data.get("uom"),
					row["weight_per_unit"],
					row.get("weight_uom")
				)
			else:
				row["last_purchase_rate"] = 0
				row["purchase_uom"] = ""
				row["rate_per_ton"] = 0
				row["rate_source"] = _("No Purchase Found")
				row["source_document"] = ""
				row["posting_date"] = ""
				row["source_doctype"] = ""

	return data


def get_conditions(filters):
	"""Build filter conditions"""
	conditions = []

	if filters.get("item_code"):
		conditions.append("AND bin.item_code = %(item_code)s")

	if filters.get("warehouse"):
		conditions.append("AND bin.warehouse = %(warehouse)s")

	if filters.get("item_group"):
		conditions.append("AND item.item_group = %(item_group)s")

	return " ".join(conditions)


def calculate_rate_per_ton(rate, purchase_uom, weight_per_unit, weight_uom=None):
	"""Calculate rate per ton based on purchase rate and weight_per_unit"""
	if not rate or not purchase_uom:
		return 0

	# If purchase_uom is ton (طن), rate is already per ton
	if purchase_uom == "طن":
		return flt(rate, 2)

	# If purchase_uom is kg (كيلو), convert to per ton (multiply by 1000)
	if purchase_uom == "كيلو":
		return flt(rate * 1000, 2)

	# For other UOMs (piece-based), use weight_per_unit to convert
	weight_per_unit = flt(weight_per_unit)
	if not weight_per_unit:
		return 0

	# Convert weight_per_unit to kg based on weight_uom
	# Default assumes weight_uom is كيلو (kg)
	weight_per_unit_kg = weight_per_unit
	if weight_uom == "طن":
		# weight_per_unit is in tons, convert to kg
		weight_per_unit_kg = weight_per_unit * 1000

	# rate_per_ton = rate_per_piece / weight_per_unit_kg * 1000
	return flt(rate / weight_per_unit_kg * 1000, 2)


def get_last_purchase_receipt_rate(item_code, warehouse, before_date):
	"""Get rate, uom, document name and posting date from last Purchase Receipt before given date"""
	result = frappe.db.sql("""
		SELECT pri.rate, pri.uom, pr.name, pr.posting_date
		FROM `tabPurchase Receipt Item` pri
		INNER JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
		WHERE
			pri.item_code = %s
			AND pri.warehouse = %s
			AND pr.posting_date < %s
			AND pr.docstatus = 1
		ORDER BY pr.posting_date DESC, pr.creation DESC
		LIMIT 1
	""", (item_code, warehouse, before_date), as_dict=1)

	return result[0] if result else None


def get_last_purchase_invoice_rate(item_code, warehouse, before_date):
	"""Get rate, uom, document name and posting date from last Purchase Invoice before given date"""
	result = frappe.db.sql("""
		SELECT pii.rate, pii.uom, pi.name, pi.posting_date
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE
			pii.item_code = %s
			AND pii.warehouse = %s
			AND pi.posting_date < %s
			AND pi.docstatus = 1
		ORDER BY pi.posting_date DESC, pi.creation DESC
		LIMIT 1
	""", (item_code, warehouse, before_date), as_dict=1)

	return result[0] if result else None
