import frappe
from frappe import _
from frappe.utils import today, getdate, flt, cint
from collections import defaultdict


@frappe.whitelist()
def get_filter_options():
	companies = frappe.db.get_all("Company", filters={"is_group": 0}, pluck="name", order_by="name")
	branches = frappe.db.get_all("Branch", pluck="name", order_by="name")
	departments = frappe.db.get_all("Department", filters={"is_group": 0}, pluck="name", order_by="name")
	loan_products = frappe.db.get_all("Loan Product", pluck="name", order_by="name")
	employees = frappe.db.sql("""
		SELECT DISTINCT e.name, e.employee_name
		FROM `tabEmployee` e
		INNER JOIN `tabLoan` l ON l.applicant = e.name AND l.applicant_type = 'Employee'
		WHERE l.docstatus = 1
		ORDER BY e.employee_name
	""", as_dict=True)

	return {
		"companies": companies,
		"branches": branches,
		"departments": departments,
		"loan_products": loan_products,
		"employees": employees,
	}


@frappe.whitelist()
def get_report_data(from_date=None, to_date=None, company=None, employee=None,
					branch=None, department=None, loan_product=None, status=None):
	"""
	Build loan analysis per employee with:
	- Before-period totals (loans disbursed & repayments before from_date)
	- In-period totals (within from_date..to_date)
	- Overall totals
	"""

	# --- Build loan conditions ---
	loan_conditions = ["l.docstatus = 1", "l.applicant_type = 'Employee'"]
	params = {}

	if company:
		loan_conditions.append("l.company = %(company)s")
		params["company"] = company
	if employee:
		loan_conditions.append("l.applicant = %(employee)s")
		params["employee"] = employee
	if branch:
		loan_conditions.append("l.branch = %(branch)s")
		params["branch"] = branch
	if department:
		loan_conditions.append("l.custom_department = %(department)s")
		params["department"] = department
	if loan_product:
		loan_conditions.append("l.loan_product = %(loan_product)s")
		params["loan_product"] = loan_product
	if status:
		if status == "active":
			loan_conditions.append("l.status IN ('Disbursed', 'Partially Disbursed', 'Active')")
		elif status == "closed":
			loan_conditions.append("l.status IN ('Closed', 'Settled')")
		elif status == "sanctioned":
			loan_conditions.append("l.status = 'Sanctioned'")

	loan_where = " AND ".join(loan_conditions)

	# --- 1. Get all matching loans ---
	loans = frappe.db.sql("""
		SELECT
			l.name AS loan_id,
			l.applicant AS employee_id,
			l.applicant_name AS employee_name,
			l.company,
			l.branch,
			l.custom_department AS department,
			l.loan_product,
			l.loan_amount,
			l.disbursed_amount,
			l.total_payment,
			l.total_principal_paid,
			l.total_interest_payable,
			l.total_amount_paid,
			l.monthly_repayment_amount,
			l.repayment_periods,
			l.posting_date AS loan_date,
			l.disbursement_date,
			l.repayment_start_date,
			l.status,
			l.is_term_loan,
			e.employee_name AS emp_name,
			e.designation,
			e.image AS employee_image
		FROM `tabLoan` l
		LEFT JOIN `tabEmployee` e ON e.name = l.applicant
		WHERE {where}
		ORDER BY l.applicant_name, l.posting_date
	""".format(where=loan_where), params, as_dict=True)

	if not loans:
		return {"employees": [], "totals": {}, "filters": params}

	# Collect loan IDs and employee IDs
	loan_ids = [l.loan_id for l in loans]
	employee_ids = list(set(l.employee_id for l in loans))

	# --- 2. Get repayments, split by period ---
	repayment_params = {"loan_ids": loan_ids}
	period_filter_before = ""
	period_filter_in = ""

	if from_date and to_date:
		repayment_params["from_date"] = from_date
		repayment_params["to_date"] = to_date
		period_filter_before = "AND lr.posting_date < %(from_date)s"
		period_filter_in = "AND lr.posting_date BETWEEN %(from_date)s AND %(to_date)s"

	# Repayments BEFORE period (per loan)
	repay_before = {}
	if from_date:
		rows = frappe.db.sql("""
			SELECT
				lr.against_loan,
				SUM(lr.amount_paid) AS total_paid,
				SUM(lr.principal_amount_paid) AS principal_paid,
				SUM(lr.total_interest_paid) AS interest_paid,
				COUNT(*) AS repayment_count
			FROM `tabLoan Repayment` lr
			WHERE lr.docstatus = 1
				AND lr.against_loan IN %(loan_ids)s
				{filter}
			GROUP BY lr.against_loan
		""".format(filter=period_filter_before), repayment_params, as_dict=True)
		for r in rows:
			repay_before[r.against_loan] = r

	# Repayments IN period (per loan)
	repay_in_period = {}
	if from_date and to_date:
		rows = frappe.db.sql("""
			SELECT
				lr.against_loan,
				SUM(lr.amount_paid) AS total_paid,
				SUM(lr.principal_amount_paid) AS principal_paid,
				SUM(lr.total_interest_paid) AS interest_paid,
				COUNT(*) AS repayment_count
			FROM `tabLoan Repayment` lr
			WHERE lr.docstatus = 1
				AND lr.against_loan IN %(loan_ids)s
				{filter}
			GROUP BY lr.against_loan
		""".format(filter=period_filter_in), repayment_params, as_dict=True)
		for r in rows:
			repay_in_period[r.against_loan] = r

	# ALL repayments (per loan) - for overall totals
	repay_all = {}
	rows = frappe.db.sql("""
		SELECT
			lr.against_loan,
			SUM(lr.amount_paid) AS total_paid,
			SUM(lr.principal_amount_paid) AS principal_paid,
			SUM(lr.total_interest_paid) AS interest_paid,
			COUNT(*) AS repayment_count
		FROM `tabLoan Repayment` lr
		WHERE lr.docstatus = 1
			AND lr.against_loan IN %(loan_ids)s
		GROUP BY lr.against_loan
	""", repayment_params, as_dict=True)
	for r in rows:
		repay_all[r.against_loan] = r

	# --- 3. Get disbursements split by period ---
	disb_before = {}
	disb_in_period = {}
	disb_all = {}

	# ALL disbursements
	rows = frappe.db.sql("""
		SELECT
			ld.against_loan,
			SUM(ld.disbursed_amount) AS total_disbursed,
			COUNT(*) AS disbursement_count
		FROM `tabLoan Disbursement` ld
		WHERE ld.docstatus = 1
			AND ld.against_loan IN %(loan_ids)s
		GROUP BY ld.against_loan
	""", repayment_params, as_dict=True)
	for r in rows:
		disb_all[r.against_loan] = r

	if from_date:
		rows = frappe.db.sql("""
			SELECT
				ld.against_loan,
				SUM(ld.disbursed_amount) AS total_disbursed,
				COUNT(*) AS disbursement_count
			FROM `tabLoan Disbursement` ld
			WHERE ld.docstatus = 1
				AND ld.against_loan IN %(loan_ids)s
				AND ld.posting_date < %(from_date)s
			GROUP BY ld.against_loan
		""", repayment_params, as_dict=True)
		for r in rows:
			disb_before[r.against_loan] = r

	if from_date and to_date:
		rows = frappe.db.sql("""
			SELECT
				ld.against_loan,
				SUM(ld.disbursed_amount) AS total_disbursed,
				COUNT(*) AS disbursement_count
			FROM `tabLoan Disbursement` ld
			WHERE ld.docstatus = 1
				AND ld.against_loan IN %(loan_ids)s
				AND ld.posting_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY ld.against_loan
		""", repayment_params, as_dict=True)
		for r in rows:
			disb_in_period[r.against_loan] = r

	# --- 4. Get detailed repayment schedule for in-period (for drill-down) ---
	period_repayments = {}
	if from_date and to_date:
		rows = frappe.db.sql("""
			SELECT
				lr.name AS repayment_id,
				lr.against_loan,
				lr.posting_date,
				lr.amount_paid,
				lr.principal_amount_paid,
				lr.total_interest_paid,
				lr.total_penalty_paid,
				lr.pending_principal_amount
			FROM `tabLoan Repayment` lr
			WHERE lr.docstatus = 1
				AND lr.against_loan IN %(loan_ids)s
				AND lr.posting_date BETWEEN %(from_date)s AND %(to_date)s
			ORDER BY lr.posting_date
		""", repayment_params, as_dict=True)
		for r in rows:
			period_repayments.setdefault(r.against_loan, []).append(r)

	# --- 5. Build per-employee data ---
	employees_map = defaultdict(lambda: {
		"employee_id": "",
		"employee_name": "",
		"designation": "",
		"employee_image": "",
		"company": "",
		"branch": "",
		"department": "",
		"loans": [],
		# Overall totals for this employee
		"total_loan_amount": 0,
		"total_disbursed": 0,
		"total_repaid": 0,
		"total_outstanding": 0,
		"total_interest_paid": 0,
		"loan_count": 0,
		"active_loan_count": 0,
		# Before period
		"before_total_disbursed": 0,
		"before_total_repaid": 0,
		"before_outstanding": 0,
		# In period
		"period_total_disbursed": 0,
		"period_total_repaid": 0,
		"period_outstanding": 0,
	})

	has_period = bool(from_date and to_date)

	for loan in loans:
		emp = employees_map[loan.employee_id]
		emp["employee_id"] = loan.employee_id
		emp["employee_name"] = loan.emp_name or loan.employee_name
		emp["designation"] = loan.designation or ""
		emp["employee_image"] = loan.employee_image or ""
		emp["company"] = loan.company or ""
		emp["branch"] = loan.branch or ""
		emp["department"] = loan.department or ""

		lid = loan.loan_id
		all_rep = repay_all.get(lid, {})
		before_rep = repay_before.get(lid, {})
		in_rep = repay_in_period.get(lid, {})
		all_disb = disb_all.get(lid, {})
		before_disb = disb_before.get(lid, {})
		in_disb = disb_in_period.get(lid, {})

		loan_disbursed = flt(all_disb.get("total_disbursed", 0)) or flt(loan.disbursed_amount)
		loan_repaid = flt(all_rep.get("total_paid", 0))
		loan_outstanding = flt(loan.loan_amount) - flt(all_rep.get("principal_paid", 0))

		before_disbursed_amt = flt(before_disb.get("total_disbursed", 0))
		before_repaid_amt = flt(before_rep.get("total_paid", 0))
		before_principal_paid = flt(before_rep.get("principal_paid", 0))
		before_outstanding_amt = before_disbursed_amt - before_principal_paid

		period_disbursed_amt = flt(in_disb.get("total_disbursed", 0))
		period_repaid_amt = flt(in_rep.get("total_paid", 0))
		period_principal_paid = flt(in_rep.get("principal_paid", 0))

		is_active = loan.status in ("Disbursed", "Partially Disbursed", "Active")

		loan_data = {
			"loan_id": lid,
			"loan_product": loan.loan_product,
			"loan_amount": flt(loan.loan_amount),
			"loan_date": str(loan.loan_date) if loan.loan_date else "",
			"disbursement_date": str(loan.disbursement_date) if loan.disbursement_date else "",
			"status": loan.status,
			"monthly_repayment": flt(loan.monthly_repayment_amount),
			"repayment_periods": cint(loan.repayment_periods),
			"is_term_loan": cint(loan.is_term_loan),
			# Overall
			"total_disbursed": loan_disbursed,
			"total_repaid": loan_repaid,
			"outstanding": max(loan_outstanding, 0),
			"interest_paid": flt(all_rep.get("interest_paid", 0)),
			"repayment_count": cint(all_rep.get("repayment_count", 0)),
			"payment_progress": round(flt(all_rep.get("principal_paid", 0)) / flt(loan.loan_amount) * 100, 1) if flt(loan.loan_amount) else 0,
			# Before period
			"before_disbursed": before_disbursed_amt,
			"before_repaid": before_repaid_amt,
			"before_outstanding": max(before_outstanding_amt, 0),
			# In period
			"period_disbursed": period_disbursed_amt,
			"period_repaid": period_repaid_amt,
			"period_principal_paid": period_principal_paid,
			# Detailed repayments in period
			"period_repayments": period_repayments.get(lid, []),
		}

		emp["loans"].append(loan_data)
		emp["loan_count"] += 1
		if is_active:
			emp["active_loan_count"] += 1
		emp["total_loan_amount"] += flt(loan.loan_amount)
		emp["total_disbursed"] += loan_disbursed
		emp["total_repaid"] += loan_repaid
		emp["total_outstanding"] += max(loan_outstanding, 0)
		emp["total_interest_paid"] += flt(all_rep.get("interest_paid", 0))

		emp["before_total_disbursed"] += before_disbursed_amt
		emp["before_total_repaid"] += before_repaid_amt
		emp["before_outstanding"] += max(before_outstanding_amt, 0)

		emp["period_total_disbursed"] += period_disbursed_amt
		emp["period_total_repaid"] += period_repaid_amt

	# Convert to list and compute period outstanding
	employees_list = []
	for emp in employees_map.values():
		emp["period_outstanding"] = flt(emp["before_outstanding"]) + flt(emp["period_total_disbursed"]) - flt(emp["period_total_repaid"])
		emp["payment_progress"] = round(flt(emp["total_repaid"]) / flt(emp["total_loan_amount"]) * 100, 1) if flt(emp["total_loan_amount"]) else 0
		employees_list.append(emp)

	# Sort by outstanding descending
	employees_list.sort(key=lambda x: x["total_outstanding"], reverse=True)

	# --- 6. Grand totals ---
	totals = {
		"employee_count": len(employees_list),
		"total_loans": sum(e["loan_count"] for e in employees_list),
		"active_loans": sum(e["active_loan_count"] for e in employees_list),
		"total_loan_amount": sum(e["total_loan_amount"] for e in employees_list),
		"total_disbursed": sum(e["total_disbursed"] for e in employees_list),
		"total_repaid": sum(e["total_repaid"] for e in employees_list),
		"total_outstanding": sum(e["total_outstanding"] for e in employees_list),
		# Before period
		"before_total_disbursed": sum(e["before_total_disbursed"] for e in employees_list),
		"before_total_repaid": sum(e["before_total_repaid"] for e in employees_list),
		"before_outstanding": sum(e["before_outstanding"] for e in employees_list),
		# In period
		"period_total_disbursed": sum(e["period_total_disbursed"] for e in employees_list),
		"period_total_repaid": sum(e["period_total_repaid"] for e in employees_list),
		"period_outstanding": sum(e.get("period_outstanding", 0) for e in employees_list),
		# Analysis
		"avg_loan_amount": round(sum(e["total_loan_amount"] for e in employees_list) / max(sum(e["loan_count"] for e in employees_list), 1), 2),
		"collection_rate": round(sum(e["total_repaid"] for e in employees_list) / max(sum(e["total_loan_amount"] for e in employees_list), 1) * 100, 1),
		"has_period": has_period,
	}

	return {
		"employees": employees_list,
		"totals": totals,
		"filters": {
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			"employee": employee,
			"branch": branch,
			"department": department,
			"loan_product": loan_product,
			"status": status,
		}
	}
