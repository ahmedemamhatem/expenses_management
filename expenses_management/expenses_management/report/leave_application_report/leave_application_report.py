# Copyright (c) 2026, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters or {})
    return columns, data


def get_columns():
    return [
        {"label": "Leave Application", "fieldname": "leave_application", "fieldtype": "Link", "options": "Leave Application", "width": 170},
        {"label": "Employee", "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 130},
        {"label": "Employee Name", "fieldname": "employee_name", "width": 180},
        {"label": "Branch", "fieldname": "branch", "width": 130},
        {"label": "Department", "fieldname": "department", "width": 140},
        {"label": "Company", "fieldname": "company", "width": 150},
        {"label": "Leave Type", "fieldname": "leave_type", "fieldtype": "Link", "options": "Leave Type", "width": 140},
        {"label": "From Date", "fieldname": "from_date", "fieldtype": "Date", "width": 110},
        {"label": "To Date", "fieldname": "to_date", "fieldtype": "Date", "width": 110},
        {"label": "Balance Before", "fieldname": "balance_before", "fieldtype": "Float", "width": 140},
		{"label": "Leave Days", "fieldname": "leave_days", "fieldtype": "Float", "width": 120},
        {"label": "Balance After", "fieldname": "balance_after", "fieldtype": "Float", "width": 140},
    ]


def get_data(filters):
    conditions = []
    values = {}

    if filters.get("employee"):
        conditions.append("la.employee = %(employee)s")
        values["employee"] = filters["employee"]

    if filters.get("leave_type"):
        conditions.append("la.leave_type = %(leave_type)s")
        values["leave_type"] = filters["leave_type"]

    if filters.get("company"):
        conditions.append("emp.company = %(company)s")
        values["company"] = filters["company"]

    if filters.get("department"):
        conditions.append("emp.department = %(department)s")
        values["department"] = filters["department"]

    if filters.get("branch"):
        conditions.append("emp.branch = %(branch)s")
        values["branch"] = filters["branch"]

    if filters.get("from_date"):
        conditions.append("la.from_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("la.to_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    condition_str = " AND " + " AND ".join(conditions) if conditions else ""

    rows = frappe.db.sql(f"""
        SELECT
            la.name AS leave_application,
            la.employee,
            emp.employee_name,
            la.leave_type,
            la.from_date,
            la.to_date,
            la.total_leave_days AS leave_days,
            emp.branch,
            emp.department,
            emp.company
        FROM `tabLeave Application` la
        INNER JOIN `tabEmployee` emp ON emp.name = la.employee
        WHERE la.docstatus = 1
        {condition_str}
        ORDER BY la.employee, la.from_date
    """, values, as_dict=True)

    data = []
    current_employee = None
    total_days = 0

    for row in rows:
        if current_employee and current_employee != row["employee"]:
            data.append({
                "employee": "",
                "employee_name": "إجمالي أيام الإجازة",
                "leave_days": total_days,
                "is_total": 1
            })
            total_days = 0

        row["balance_before"] = get_balance(
            row["employee"], row["leave_type"], row["from_date"], before=True
        )
        row["balance_after"] = get_balance(
            row["employee"], row["leave_type"], row["to_date"], before=False
        )

        total_days += row["leave_days"]
        data.append(row)
        current_employee = row["employee"]

    if current_employee:
        data.append({
            "employee": "",
            "employee_name": "إجمالي أيام الإجازة",
            "leave_days": total_days,
            "is_total": 1
        })

    return data


def get_balance(employee, leave_type, date, before=True):
    condition = "<" if before else "<="

    result = frappe.db.sql(f"""
        SELECT IFNULL(SUM(leaves), 0) AS balance
        FROM `tabLeave Ledger Entry`
        WHERE employee = %s
          AND leave_type = %s
          AND from_date {condition} %s
    """, (employee, leave_type, date), as_dict=True)

    return result[0]["balance"] if result else 0
