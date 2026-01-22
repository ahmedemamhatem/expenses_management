// Copyright (c) 2025, Administrator and contributors
// For license information, please see license.txt

frappe.query_reports["Stock Items Report"] = {
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
			"fieldname": "item_code",
			"label": __("Item"),
			"fieldtype": "Link",
			"options": "Item",
			"get_query": function() {
				return {
					"filters": {
						"is_stock_item": 1
					}
				};
			}
		},
		{
			"fieldname": "item_group",
			"label": __("Item Group"),
			"fieldtype": "Link",
			"options": "Item Group"
		},
		{
			"fieldname": "warehouse",
			"label": __("Warehouse"),
			"fieldtype": "Link",
			"options": "Warehouse",
			"get_query": function() {
				var company = frappe.query_report.get_filter_value('company');
				return {
					"filters": {
						"company": company
					}
				};
			}
		}
	]
};
