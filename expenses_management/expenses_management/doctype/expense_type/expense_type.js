// Copyright (c) 2025, Administrator and contributors
// For license information, please see license.txt

frappe.ui.form.on('Expense Type', {
	setup: function(frm) {
		// Filter expense account to show only Expense type accounts for selected company
		frm.set_query("expense_account", function() {
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
		// Clear expense account when company changes
		frm.set_value("expense_account", "");
	}
});

frappe.ui.form.on('Expense Type', {
	setup: function(frm) {
		// Filter expense account to show only Expense type accounts for selected company
		frm.set_query("default_tax_template", function() {
			return {
				filters: {
					"company": frm.doc.company
				}
			};
		});
	},

	company: function(frm) {
		// Clear expense account when company changes
		frm.set_value("default_tax_template", "");
	}
});
