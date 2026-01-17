# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from erpnext.accounts.general_ledger import make_gl_entries, make_reverse_gl_entries
from erpnext.accounts.utils import get_fiscal_years


class ExpenseEntry(Document):
	def validate(self):
		self.set_paid_from_account()
		self.validate_tax_template()
		self.calculate_taxes()
		self.calculate_totals()

	def validate_tax_template(self):
		"""Validate that taxable items have a tax template, fetch from Expense Type if not set"""
		for item in self.expense_items:
			if item.taxable and not item.tax_template:
				# Try to fetch default tax template from Expense Type
				if item.expense_type:
					default_tax_template = frappe.db.get_value(
						"Expense Type", item.expense_type, "default_tax_template"
					)
					if default_tax_template:
						item.tax_template = default_tax_template
					else:
						frappe.throw(
							_("Row {0}: Tax Template is required when Taxable is checked. Please set a Default Tax Template in Expense Type {1} or select one manually.").format(
								item.idx, frappe.bold(item.expense_type)
							)
						)
				else:
					frappe.throw(
						_("Row {0}: Tax Template is required when Taxable is checked").format(item.idx)
					)

	def set_paid_from_account(self):
		"""Set paid from account based on bank account or mode of payment"""
		if self.bank_account:
			bank_account_doc = frappe.get_doc("Bank Account", self.bank_account)
			self.paid_from_account = bank_account_doc.account
		elif self.mode_of_payment:
			# Get default account from Mode of Payment
			mode_of_payment_doc = frappe.get_doc("Mode of Payment", self.mode_of_payment)
			for account in mode_of_payment_doc.accounts:
				if account.company == self.company:
					self.paid_from_account = account.default_account
					break

	def calculate_taxes(self):
		"""Calculate tax amount for each expense item where taxable is checked"""
		for item in self.expense_items:
			if item.taxable and item.tax_template and item.amount:
				# Get tax rate from tax template
				tax_rate = self.get_tax_rate(item.tax_template)

				# Amount includes tax, so we need to calculate backwards
				# If amount = 100 and tax = 15%, then:
				# amount_before_tax = 100 / 1.15 = 86.96
				# tax_amount = 100 - 86.96 = 13.04
				divisor = 1 + (tax_rate / 100)
				item.amount_before_tax = flt(item.amount / divisor, 2)
				item.tax_amount = flt(item.amount - item.amount_before_tax, 2)
			else:
				item.amount_before_tax = item.amount
				item.tax_amount = 0

	def get_tax_rate(self, tax_template):
		"""Get total tax rate from tax template"""
		tax_template_doc = frappe.get_doc("Purchase Taxes and Charges Template", tax_template)
		total_rate = 0

		for tax in tax_template_doc.taxes:
			if tax.rate:
				total_rate += flt(tax.rate)

		return total_rate

	def calculate_totals(self):
		"""Calculate total amounts"""
		self.total_amount = 0
		self.total_tax_amount = 0
		self.total_amount_before_tax = 0

		for item in self.expense_items:
			self.total_amount += flt(item.amount)
			self.total_tax_amount += flt(item.tax_amount)
			self.total_amount_before_tax += flt(item.amount_before_tax)

	def on_submit(self):
		"""Create GL Entries on submit"""
		self.make_gl_entries()

	def on_cancel(self):
		"""Reverse GL Entries on cancel"""
		self.make_gl_entries(cancel=True)

	def make_gl_entries(self, cancel=False):
		"""Create or reverse GL Entries for the expense"""
		if not self.paid_from_account:
			if not self.bank_account and not self.mode_of_payment:
				frappe.throw(_("Please select either a Bank Account or Mode of Payment"))
			else:
				frappe.throw(_("Could not determine payment account. Please check your Bank Account or Mode of Payment setup."))

		gl_entries = self.get_gl_entries()

		if gl_entries:
			make_gl_entries(gl_entries, cancel=cancel, merge_entries=True)

	def get_gl_entries(self):
		"""Build list of GL Entry dicts"""
		gl_entries = []

		# Get fiscal year
		fiscal_years = get_fiscal_years(self.posting_date, company=self.company)
		if not fiscal_years:
			frappe.throw(_("No fiscal year found for posting date {0}").format(self.posting_date))
		fiscal_year = fiscal_years[0][0]

		# Group expenses by account
		expense_accounts = {}
		tax_accounts = {}

		for item in self.expense_items:
			# Expense account (amount before tax)
			if item.expense_account not in expense_accounts:
				expense_accounts[item.expense_account] = 0
			expense_accounts[item.expense_account] += flt(item.amount_before_tax)

			# Tax account (if taxable)
			if item.taxable and item.tax_amount > 0 and item.tax_template:
				tax_template_doc = frappe.get_doc("Purchase Taxes and Charges Template", item.tax_template)
				for tax in tax_template_doc.taxes:
					if tax.rate and tax.account_head:
						if tax.account_head not in tax_accounts:
							tax_accounts[tax.account_head] = 0
						# Calculate proportional tax for this tax row
						tax_portion = flt(item.tax_amount * (tax.rate / self.get_tax_rate(item.tax_template)), 2)
						tax_accounts[tax.account_head] += tax_portion

		# Build against string for GL entries
		against_accounts = list(expense_accounts.keys()) + list(tax_accounts.keys())
		against_str = ", ".join(against_accounts)

		# Credit entry - Payment from bank/cash account
		gl_entries.append(
			self.get_gl_dict({
				"account": self.paid_from_account,
				"credit": flt(self.total_amount),
				"credit_in_account_currency": flt(self.total_amount),
				"against": against_str,
				"cost_center": self.cost_center,
			}, fiscal_year)
		)

		# Debit entries - Expense accounts
		for account, amount in expense_accounts.items():
			gl_entries.append(
				self.get_gl_dict({
					"account": account,
					"debit": flt(amount),
					"debit_in_account_currency": flt(amount),
					"against": self.paid_from_account,
					"cost_center": self.cost_center,
				}, fiscal_year)
			)

		# Debit entries - Tax accounts
		for account, amount in tax_accounts.items():
			gl_entries.append(
				self.get_gl_dict({
					"account": account,
					"debit": flt(amount),
					"debit_in_account_currency": flt(amount),
					"against": self.paid_from_account,
					"cost_center": self.cost_center,
				}, fiscal_year)
			)

		return gl_entries

	def get_gl_dict(self, args, fiscal_year):
		"""Return a GL Entry dict with common fields populated"""
		gl_dict = frappe._dict({
			"company": self.company,
			"posting_date": self.posting_date,
			"fiscal_year": fiscal_year,
			"voucher_type": self.doctype,
			"voucher_no": self.name,
			"remarks": self.remarks or f"Expense Entry: {self.name}",
			"debit": 0,
			"credit": 0,
			"debit_in_account_currency": 0,
			"credit_in_account_currency": 0,
			"is_opening": "No",
			"party_type": None,
			"party": None,
			"branch": self.branch if hasattr(self, "branch") else None,
		})
		gl_dict.update(args)
		return gl_dict
