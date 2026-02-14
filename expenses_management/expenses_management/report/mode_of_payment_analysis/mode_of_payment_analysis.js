frappe.query_reports["Mode of Payment Analysis"] = {
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
			"fieldname": "mode_of_payment",
			"label": __("Mode of Payment"),
			"fieldtype": "Link",
			"options": "Mode of Payment"
		},
		{
			"fieldname": "payment_type",
			"label": __("Payment Type"),
			"fieldtype": "Select",
			"options": "\nReceive\nPay\nInternal Transfer"
		}
	],

	formatter: function(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (column.fieldname === "pe_received" && data && data.pe_received > 0) {
			value = `<span style="color:#10b981; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "pe_paid" && data && data.pe_paid > 0) {
			value = `<span style="color:#ef4444; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "si_amount" && data && data.si_amount > 0) {
			value = `<span style="color:#3b82f6; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "exp_amount" && data && data.exp_amount > 0) {
			value = `<span style="color:#f59e0b; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "total_in" && data && data.total_in > 0) {
			value = `<span style="color:#10b981; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "total_out" && data && data.total_out > 0) {
			value = `<span style="color:#ef4444; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "net" && data) {
			let color = data.net >= 0 ? "#10b981" : "#ef4444";
			value = `<span style="color:${color}; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "before_net" && data) {
			let color = data.before_net >= 0 ? "#10b981" : "#ef4444";
			value = `<span style="color:${color}; font-weight:700;">${value}</span>`;
		}
		if (column.fieldname === "type" && data && data.type) {
			let color = data.type === "Bank" ? "#3b82f6" : "#f59e0b";
			value = `<span style="color:${color}; font-weight:700;">${value}</span>`;
		}

		return value;
	}
};
