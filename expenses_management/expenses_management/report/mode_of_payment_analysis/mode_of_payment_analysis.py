import frappe
from frappe import _
from frappe.utils import flt
from collections import defaultdict


def execute(filters=None):
	filters = filters or {}
	columns = get_columns(filters)
	data = get_data(filters)
	report_summary = get_report_summary(data, filters)

	return columns, data, None, None, report_summary


def get_columns(filters):
	has_period = filters.get("from_date") and filters.get("to_date")

	columns = [
		{"fieldname": "mode_of_payment", "label": _("Mode of Payment"), "fieldtype": "Link", "options": "Mode of Payment", "width": 180},
		{"fieldname": "type", "label": _("Type"), "fieldtype": "Data", "width": 70},
	]

	if has_period:
		columns.extend([
			{"fieldname": "before_received", "label": _("Before Received"), "fieldtype": "Currency", "width": 130},
			{"fieldname": "before_paid", "label": _("Before Paid"), "fieldtype": "Currency", "width": 120},
			{"fieldname": "before_sales", "label": _("Before Sales"), "fieldtype": "Currency", "width": 120},
			{"fieldname": "before_expense", "label": _("Before Expense"), "fieldtype": "Currency", "width": 120},
			{"fieldname": "before_net", "label": _("Before Net"), "fieldtype": "Currency", "width": 110},
		])

	columns.extend([
		{"fieldname": "pe_received", "label": _("Received"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "pe_paid", "label": _("Paid"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "pe_internal", "label": _("Internal"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "si_amount", "label": _("Sales Inv"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "exp_amount", "label": _("Expenses"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "total_in", "label": _("Total In"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "total_out", "label": _("Total Out"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "net", "label": _("Net"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "txn_count", "label": _("Txns"), "fieldtype": "Int", "width": 60},
	])

	return columns


def get_data(filters):
	has_period = filters.get("from_date") and filters.get("to_date")

	# Build base conditions
	pe_conditions = ["pe.docstatus = 1"]
	si_conditions = ["si.docstatus = 1"]
	exp_conditions = ["ee.docstatus = 1"]
	params = {}

	if filters.get("company"):
		pe_conditions.append("pe.company = %(company)s")
		si_conditions.append("si.company = %(company)s")
		exp_conditions.append("ee.company = %(company)s")
		params["company"] = filters["company"]

	if filters.get("mode_of_payment"):
		pe_conditions.append("pe.mode_of_payment = %(mode_of_payment)s")
		si_conditions.append("sip.mode_of_payment = %(mode_of_payment)s")
		exp_conditions.append("ee.mode_of_payment = %(mode_of_payment)s")
		params["mode_of_payment"] = filters["mode_of_payment"]

	if filters.get("payment_type"):
		pe_conditions.append("pe.payment_type = %(payment_type)s")
		params["payment_type"] = filters["payment_type"]

	# Date conditions for main period
	pe_date_cond = ""
	si_date_cond = ""
	exp_date_cond = ""
	if has_period:
		pe_date_cond = "AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s"
		si_date_cond = "AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s"
		exp_date_cond = "AND ee.posting_date BETWEEN %(from_date)s AND %(to_date)s"
		params["from_date"] = filters["from_date"]
		params["to_date"] = filters["to_date"]

	pe_where = " AND ".join(pe_conditions)
	si_where = " AND ".join(si_conditions)
	exp_where = " AND ".join(exp_conditions)

	mop_map = defaultdict(lambda: {
		"mode_of_payment": "",
		"type": "",
		"pe_received": 0, "pe_paid": 0, "pe_internal": 0,
		"si_amount": 0, "exp_amount": 0,
		"total_in": 0, "total_out": 0, "net": 0,
		"txn_count": 0,
		"before_received": 0, "before_paid": 0,
		"before_sales": 0, "before_expense": 0, "before_net": 0,
	})

	# --- Mode of Payment master (for type) ---
	mop_types = {}
	for m in frappe.db.get_all("Mode of Payment", fields=["name", "type"]):
		mop_types[m.name] = m.type

	# === PAYMENT ENTRY (main period or all) ===
	pe_rows = frappe.db.sql("""
		SELECT pe.mode_of_payment, pe.payment_type,
			SUM(pe.paid_amount) AS total_amount,
			COUNT(*) AS cnt
		FROM `tabPayment Entry` pe
		WHERE {where} {date_cond}
		GROUP BY pe.mode_of_payment, pe.payment_type
	""".format(where=pe_where, date_cond=pe_date_cond), params, as_dict=True)

	for r in pe_rows:
		mop = r.mode_of_payment or _("Not Set")
		rec = mop_map[mop]
		rec["mode_of_payment"] = mop
		rec["type"] = mop_types.get(mop, "")
		amt = flt(r.total_amount)
		if r.payment_type == "Receive":
			rec["pe_received"] += amt
		elif r.payment_type == "Pay":
			rec["pe_paid"] += amt
		elif r.payment_type == "Internal Transfer":
			rec["pe_internal"] += amt
		rec["txn_count"] += r.cnt

	# === SALES INVOICE PAYMENT (main period or all) ===
	si_rows = frappe.db.sql("""
		SELECT sip.mode_of_payment,
			SUM(sip.base_amount) AS total_amount,
			COUNT(*) AS cnt
		FROM `tabSales Invoice Payment` sip
		INNER JOIN `tabSales Invoice` si ON si.name = sip.parent
		WHERE {where} {date_cond}
		GROUP BY sip.mode_of_payment
	""".format(where=si_where, date_cond=si_date_cond), params, as_dict=True)

	for r in si_rows:
		mop = r.mode_of_payment or _("Not Set")
		rec = mop_map[mop]
		rec["mode_of_payment"] = mop
		rec["type"] = mop_types.get(mop, "")
		rec["si_amount"] += flt(r.total_amount)
		rec["txn_count"] += r.cnt

	# === EXPENSE ENTRY (main period or all) ===
	exp_rows = frappe.db.sql("""
		SELECT ee.mode_of_payment,
			SUM(ee.total_amount) AS total_amount,
			COUNT(*) AS cnt
		FROM `tabExpense Entry` ee
		WHERE {where} {date_cond}
		GROUP BY ee.mode_of_payment
	""".format(where=exp_where, date_cond=exp_date_cond), params, as_dict=True)

	for r in exp_rows:
		mop = r.mode_of_payment or _("Not Set")
		rec = mop_map[mop]
		rec["mode_of_payment"] = mop
		rec["type"] = mop_types.get(mop, "")
		rec["exp_amount"] += flt(r.total_amount)
		rec["txn_count"] += r.cnt

	# === BEFORE PERIOD (if period selected) ===
	if has_period:
		before_pe = frappe.db.sql("""
			SELECT pe.mode_of_payment, pe.payment_type,
				SUM(pe.paid_amount) AS total_amount
			FROM `tabPayment Entry` pe
			WHERE {where} AND pe.posting_date < %(from_date)s
			GROUP BY pe.mode_of_payment, pe.payment_type
		""".format(where=pe_where), params, as_dict=True)

		for r in before_pe:
			mop = r.mode_of_payment or _("Not Set")
			rec = mop_map[mop]
			rec["mode_of_payment"] = mop
			rec["type"] = mop_types.get(mop, "")
			if r.payment_type == "Receive":
				rec["before_received"] += flt(r.total_amount)
			elif r.payment_type == "Pay":
				rec["before_paid"] += flt(r.total_amount)

		before_si = frappe.db.sql("""
			SELECT sip.mode_of_payment,
				SUM(sip.base_amount) AS total_amount
			FROM `tabSales Invoice Payment` sip
			INNER JOIN `tabSales Invoice` si ON si.name = sip.parent
			WHERE {where} AND si.posting_date < %(from_date)s
			GROUP BY sip.mode_of_payment
		""".format(where=si_where), params, as_dict=True)

		for r in before_si:
			mop = r.mode_of_payment or _("Not Set")
			rec = mop_map[mop]
			rec["before_sales"] += flt(r.total_amount)

		before_exp = frappe.db.sql("""
			SELECT ee.mode_of_payment,
				SUM(ee.total_amount) AS total_amount
			FROM `tabExpense Entry` ee
			WHERE {where} AND ee.posting_date < %(from_date)s
			GROUP BY ee.mode_of_payment
		""".format(where=exp_where), params, as_dict=True)

		for r in before_exp:
			mop = r.mode_of_payment or _("Not Set")
			rec = mop_map[mop]
			rec["before_expense"] += flt(r.total_amount)

	# --- Calculate totals ---
	data = []
	for rec in mop_map.values():
		rec["total_in"] = flt(rec["pe_received"]) + flt(rec["si_amount"])
		rec["total_out"] = flt(rec["pe_paid"]) + flt(rec["exp_amount"])
		rec["net"] = flt(rec["total_in"]) - flt(rec["total_out"])

		if has_period:
			rec["before_net"] = (flt(rec["before_received"]) + flt(rec["before_sales"])) - (flt(rec["before_paid"]) + flt(rec["before_expense"]))

		data.append(rec)

	data.sort(key=lambda x: x["net"], reverse=True)
	return data


def get_report_summary(data, filters):
	if not data:
		return []

	total_received = sum(d["pe_received"] for d in data)
	total_paid = sum(d["pe_paid"] for d in data)
	total_si = sum(d["si_amount"] for d in data)
	total_exp = sum(d["exp_amount"] for d in data)
	total_in = sum(d["total_in"] for d in data)
	total_out = sum(d["total_out"] for d in data)
	total_net = sum(d["net"] for d in data)
	total_txns = sum(d["txn_count"] for d in data)

	summary = [
		{"value": total_txns, "indicator": "Blue", "label": _("Total Transactions"), "datatype": "Int"},
		{"value": total_received, "indicator": "Green", "label": _("PE Received"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_paid, "indicator": "Red", "label": _("PE Paid"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_si, "indicator": "Blue", "label": _("Sales Invoice"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_exp, "indicator": "Orange", "label": _("Expenses"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_in, "indicator": "Green", "label": _("Total In"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_out, "indicator": "Red", "label": _("Total Out"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_net, "indicator": "Blue", "label": _("Net"), "datatype": "Currency", "currency": "SAR"},
	]

	return summary
