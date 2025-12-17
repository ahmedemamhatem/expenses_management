# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate


class ExpenseEntry(Document):
	def validate(self):
		self.set_paid_from_account()
		self.calculate_taxes()
		self.calculate_totals()

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
		"""Create Journal Entry on submit"""
		self.create_journal_entry()

	def on_cancel(self):
		"""Cancel linked Journal Entry"""
		if self.journal_entry:
			je = frappe.get_doc("Journal Entry", self.journal_entry)
			if je.docstatus == 1:
				je.flags.ignore_permissions = True
				je.cancel()
				frappe.msgprint(_("Journal Entry {0} has been cancelled").format(
					frappe.get_desk_link("Journal Entry", je.name)
				))

	def create_journal_entry(self):
		"""Create Journal Entry for the expense"""
		if not self.paid_from_account:
			if not self.bank_account and not self.mode_of_payment:
				frappe.throw(_("Please select either a Bank Account or Mode of Payment"))
			else:
				frappe.throw(_("Could not determine payment account. Please check your Bank Account or Mode of Payment setup."))

		# Create Journal Entry
		je = frappe.new_doc("Journal Entry")
		je.voucher_type = "Journal Entry"
		je.posting_date = self.posting_date
		je.company = self.company
		je.user_remark = self.remarks or f"Expense Entry: {self.name}"

		# Credit entry - Payment from bank/cash account
		je.append("accounts", {
			"account": self.paid_from_account,
			"credit_in_account_currency": self.total_amount,
			"cost_center": self.cost_center
		})

		# Group expenses by account for debit entries
		expense_accounts = {}
		tax_accounts = {}

		for item in self.expense_items:
			# Debit entry - Expense account (amount before tax)
			if item.expense_account not in expense_accounts:
				expense_accounts[item.expense_account] = 0
			expense_accounts[item.expense_account] += flt(item.amount_before_tax)

			# Debit entry - Tax account (if taxable)
			if item.taxable and item.tax_amount > 0 and item.tax_template:
				tax_template_doc = frappe.get_doc("Purchase Taxes and Charges Template", item.tax_template)
				for tax in tax_template_doc.taxes:
					if tax.rate and tax.account_head:
						if tax.account_head not in tax_accounts:
							tax_accounts[tax.account_head] = 0
						# Calculate proportional tax for this tax row
						tax_portion = flt(item.tax_amount * (tax.rate / self.get_tax_rate(item.tax_template)), 2)
						tax_accounts[tax.account_head] += tax_portion

		# Add expense account entries
		for account, amount in expense_accounts.items():
			je.append("accounts", {
				"account": account,
				"debit_in_account_currency": amount,
				"cost_center": self.cost_center
			})

		# Add tax account entries
		for account, amount in tax_accounts.items():
			je.append("accounts", {
				"account": account,
				"debit_in_account_currency": amount,
				"cost_center": self.cost_center
			})

		je.flags.ignore_permissions = True
		je.insert()
		je.submit()

		# Link the Journal Entry to this Expense Entry
		self.db_set("journal_entry", je.name)

		frappe.msgprint(_("Journal Entry {0} created successfully").format(
			frappe.get_desk_link("Journal Entry", je.name)
		))
