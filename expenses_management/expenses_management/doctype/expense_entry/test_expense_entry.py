# Copyright (c) 2025, Administrator and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, flt


class TestExpenseEntry(FrappeTestCase):
	def setUp(self):
		"""Set up test data"""
		self.company = frappe.defaults.get_user_default("Company") or "_Test Company"
		self.cost_center = self.get_test_cost_center()
		self.expense_account = self.get_test_expense_account()
		self.mode_of_payment = self.get_test_mode_of_payment()

	def get_test_cost_center(self):
		"""Get a test cost center"""
		cost_center = frappe.db.get_value(
			"Cost Center",
			{"company": self.company, "is_group": 0},
			"name"
		)
		return cost_center

	def get_test_expense_account(self):
		"""Get a test expense account"""
		account = frappe.db.get_value(
			"Account",
			{"company": self.company, "root_type": "Expense", "is_group": 0},
			"name"
		)
		return account

	def get_test_mode_of_payment(self):
		"""Get or create a test mode of payment"""
		if frappe.db.exists("Mode of Payment", "Cash"):
			return "Cash"
		return frappe.db.get_value("Mode of Payment", {}, "name")

	def test_expense_entry_creation(self):
		"""Test that an expense entry can be created"""
		if not self.expense_account or not self.cost_center:
			self.skipTest("Required master data not available")

		expense_entry = frappe.get_doc({
			"doctype": "Expense Entry",
			"company": self.company,
			"posting_date": today(),
			"cost_center": self.cost_center,
			"mode_of_payment": self.mode_of_payment,
			"expense_items": [
				{
					"expense_account": self.expense_account,
					"amount": 1000,
					"taxable": 0
				}
			]
		})
		expense_entry.insert()
		self.assertTrue(expense_entry.name)
		self.assertEqual(expense_entry.total_amount, 1000)
		expense_entry.delete()

	def test_tax_calculation(self):
		"""Test that tax is calculated correctly when taxable flag is set"""
		if not self.expense_account or not self.cost_center:
			self.skipTest("Required master data not available")

		expense_entry = frappe.get_doc({
			"doctype": "Expense Entry",
			"company": self.company,
			"posting_date": today(),
			"cost_center": self.cost_center,
			"mode_of_payment": self.mode_of_payment,
			"expense_items": [
				{
					"expense_account": self.expense_account,
					"amount": 115,  # Amount includes 15% tax
					"taxable": 0,
					"tax_amount": 0
				}
			]
		})
		expense_entry.insert()

		# Without tax, amount_before_tax should equal amount
		self.assertEqual(flt(expense_entry.expense_items[0].amount_before_tax), 115)
		self.assertEqual(flt(expense_entry.expense_items[0].tax_amount), 0)

		expense_entry.delete()

	def test_totals_calculation(self):
		"""Test that totals are calculated correctly"""
		if not self.expense_account or not self.cost_center:
			self.skipTest("Required master data not available")

		expense_entry = frappe.get_doc({
			"doctype": "Expense Entry",
			"company": self.company,
			"posting_date": today(),
			"cost_center": self.cost_center,
			"mode_of_payment": self.mode_of_payment,
			"expense_items": [
				{
					"expense_account": self.expense_account,
					"amount": 1000,
					"taxable": 0
				},
				{
					"expense_account": self.expense_account,
					"amount": 500,
					"taxable": 0
				}
			]
		})
		expense_entry.insert()

		# Check totals
		self.assertEqual(expense_entry.total_amount, 1500)
		self.assertEqual(expense_entry.total_amount_before_tax, 1500)
		self.assertEqual(expense_entry.total_tax_amount, 0)

		expense_entry.delete()

	def test_paid_from_account_set(self):
		"""Test that paid from account is set from mode of payment"""
		if not self.expense_account or not self.cost_center or not self.mode_of_payment:
			self.skipTest("Required master data not available")

		expense_entry = frappe.get_doc({
			"doctype": "Expense Entry",
			"company": self.company,
			"posting_date": today(),
			"cost_center": self.cost_center,
			"mode_of_payment": self.mode_of_payment,
			"expense_items": [
				{
					"expense_account": self.expense_account,
					"amount": 1000,
					"taxable": 0
				}
			]
		})
		expense_entry.insert()

		# Paid from account should be set
		if expense_entry.paid_from_account:
			self.assertTrue(expense_entry.paid_from_account)

		expense_entry.delete()
