from frappe import _


def get_data():
	return [
		{
			"module_name": "Expenses Management",
			"category": "Modules",
			"label": _("Expenses Management"),
			"color": "#FF5733",
			"icon": "octicon octicon-credit-card",
			"type": "module",
			"description": "Manage company expenses with tax calculations"
		}
	]
