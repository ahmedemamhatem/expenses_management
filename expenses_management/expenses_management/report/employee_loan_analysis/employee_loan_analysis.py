import frappe
from frappe import _
from frappe.utils import flt, getdate


def execute(filters=None):
	filters = filters or {}
	columns = get_columns(filters)
	data = get_data(filters)
	report_summary = get_report_summary(data, filters)

	return columns, data, None, None, report_summary


def get_columns(filters):
	has_period = filters.get("from_date") and filters.get("to_date")

	columns = [
		{"fieldname": "employee", "label": _("Employee ID"), "fieldtype": "Link", "options": "Employee", "width": 110},
		{"fieldname": "employee_name", "label": _("Employee Name"), "fieldtype": "Data", "width": 200},
		{"fieldname": "branch", "label": _("Branch"), "fieldtype": "Link", "options": "Branch", "width": 110},
		{"fieldname": "department", "label": _("Department"), "fieldtype": "Data", "width": 150},
		{"fieldname": "loan_count", "label": _("Loans"), "fieldtype": "Int", "width": 60},
		{"fieldname": "active_loans", "label": _("Active"), "fieldtype": "Int", "width": 60},
		{"fieldname": "total_loan_amount", "label": _("Loan Amount"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "total_disbursed", "label": _("Disbursed"), "fieldtype": "Currency", "width": 120},
	]

	if has_period:
		columns.extend([
			{"fieldname": "before_disbursed", "label": _("Before Disbursed"), "fieldtype": "Currency", "width": 130},
			{"fieldname": "before_repaid", "label": _("Before Repaid"), "fieldtype": "Currency", "width": 120},
			{"fieldname": "before_outstanding", "label": _("Before Outstanding"), "fieldtype": "Currency", "width": 140},
			{"fieldname": "period_disbursed", "label": _("Period Disbursed"), "fieldtype": "Currency", "width": 130},
			{"fieldname": "period_repaid", "label": _("Period Repaid"), "fieldtype": "Currency", "width": 120},
			{"fieldname": "period_net", "label": _("Net Movement"), "fieldtype": "Currency", "width": 120},
		])

	columns.extend([
		{"fieldname": "total_repaid", "label": _("Total Repaid"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "total_outstanding", "label": _("Outstanding"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "payment_progress", "label": _("Progress %"), "fieldtype": "Percent", "width": 100},
	])

	return columns


def get_data(filters):
	has_period = filters.get("from_date") and filters.get("to_date")

	# --- Build conditions ---
	conditions = ["l.docstatus = 1", "l.applicant_type = 'Employee'"]
	params = {}

	if filters.get("company"):
		conditions.append("l.company = %(company)s")
		params["company"] = filters["company"]
	if filters.get("employee"):
		conditions.append("l.applicant = %(employee)s")
		params["employee"] = filters["employee"]
	if filters.get("branch"):
		conditions.append("e.branch = %(branch)s")
		params["branch"] = filters["branch"]
	if filters.get("department"):
		conditions.append("e.department = %(department)s")
		params["department"] = filters["department"]
	if filters.get("loan_product"):
		conditions.append("l.loan_product = %(loan_product)s")
		params["loan_product"] = filters["loan_product"]
	if filters.get("status"):
		status = filters["status"]
		if status == "Active":
			conditions.append("l.status IN ('Disbursed', 'Partially Disbursed', 'Active')")
		elif status == "Closed":
			conditions.append("l.status IN ('Closed', 'Settled')")
		elif status == "Sanctioned":
			conditions.append("l.status = 'Sanctioned'")

	where = " AND ".join(conditions)

	# --- Get loans ---
	loans = frappe.db.sql("""
		SELECT
			l.name AS loan_id,
			l.applicant AS employee,
			l.applicant_name AS employee_name,
			l.company,
			e.branch,
			e.department,
			l.loan_product,
			l.loan_amount,
			l.disbursed_amount,
			l.total_principal_paid,
			l.total_amount_paid,
			l.status,
			e.employee_name AS emp_name
		FROM `tabLoan` l
		LEFT JOIN `tabEmployee` e ON e.name = l.applicant
		WHERE {where}
		ORDER BY l.applicant_name
	""".format(where=where), params, as_dict=True)

	if not loans:
		return []

	loan_ids = [l.loan_id for l in loans]

	# --- All repayments per loan ---
	repay_all = {}
	rows = frappe.db.sql("""
		SELECT
			lr.against_loan,
			SUM(lr.amount_paid) AS total_paid,
			SUM(lr.principal_amount_paid) AS principal_paid
		FROM `tabLoan Repayment` lr
		WHERE lr.docstatus = 1 AND lr.against_loan IN %(loan_ids)s
		GROUP BY lr.against_loan
	""", {"loan_ids": loan_ids}, as_dict=True)
	for r in rows:
		repay_all[r.against_loan] = r

	# --- All disbursements per loan ---
	disb_all = {}
	rows = frappe.db.sql("""
		SELECT
			ld.against_loan,
			SUM(ld.disbursed_amount) AS total_disbursed
		FROM `tabLoan Disbursement` ld
		WHERE ld.docstatus = 1 AND ld.against_loan IN %(loan_ids)s
		GROUP BY ld.against_loan
	""", {"loan_ids": loan_ids}, as_dict=True)
	for r in rows:
		disb_all[r.against_loan] = r

	# --- Period-specific queries ---
	repay_before = {}
	repay_in_period = {}
	disb_before = {}
	disb_in_period = {}

	if has_period:
		params["from_date"] = filters["from_date"]
		params["to_date"] = filters["to_date"]
		period_params = {"loan_ids": loan_ids, "from_date": filters["from_date"], "to_date": filters["to_date"]}

		# Repayments before period
		rows = frappe.db.sql("""
			SELECT lr.against_loan,
				SUM(lr.amount_paid) AS total_paid,
				SUM(lr.principal_amount_paid) AS principal_paid
			FROM `tabLoan Repayment` lr
			WHERE lr.docstatus = 1 AND lr.against_loan IN %(loan_ids)s
				AND lr.posting_date < %(from_date)s
			GROUP BY lr.against_loan
		""", period_params, as_dict=True)
		for r in rows:
			repay_before[r.against_loan] = r

		# Repayments in period
		rows = frappe.db.sql("""
			SELECT lr.against_loan,
				SUM(lr.amount_paid) AS total_paid,
				SUM(lr.principal_amount_paid) AS principal_paid
			FROM `tabLoan Repayment` lr
			WHERE lr.docstatus = 1 AND lr.against_loan IN %(loan_ids)s
				AND lr.posting_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY lr.against_loan
		""", period_params, as_dict=True)
		for r in rows:
			repay_in_period[r.against_loan] = r

		# Disbursements before period
		rows = frappe.db.sql("""
			SELECT ld.against_loan,
				SUM(ld.disbursed_amount) AS total_disbursed
			FROM `tabLoan Disbursement` ld
			WHERE ld.docstatus = 1 AND ld.against_loan IN %(loan_ids)s
				AND ld.posting_date < %(from_date)s
			GROUP BY ld.against_loan
		""", period_params, as_dict=True)
		for r in rows:
			disb_before[r.against_loan] = r

		# Disbursements in period
		rows = frappe.db.sql("""
			SELECT ld.against_loan,
				SUM(ld.disbursed_amount) AS total_disbursed
			FROM `tabLoan Disbursement` ld
			WHERE ld.docstatus = 1 AND ld.against_loan IN %(loan_ids)s
				AND ld.posting_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY ld.against_loan
		""", period_params, as_dict=True)
		for r in rows:
			disb_in_period[r.against_loan] = r

	# --- Group by employee ---
	from collections import defaultdict
	emp_map = defaultdict(lambda: {
		"employee": "", "employee_name": "", "branch": "", "department": "",
		"loan_count": 0, "active_loans": 0,
		"total_loan_amount": 0, "total_disbursed": 0,
		"total_repaid": 0, "total_outstanding": 0,
		"before_disbursed": 0, "before_repaid": 0, "before_outstanding": 0,
		"period_disbursed": 0, "period_repaid": 0, "period_net": 0,
		"payment_progress": 0,
	})

	for loan in loans:
		lid = loan.loan_id
		emp = emp_map[loan.employee]
		emp["employee"] = loan.employee
		emp["employee_name"] = loan.emp_name or loan.employee_name
		emp["branch"] = loan.branch or ""
		emp["department"] = loan.department or ""

		all_rep = repay_all.get(lid, {})
		all_disb_rec = disb_all.get(lid, {})

		loan_disbursed = flt(all_disb_rec.get("total_disbursed", 0)) or flt(loan.disbursed_amount)
		loan_repaid = flt(all_rep.get("total_paid", 0))
		loan_outstanding = flt(loan.loan_amount) - flt(all_rep.get("principal_paid", 0))
		is_active = loan.status in ("Disbursed", "Partially Disbursed", "Active")

		emp["loan_count"] += 1
		if is_active:
			emp["active_loans"] += 1
		emp["total_loan_amount"] += flt(loan.loan_amount)
		emp["total_disbursed"] += loan_disbursed
		emp["total_repaid"] += loan_repaid
		emp["total_outstanding"] += max(loan_outstanding, 0)

		if has_period:
			b_rep = repay_before.get(lid, {})
			i_rep = repay_in_period.get(lid, {})
			b_disb = disb_before.get(lid, {})
			i_disb = disb_in_period.get(lid, {})

			emp["before_disbursed"] += flt(b_disb.get("total_disbursed", 0))
			emp["before_repaid"] += flt(b_rep.get("total_paid", 0))
			emp["before_outstanding"] += max(flt(b_disb.get("total_disbursed", 0)) - flt(b_rep.get("principal_paid", 0)), 0)
			emp["period_disbursed"] += flt(i_disb.get("total_disbursed", 0))
			emp["period_repaid"] += flt(i_rep.get("total_paid", 0))

	# Build result rows
	data = []
	for emp in sorted(emp_map.values(), key=lambda x: x["total_outstanding"], reverse=True):
		emp["payment_progress"] = round(
			flt(emp["total_repaid"]) / max(flt(emp["total_loan_amount"]), 1) * 100, 1
		)
		if has_period:
			emp["period_net"] = flt(emp["period_disbursed"]) - flt(emp["period_repaid"])
		data.append(emp)

	return data


def get_report_summary(data, filters):
	if not data:
		return []

	total_employees = len(data)
	total_loans = sum(d["loan_count"] for d in data)
	total_amount = sum(d["total_loan_amount"] for d in data)
	total_repaid = sum(d["total_repaid"] for d in data)
	total_outstanding = sum(d["total_outstanding"] for d in data)
	collection_rate = round(total_repaid / max(total_amount, 1) * 100, 1)

	summary = [
		{"value": total_employees, "indicator": "Blue", "label": _("Employees"), "datatype": "Int"},
		{"value": total_loans, "indicator": "Purple", "label": _("Total Loans"), "datatype": "Int"},
		{"value": total_amount, "indicator": "Blue", "label": _("Total Loan Amount"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_repaid, "indicator": "Green", "label": _("Total Repaid"), "datatype": "Currency", "currency": "SAR"},
		{"value": total_outstanding, "indicator": "Red", "label": _("Total Outstanding"), "datatype": "Currency", "currency": "SAR"},
		{"value": collection_rate, "indicator": "Orange", "label": _("Collection Rate %"), "datatype": "Percent"},
	]

	has_period = filters.get("from_date") and filters.get("to_date")
	if has_period:
		period_disbursed = sum(d.get("period_disbursed", 0) for d in data)
		period_repaid = sum(d.get("period_repaid", 0) for d in data)
		summary.extend([
			{"value": period_disbursed, "indicator": "Orange", "label": _("Period Disbursed"), "datatype": "Currency", "currency": "SAR"},
			{"value": period_repaid, "indicator": "Green", "label": _("Period Repaid"), "datatype": "Currency", "currency": "SAR"},
		])

	return summary
