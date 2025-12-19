# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ExpenseEntryItem(Document):
	def validate(self):
		"""Validate expense entry item"""
		# If taxable is checked, ensure expense type has default tax template
		if self.taxable and self.expense_type:
			expense_type_doc = frappe.get_doc("Expense Type", self.expense_type)
			if not expense_type_doc.default_tax_template:
				frappe.throw(_("Expense Type '{0}' does not have a Default Tax Template. Cannot mark as taxable.").format(self.expense_type))

			# Auto-set tax template if not set
			if not self.tax_template:
				self.tax_template = expense_type_doc.default_tax_template
