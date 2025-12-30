import frappe
from frappe.utils import flt, get_first_day
from hrms.payroll.doctype.salary_slip.salary_slip import SalarySlip


class CustomSalarySlip(SalarySlip):
	"""
	Custom Salary Slip override to fix methods that use invalid dict syntax
	in frappe.get_all() fields parameter.

	The original HRMS code uses syntax like:
		fields=[{"SUM": "amount", "as": "total_amount"}]

	This is invalid and causes: AttributeError: 'dict' object has no attribute 'lower'

	Fixed to use frappe.db.sql() with proper SQL syntax.
	"""

	def get_income_form_other_sources(self):
		"""Fixed: Uses frappe.db.sql instead of invalid dict syntax in frappe.get_all"""
		result = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(amount), 0) as total_amount
			FROM `tabEmployee Other Income`
			WHERE employee = %s
			AND payroll_period = %s
			AND company = %s
			AND docstatus = 1
			""",
			(self.employee, self.payroll_period.name, self.company),
			as_dict=True,
		)
		return flt(result[0].total_amount) if result else 0.0

	def compute_year_to_date(self):
		"""Fixed: Uses frappe.db.sql instead of invalid dict syntax in frappe.get_list"""
		year_to_date = 0
		period_start_date, period_end_date = self.get_year_to_date_period()

		salary_slip_sum = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(net_pay), 0) as net_sum, IFNULL(SUM(gross_pay), 0) as gross_sum
			FROM `tabSalary Slip`
			WHERE employee = %s
			AND start_date >= %s
			AND end_date < %s
			AND name != %s
			AND docstatus = 1
			""",
			(self.employee, period_start_date, period_end_date, self.name),
			as_dict=True,
		)

		year_to_date = flt(salary_slip_sum[0].net_sum) if salary_slip_sum else 0.0
		gross_year_to_date = flt(salary_slip_sum[0].gross_sum) if salary_slip_sum else 0.0

		year_to_date += self.net_pay
		gross_year_to_date += self.gross_pay
		self.year_to_date = year_to_date
		self.gross_year_to_date = gross_year_to_date

	def compute_month_to_date(self):
		"""Fixed: Uses frappe.db.sql instead of invalid dict syntax in frappe.get_list"""
		month_to_date = 0
		first_day_of_the_month = get_first_day(self.start_date)
		salary_slip_sum = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(net_pay), 0) as sum
			FROM `tabSalary Slip`
			WHERE employee = %s
			AND start_date >= %s
			AND end_date < %s
			AND name != %s
			AND docstatus = 1
			""",
			(self.employee, first_day_of_the_month, self.start_date, self.name),
			as_dict=True,
		)

		month_to_date = flt(salary_slip_sum[0].sum) if salary_slip_sum else 0.0

		month_to_date += self.net_pay
		self.month_to_date = month_to_date
