"""
Monkey patches for HRMS leave-related functions that use invalid dict syntax
in frappe.get_all() fields parameter.

These patches fix the AttributeError: 'dict' object has no attribute 'lower'
caused by code like: fields=[{"SUM": "amount", "as": "total_amount"}]
"""

import frappe
from frappe.utils import flt


def get_leaves_pending_approval_for_period_fixed(
	employee: str, leave_type: str, from_date, to_date
) -> float:
	"""Fixed: Returns leaves that are pending for approval"""
	leaves = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(total_leave_days), 0) as leaves
		FROM `tabLeave Application`
		WHERE employee = %s
		AND leave_type = %s
		AND status = 'Open'
		AND (
			(from_date BETWEEN %s AND %s)
			OR (to_date BETWEEN %s AND %s)
		)
		""",
		(employee, leave_type, from_date, to_date, from_date, to_date),
		as_dict=True,
	)
	return leaves[0]["leaves"] if leaves else 0.0


def get_remaining_leaves_fixed(allocation):
	"""Fixed: Returns remaining leaves from the given allocation"""
	result = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(leaves), 0) as total_leaves
		FROM `tabLeave Ledger Entry`
		WHERE employee = %s
		AND leave_type = %s
		AND to_date <= %s
		AND docstatus = 1
		""",
		(allocation.employee, allocation.leave_type, allocation.to_date),
		as_dict=True,
	)
	return result[0].total_leaves if result else 0


def get_unused_leaves_fixed(employee, leave_type, from_date, to_date):
	"""Fixed: Returns unused leaves between the given period while skipping leave allocation expiry"""
	result = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(leaves), 0) as leaves
		FROM `tabLeave Ledger Entry`
		WHERE employee = %s
		AND leave_type = %s
		AND from_date >= %s
		AND to_date <= %s
		AND (is_expired = 0 OR is_carry_forward = 1)
		""",
		(employee, leave_type, from_date, to_date),
		as_dict=True,
	)
	return flt(result[0]["leaves"]) if result else 0.0


def apply_leave_fixes():
	"""Apply monkey patches to fix HRMS leave functions"""
	import hrms.hr.doctype.leave_application.leave_application as leave_application
	import hrms.hr.doctype.leave_ledger_entry.leave_ledger_entry as leave_ledger_entry
	import hrms.hr.doctype.leave_allocation.leave_allocation as leave_allocation

	# Patch leave_application
	leave_application.get_leaves_pending_approval_for_period = get_leaves_pending_approval_for_period_fixed

	# Patch leave_ledger_entry
	leave_ledger_entry.get_remaining_leaves = get_remaining_leaves_fixed

	# Patch leave_allocation
	leave_allocation.get_unused_leaves = get_unused_leaves_fixed
