# Copyright (c) 2025, Administrator and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestExpenseType(FrappeTestCase):
	def test_expense_type_creation(self):
		"""Test that an expense type can be created"""
		expense_type = frappe.get_doc({
			"doctype": "Expense Type",
			"expense_type_name": "Test Travel",
			"company": frappe.defaults.get_user_default("Company") or "_Test Company",
			"expense_account": self.get_test_expense_account()
		})
		expense_type.insert()
		self.assertTrue(expense_type.name)
		expense_type.delete()

	def get_test_expense_account(self):
		"""Get or create a test expense account"""
		company = frappe.defaults.get_user_default("Company") or "_Test Company"
		account_name = f"Test Travel Expenses - {frappe.get_cached_value('Company', company, 'abbr')}"

		if not frappe.db.exists("Account", account_name):
			# Get a parent expense account
			parent_account = frappe.db.get_value(
				"Account",
				{"company": company, "root_type": "Expense", "is_group": 1},
				"name"
			)
			if parent_account:
				return parent_account

		return account_name if frappe.db.exists("Account", account_name) else None

	def test_expense_type_naming(self):
		"""Test that expense type naming includes company"""
		company = frappe.defaults.get_user_default("Company") or "_Test Company"
		expense_type = frappe.get_doc({
			"doctype": "Expense Type",
			"expense_type_name": "Test Naming",
			"company": company,
			"expense_account": self.get_test_expense_account()
		})
		expense_type.insert()

		# Name should be format: expense_type_name-company
		self.assertIn(company, expense_type.name)
		expense_type.delete()
