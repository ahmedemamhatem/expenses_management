// Copyright (c) 2025, Administrator and contributors
// For license information, please see license.txt

frappe.query_reports["Expense Report"] = {
	"filters": [
		{
			"fieldname": "company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			"reqd": 1
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname": "expense_type",
			"label": __("Expense Type"),
			"fieldtype": "Link",
			"options": "Expense Type",
			"get_query": function() {
				var company = frappe.query_report.get_filter_value('company');
				return {
					"filters": {
						"company": company
					}
				};
			}
		},
		
		{
			"fieldname": "cost_center",
			"label": __("Cost Center"),
			"fieldtype": "Link",
			"options": "Cost Center",
			"get_query": function() {
				var company = frappe.query_report.get_filter_value('company');
				return {
					"filters": {
						"company": company,
						"is_group": 0
					}
				};
			}
		},
		{
			"fieldname": "mode_of_payment",
			"label": __("Mode of Payment"),
			"fieldtype": "Link",
			"options": "Mode of Payment"
		}
	]
};
