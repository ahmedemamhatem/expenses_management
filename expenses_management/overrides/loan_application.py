import frappe


def set_applicant_name(doc, method=None):
	"""Auto-populate custom_applicant_name from the linked Employee or Customer."""
	if not doc.applicant_type or not doc.applicant:
		doc.custom_applicant_name = None
		return

	if doc.applicant_type == "Employee":
		doc.custom_applicant_name = frappe.db.get_value(
			"Employee", doc.applicant, "employee_name"
		)
	elif doc.applicant_type == "Customer":
		doc.custom_applicant_name = frappe.db.get_value(
			"Customer", doc.applicant, "customer_name"
		)


def backfill_applicant_names():
	"""Backfill custom_applicant_name for existing Loan Applications.
	Called via after_migrate hook.
	"""
	loans = frappe.get_all(
		"Loan Application",
		filters={"custom_applicant_name": ("in", [None, ""])},
		fields=["name", "applicant_type", "applicant"],
		limit_page_length=0,
	)

	if not loans:
		return

	for loan in loans:
		name_val = None
		if loan.applicant_type == "Employee" and loan.applicant:
			name_val = frappe.db.get_value("Employee", loan.applicant, "employee_name")
		elif loan.applicant_type == "Customer" and loan.applicant:
			name_val = frappe.db.get_value("Customer", loan.applicant, "customer_name")

		if name_val:
			frappe.db.set_value(
				"Loan Application", loan.name, "custom_applicant_name", name_val,
				update_modified=False,
			)

	frappe.db.commit()
