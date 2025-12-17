// Copyright (c) 2025, Administrator and contributors
// For license information, please see license.txt

frappe.ui.form.on('Expense Entry', {
	setup: function(frm) {
		// Filter bank accounts by company
		frm.set_query("bank_account", function() {
			return {
				filters: {
					"company": frm.doc.company,
					"is_company_account": 1
				}
			};
		});

		// Filter cost center by company
		frm.set_query("cost_center", function() {
			return {
				filters: {
					"company": frm.doc.company,
					"is_group": 0
				}
			};
		});

		// Filter expense type in child table by company
		frm.set_query("expense_type", "expense_items", function() {
			return {
				filters: {
					"company": frm.doc.company
				}
			};
		});

		// Filter expense account in child table to show only Expense type accounts
		frm.set_query("expense_account", "expense_items", function() {
			return {
				filters: {
					"company": frm.doc.company,
					"root_type": "Expense",
					"is_group": 0
				}
			};
		});
	},

	company: function(frm) {
		// Clear bank account when company changes
		frm.set_value("bank_account", "");
		frm.set_value("cost_center", "");
	},

	bank_account: function(frm) {
		// Fetch the account linked to the bank account
		if (frm.doc.bank_account) {
			frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "Bank Account",
					filters: { name: frm.doc.bank_account },
					fieldname: "account"
				},
				callback: function(r) {
					if (r.message) {
						frm.set_value("paid_from_account", r.message.account);
					}
				}
			});
		}
	},

	mode_of_payment: function(frm) {
		// Fetch the default account from mode of payment
		if (frm.doc.mode_of_payment && frm.doc.company) {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Mode of Payment",
					name: frm.doc.mode_of_payment
				},
				callback: function(r) {
					if (r.message && r.message.accounts) {
						r.message.accounts.forEach(function(account) {
							if (account.company === frm.doc.company) {
								frm.set_value("paid_from_account", account.default_account);
							}
						});
					}
				}
			});
		}
	}
});

frappe.ui.form.on('Expense Entry Item', {
	expense_type: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.expense_type) {
			// Fetch expense account and default tax template from Expense Type
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Expense Type",
					name: row.expense_type
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, "expense_account", r.message.expense_account);
						if (r.message.default_tax_template) {
							frappe.model.set_value(cdt, cdn, "tax_template", r.message.default_tax_template);
						}
					}
				}
			});
		}
	},

	amount: function(frm, cdt, cdn) {
		calculate_item_taxes(frm, cdt, cdn);
	},

	taxable: function(frm, cdt, cdn) {
		calculate_item_taxes(frm, cdt, cdn);
	},

	tax_template: function(frm, cdt, cdn) {
		calculate_item_taxes(frm, cdt, cdn);
	},

	expense_items_remove: function(frm) {
		calculate_totals(frm);
	}
});

function calculate_item_taxes(frm, cdt, cdn) {
	let row = locals[cdt][cdn];

	if (row.taxable && row.tax_template && row.amount) {
		// Fetch tax rate from template
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Purchase Taxes and Charges Template",
				name: row.tax_template
			},
			callback: function(r) {
				if (r.message && r.message.taxes) {
					let total_rate = 0;
					r.message.taxes.forEach(function(tax) {
						if (tax.rate) {
							total_rate += tax.rate;
						}
					});

					// Calculate backwards since amount includes tax
					let divisor = 1 + (total_rate / 100);
					let amount_before_tax = flt(row.amount / divisor, 2);
					let tax_amount = flt(row.amount - amount_before_tax, 2);

					frappe.model.set_value(cdt, cdn, "amount_before_tax", amount_before_tax);
					frappe.model.set_value(cdt, cdn, "tax_amount", tax_amount);

					calculate_totals(frm);
				}
			}
		});
	} else {
		frappe.model.set_value(cdt, cdn, "amount_before_tax", row.amount);
		frappe.model.set_value(cdt, cdn, "tax_amount", 0);
		calculate_totals(frm);
	}
}

function calculate_totals(frm) {
	let total_amount = 0;
	let total_tax = 0;
	let total_before_tax = 0;

	frm.doc.expense_items.forEach(function(item) {
		total_amount += flt(item.amount);
		total_tax += flt(item.tax_amount);
		total_before_tax += flt(item.amount_before_tax);
	});

	frm.set_value("total_amount", total_amount);
	frm.set_value("total_tax_amount", total_tax);
	frm.set_value("total_amount_before_tax", total_before_tax);
}
