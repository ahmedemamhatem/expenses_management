# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe


def get_data():
	"""Return data for the Expenses Dashboard"""
	return frappe._dict({
		"name": "Expenses Dashboard",
		"cards": [
			{
				"name": "Total Expenses This Month"
			},
			{
				"name": "Total Expenses This Year"
			}
		],
		"charts": [],
		"shortcuts": [
			{
				"label": "Expense Entry",
				"link_to": "Expense Entry",
				"type": "DocType",
				"color": "green"
			},
			{
				"label": "Expense Type",
				"link_to": "Expense Type",
				"type": "DocType"
			},
			{
				"label": "Expense Report",
				"link_to": "Expense Report",
				"type": "Report"
			}
		]
	})
