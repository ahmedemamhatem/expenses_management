frappe.query_reports["Employee Loan Analysis"] = {
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
			"fieldtype": "Date"
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date"
		},
		{
			"fieldname": "employee",
			"label": __("Employee"),
			"fieldtype": "Link",
			"options": "Employee"
		},
		{
			"fieldname": "branch",
			"label": __("Branch"),
			"fieldtype": "Link",
			"options": "Branch"
		},
		{
			"fieldname": "department",
			"label": __("Department"),
			"fieldtype": "Link",
			"options": "Department",
			"get_query": function() {
				return { "filters": { "is_group": 0 } };
			}
		},
		{
			"fieldname": "loan_product",
			"label": __("Loan Product"),
			"fieldtype": "Link",
			"options": "Loan Product"
		},
		{
			"fieldname": "status",
			"label": __("Loan Status"),
			"fieldtype": "Select",
			"options": "\nActive\nClosed\nSanctioned"
		}
	],

	formatter: function(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (column.fieldname === "total_outstanding" && data && data.total_outstanding > 0) {
			value = `<span style="color:#ef4444; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "total_repaid" && data && data.total_repaid > 0) {
			value = `<span style="color:#10b981; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "payment_progress" && data) {
			let pct = data.payment_progress || 0;
			let color = pct >= 75 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";
			value = `<span style="color:${color}; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "period_net" && data) {
			let net = data.period_net || 0;
			let color = net > 0 ? "#ef4444" : "#10b981";
			value = `<span style="color:${color}; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "before_outstanding" && data && data.before_outstanding > 0) {
			value = `<span style="color:#f59e0b; font-weight:700;">${value}</span>`;
		}

		return value;
	}
};
