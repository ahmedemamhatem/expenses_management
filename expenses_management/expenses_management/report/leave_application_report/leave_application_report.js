// Copyright (c) 2026, Administrator and contributors
// For license information, please see license.txt

frappe.query_reports["Leave Application Report"] = {
    filters: [
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_start()
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_end()
        },
        {
            fieldname: "employee",
            label: __("Employee"),
            fieldtype: "Link",
            options: "Employee"
        },
        {
            fieldname: "leave_type",
            label: __("Leave Type"),
            fieldtype: "Link",
            options: "Leave Type"
        },
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company"
        },
        {
            fieldname: "department",
            label: __("Department"),
            fieldtype: "Link",
            options: "Department"
        },
        {
            fieldname: "branch",
            label: __("Branch"),
            fieldtype: "Link",
            options: "Branch"
        }
    ],

    formatter: function (value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (data && data.is_total) {
            value = `<span style="
                color: #1e7e34;
                font-weight: bold;
                background-color: #e6f4ea;
                padding: 2px 6px;
                border-radius: 4px;
                display: inline-block;
            ">${value}</span>`;
        }

        return value;
    }
};
