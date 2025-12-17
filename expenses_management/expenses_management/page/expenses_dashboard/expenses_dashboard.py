# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import (
    today, add_months, get_first_day, get_last_day,
    getdate, flt
)


@frappe.whitelist()
def get_dashboard_data(
    company=None, from_date=None, to_date=None,
    cost_center=None, expense_type=None
):
    """Get data for expenses dashboard with filters"""

    # Set defaults
    if not company:
        company = frappe.defaults.get_user_default("Company")

    if not from_date:
        from_date = get_first_day(add_months(today(), -1))
    else:
        from_date = getdate(from_date)

    if not to_date:
        to_date = get_last_day(today())
    else:
        to_date = getdate(to_date)

    # Build filter conditions
    conditions = ["ee.docstatus = 1", "ee.company = %(company)s"]
    values = {"company": company}

    if cost_center:
        conditions.append("ee.cost_center = %(cost_center)s")
        values["cost_center"] = cost_center

    where_clause = " AND ".join(conditions)

    # Get current period data
    current_conditions = conditions + [
        "ee.posting_date BETWEEN %(from_date)s AND %(to_date)s"
    ]
    current_where = " AND ".join(current_conditions)

    current_total = frappe.db.sql(f"""
        SELECT COALESCE(SUM(ee.total_amount), 0) as total
        FROM `tabExpense Entry` ee
        WHERE {current_where}
    """, {**values, "from_date": from_date, "to_date": to_date})[0][0]

    # Get previous period for comparison
    prev_from = add_months(from_date, -1)
    prev_to = add_months(to_date, -1)

    prev_total = frappe.db.sql(f"""
        SELECT COALESCE(SUM(ee.total_amount), 0) as total
        FROM `tabExpense Entry` ee
        WHERE {current_where}
    """, {**values, "from_date": prev_from, "to_date": prev_to})[0][0]

    # Calculate change percentage
    change = 0
    if prev_total > 0:
        change = ((current_total - prev_total) / prev_total) * 100

    # Get year to date
    year_start = getdate(f"{getdate(today()).year}-01-01")
    ytd_conditions = conditions + [
        "ee.posting_date BETWEEN %(year_start)s AND %(to_date)s"
    ]
    ytd_where = " AND ".join(ytd_conditions)

    ytd_total = frappe.db.sql(f"""
        SELECT COALESCE(SUM(ee.total_amount), 0) as total
        FROM `tabExpense Entry` ee
        WHERE {ytd_where}
    """, {**values, "year_start": year_start, "to_date": to_date})[0][0]

    # Get expenses by type
    item_conditions = ["ee.docstatus = 1", "ee.company = %(company)s"]
    if cost_center:
        item_conditions.append("ee.cost_center = %(cost_center)s")
    if expense_type:
        item_conditions.append("eei.expense_type = %(expense_type)s")
        values["expense_type"] = expense_type

    item_conditions.append(
        "ee.posting_date BETWEEN %(from_date)s AND %(to_date)s"
    )
    item_where = " AND ".join(item_conditions)

    expenses_by_type = frappe.db.sql(f"""
        SELECT
            eei.expense_type,
            SUM(eei.amount) as total,
            COUNT(DISTINCT ee.name) as count
        FROM `tabExpense Entry Item` eei
        INNER JOIN `tabExpense Entry` ee ON ee.name = eei.parent
        WHERE {item_where}
        GROUP BY eei.expense_type
        ORDER BY total DESC
        LIMIT 10
    """, {**values, "from_date": from_date, "to_date": to_date}, as_dict=1)

    # Get expenses by cost center
    expenses_by_cc = frappe.db.sql(f"""
        SELECT
            ee.cost_center,
            SUM(ee.total_amount) as total,
            COUNT(ee.name) as count
        FROM `tabExpense Entry` ee
        WHERE {current_where}
            AND ee.cost_center IS NOT NULL
        GROUP BY ee.cost_center
        ORDER BY total DESC
        LIMIT 10
    """, {**values, "from_date": from_date, "to_date": to_date}, as_dict=1)

    # Get monthly trend (last 12 months)
    monthly_trend = []
    for i in range(11, -1, -1):
        month_date = add_months(to_date, -i)
        month_start = get_first_day(month_date)
        month_end = get_last_day(month_date)

        month_total = frappe.db.sql(f"""
            SELECT COALESCE(SUM(ee.total_amount), 0) as total
            FROM `tabExpense Entry` ee
            WHERE {where_clause}
                AND ee.posting_date BETWEEN %(m_start)s AND %(m_end)s
        """, {
            **values,
            "m_start": month_start,
            "m_end": month_end
        })[0][0]

        monthly_trend.append({
            "month": month_start.strftime("%b %Y"),
            "total": flt(month_total, 2)
        })

    # Get top expenses
    top_expenses = frappe.db.sql(f"""
        SELECT
            ee.name,
            ee.posting_date,
            ee.total_amount,
            ee.cost_center,
            ee.remarks
        FROM `tabExpense Entry` ee
        WHERE {current_where}
        ORDER BY ee.total_amount DESC
        LIMIT 10
    """, {**values, "from_date": from_date, "to_date": to_date}, as_dict=1)

    # Get expense count and average
    stats = frappe.db.sql(f"""
        SELECT
            COUNT(ee.name) as count,
            AVG(ee.total_amount) as average,
            SUM(ee.total_tax_amount) as total_tax
        FROM `tabExpense Entry` ee
        WHERE {current_where}
    """, {**values, "from_date": from_date, "to_date": to_date}, as_dict=1)[0]

    return {
        "current_period": {
            "total": flt(current_total, 2),
            "change": flt(change, 2),
            "from_date": from_date.strftime("%Y-%m-%d"),
            "to_date": to_date.strftime("%Y-%m-%d")
        },
        "year_to_date": {
            "total": flt(ytd_total, 2)
        },
        "stats": {
            "count": stats.count or 0,
            "average": flt(stats.average or 0, 2),
            "total_tax": flt(stats.total_tax or 0, 2)
        },
        "expenses_by_type": expenses_by_type,
        "expenses_by_cost_center": expenses_by_cc,
        "monthly_trend": monthly_trend,
        "top_expenses": top_expenses
    }


@frappe.whitelist()
def get_filter_options():
    """Get options for dashboard filters"""
    company = frappe.defaults.get_user_default("Company")

    companies = frappe.db.get_all("Company", pluck="name")

    cost_centers = frappe.db.get_all(
        "Cost Center",
        filters={"company": company, "is_group": 0},
        pluck="name"
    )

    expense_types = frappe.db.get_all(
        "Expense Type",
        filters={"company": company},
        pluck="name"
    )

    return {
        "companies": companies,
        "cost_centers": cost_centers,
        "expense_types": expense_types
    }
