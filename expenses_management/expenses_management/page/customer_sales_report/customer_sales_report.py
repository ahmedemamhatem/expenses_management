# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import today, getdate, flt, cint
from collections import defaultdict


def is_admin_or_system_manager():
    """Check if user is Administrator or has System Manager role"""
    if frappe.session.user == "Administrator":
        return True
    user_roles = frappe.get_roles()
    return "System Manager" in user_roles


def has_permission_to_view():
    """Check if user has permission to view this report"""
    allowed_roles = ["System Manager", "Accounts Manager", "Accounts User", "Sales Manager", "Sales User"]
    user_roles = frappe.get_roles()

    for role in allowed_roles:
        if role in user_roles:
            return True
    return False


def get_user_restrictions():
    """Get user permission restrictions for filtering data"""
    if is_admin_or_system_manager():
        return {}

    restrictions = {}
    user_permissions = frappe.permissions.get_user_permissions()

    # Check for Customer restrictions
    if "Customer" in user_permissions:
        restrictions["customers"] = [p.get("doc") for p in user_permissions["Customer"] if p.get("doc")]

    # Check for Territory restrictions
    if "Territory" in user_permissions:
        restrictions["territories"] = [p.get("doc") for p in user_permissions["Territory"] if p.get("doc")]

    # Check for Customer Group restrictions
    if "Customer Group" in user_permissions:
        restrictions["customer_groups"] = [p.get("doc") for p in user_permissions["Customer Group"] if p.get("doc")]

    # Check for Company restrictions
    if "Company" in user_permissions:
        restrictions["companies"] = [p.get("doc") for p in user_permissions["Company"] if p.get("doc")]

    # Check for Branch restrictions
    if "Branch" in user_permissions:
        restrictions["branches"] = [p.get("doc") for p in user_permissions["Branch"] if p.get("doc")]

    return restrictions


@frappe.whitelist()
def get_filter_options():
    """Get options for report filters using SQL"""

    if not has_permission_to_view():
        frappe.throw(_("You don't have permission to view this report"))

    restrictions = get_user_restrictions()

    # Companies
    if restrictions.get("companies"):
        companies = restrictions["companies"]
    else:
        companies = frappe.db.sql("SELECT name FROM `tabCompany`", as_list=1)
        companies = [c[0] for c in companies]

    # Branches
    if restrictions.get("branches"):
        branches = restrictions["branches"]
    else:
        branches = frappe.db.sql("SELECT name FROM `tabBranch`", as_list=1)
        branches = [b[0] for b in branches]

    # Customers
    if restrictions.get("customers"):
        customer_list = restrictions["customers"]
        placeholders = ", ".join(["%s"] * len(customer_list))
        customers = frappe.db.sql(f"""
            SELECT name, customer_name FROM `tabCustomer`
            WHERE disabled = 0 AND name IN ({placeholders})
            ORDER BY customer_name
        """, tuple(customer_list), as_dict=1)
    elif restrictions.get("territories"):
        territory_list = restrictions["territories"]
        placeholders = ", ".join(["%s"] * len(territory_list))
        customers = frappe.db.sql(f"""
            SELECT name, customer_name FROM `tabCustomer`
            WHERE disabled = 0 AND territory IN ({placeholders})
            ORDER BY customer_name
        """, tuple(territory_list), as_dict=1)
    elif restrictions.get("customer_groups"):
        group_list = restrictions["customer_groups"]
        placeholders = ", ".join(["%s"] * len(group_list))
        customers = frappe.db.sql(f"""
            SELECT name, customer_name FROM `tabCustomer`
            WHERE disabled = 0 AND customer_group IN ({placeholders})
            ORDER BY customer_name
        """, tuple(group_list), as_dict=1)
    else:
        customers = frappe.db.sql("""
            SELECT name, customer_name FROM `tabCustomer`
            WHERE disabled = 0 ORDER BY customer_name
        """, as_dict=1)

    pos_profiles = frappe.db.sql("SELECT name FROM `tabPOS Profile` WHERE disabled = 0", as_list=1)
    pos_profiles = [p[0] for p in pos_profiles]

    customer_groups = frappe.db.sql("SELECT name FROM `tabCustomer Group`", as_list=1)
    customer_groups = [c[0] for c in customer_groups]

    territories = frappe.db.sql("SELECT name FROM `tabTerritory`", as_list=1)
    territories = [t[0] for t in territories]

    sales_persons = frappe.db.sql("SELECT name FROM `tabSales Person`", as_list=1)
    sales_persons = [s[0] for s in sales_persons]

    return {
        "companies": companies,
        "branches": branches,
        "customers": customers,
        "pos_profiles": pos_profiles,
        "customer_groups": customer_groups,
        "territories": territories,
        "sales_persons": sales_persons
    }


@frappe.whitelist()
def get_report_data(company, from_date=None, to_date=None, branch=None, customer=None, pos_profile=None,
                    customer_group=None, territory=None, sales_person=None, payment_status=None, sort_by=None, sort_order=None, use_credit_days=None):
    """Get customer sales report data using SQL - WITHOUT profit information"""

    if not has_permission_to_view():
        frappe.throw(_("You don't have permission to view this report"))

    if not company:
        frappe.throw(_("Company is required"))

    use_credit_days = use_credit_days in [True, 'true', '1', 1]

    if not from_date:
        from_date = today()
    if not to_date:
        to_date = today()

    from_date = getdate(from_date)
    to_date = getdate(to_date)

    # Get user restrictions
    restrictions = get_user_restrictions()

    values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date
    }

    extra_conditions = []
    customer_conditions = []

    # Apply user restrictions
    if restrictions.get("customers"):
        customer_conditions.append("c.name IN %(allowed_customers)s")
        values["allowed_customers"] = tuple(restrictions["customers"])
    if restrictions.get("territories"):
        customer_conditions.append("c.territory IN %(allowed_territories)s")
        values["allowed_territories"] = tuple(restrictions["territories"])
    if restrictions.get("customer_groups"):
        customer_conditions.append("c.customer_group IN %(allowed_customer_groups)s")
        values["allowed_customer_groups"] = tuple(restrictions["customer_groups"])
    if restrictions.get("branches"):
        extra_conditions.append("si.branch IN %(allowed_branches)s")
        values["allowed_branches"] = tuple(restrictions["branches"])

    # Apply filters from UI
    if branch:
        extra_conditions.append("si.branch = %(branch)s")
        values["branch"] = branch
    if customer:
        extra_conditions.append("si.customer = %(customer)s")
        values["customer"] = customer
    if pos_profile:
        extra_conditions.append("si.pos_profile = %(pos_profile)s")
        values["pos_profile"] = pos_profile
    if customer_group:
        customer_conditions.append("c.customer_group = %(customer_group)s")
        values["customer_group"] = customer_group
    if territory:
        customer_conditions.append("c.territory = %(territory)s")
        values["territory"] = territory
    if sales_person:
        extra_conditions.append("EXISTS (SELECT 1 FROM `tabSales Team` st WHERE st.parent = si.name AND st.sales_person = %(sales_person)s)")
        values["sales_person"] = sales_person

    if payment_status:
        if payment_status == "paid":
            extra_conditions.append("si.outstanding_amount = 0")
        elif payment_status == "not_paid":
            extra_conditions.append("si.outstanding_amount > 0")
        elif payment_status == "credit":
            extra_conditions.append("si.outstanding_amount > 0 AND si.outstanding_amount < si.grand_total")
        elif payment_status == "unpaid":
            extra_conditions.append("si.outstanding_amount = si.grand_total AND si.outstanding_amount > 0")

    extra_where = (" AND " + " AND ".join(extra_conditions)) if extra_conditions else ""

    # Build customer join and conditions
    customer_join = "LEFT JOIN `tabCustomer` c ON c.name = si.customer"
    customer_where = (" AND " + " AND ".join(customer_conditions)) if customer_conditions else ""

    customers_data = get_customers_sales_data(company, from_date, to_date, values, extra_where, customer_join, customer_where, use_credit_days)
    period_totals = calculate_period_totals(values, extra_where, customer_join, customer_where)

    return {
        "customers": customers_data,
        "totals": period_totals,
        "filters": {
            "company": company,
            "from_date": str(from_date),
            "to_date": str(to_date),
            "branch": branch,
            "customer": customer,
            "pos_profile": pos_profile,
            "customer_group": customer_group,
            "territory": territory,
            "sales_person": sales_person,
            "payment_status": payment_status,
            "use_credit_days": use_credit_days
        }
    }


def get_empty_totals():
    return {
        "total_customers": 0,
        "total_purchase_period": 0,
        "total_purchase_all_time": 0,
        "total_balance": 0,
        "total_due": 0,
        "invoice_count_period": 0,
        "invoice_count_all_time": 0,
        "return_count_period": 0,
        "return_count_all_time": 0,
        "total_weight_tons": 0,
        "total_items_count": 0,
        "unique_items_count": 0
    }


def calculate_period_totals(values, extra_where, customer_join, customer_where):
    """Calculate totals using SQL - WITHOUT profit"""

    combined_totals = frappe.db.sql(f"""
        SELECT
            COUNT(DISTINCT si.customer) as total_customers,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_net_total ELSE 0 END), 0) as period_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_net_total) ELSE 0 END), 0) as period_returns,
            COUNT(CASE WHEN si.is_return = 0 THEN 1 END) as invoice_count_period,
            COUNT(CASE WHEN si.is_return = 1 THEN 1 END) as return_count_period
        FROM `tabSales Invoice` si
        {customer_join}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        {customer_where}
        {extra_where}
    """, values, as_dict=1)

    if not combined_totals or not combined_totals[0].get("total_customers"):
        return get_empty_totals()

    # Get all-time balance and due for customers in the period
    all_time_balance_query = frappe.db.sql(f"""
        SELECT
            COALESCE(SUM(si_all.outstanding_amount), 0) as total_balance,
            COALESCE(SUM(CASE WHEN si_all.outstanding_amount > 0 AND si_all.due_date <= CURDATE() THEN si_all.outstanding_amount ELSE 0 END), 0) as total_due
        FROM `tabSales Invoice` si_all
        WHERE si_all.docstatus = 1
        AND si_all.company = %(company)s
        AND si_all.customer IN (
            SELECT DISTINCT si.customer
            FROM `tabSales Invoice` si
            {customer_join}
            WHERE si.docstatus = 1
            AND si.company = %(company)s
            AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
            {customer_where}
            {extra_where}
        )
    """, values, as_dict=1)

    # Get weight and items count (no profit)
    items_totals = frappe.db.sql(f"""
        SELECT
            COUNT(*) as total_items_count,
            COUNT(DISTINCT sii.item_code) as unique_items_count,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * COALESCE(item.weight_per_unit, 1) ELSE 0 END), 0) / 1000 as total_weight_tons
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` item ON item.name = sii.item_code
        {customer_join}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        {customer_where}
        {extra_where}
    """, values, as_dict=1)

    inv_data = combined_totals[0] if combined_totals else {}
    balance_data = all_time_balance_query[0] if all_time_balance_query else {}
    items_data = items_totals[0] if items_totals else {}

    return {
        "total_customers": cint(inv_data.get("total_customers", 0)),
        "total_purchase_period": round(flt(inv_data.get("period_sales", 0)) - flt(inv_data.get("period_returns", 0)), 2),
        "total_purchase_all_time": round(flt(inv_data.get("period_sales", 0)) - flt(inv_data.get("period_returns", 0)), 2),
        "total_balance": round(flt(balance_data.get("total_balance", 0)), 2),
        "total_due": round(flt(balance_data.get("total_due", 0)), 2),
        "invoice_count_period": cint(inv_data.get("invoice_count_period", 0)),
        "invoice_count_all_time": cint(inv_data.get("invoice_count_period", 0)),
        "return_count_period": cint(inv_data.get("return_count_period", 0)),
        "return_count_all_time": cint(inv_data.get("return_count_period", 0)),
        "total_weight_tons": round(flt(items_data.get("total_weight_tons", 0)), 3),
        "total_items_count": cint(items_data.get("total_items_count", 0)),
        "unique_items_count": cint(items_data.get("unique_items_count", 0))
    }


def get_customers_sales_data(company, from_date, to_date, values, extra_where, customer_join, customer_where, use_credit_days=False):
    """Get customer sales data using SQL - WITHOUT profit information"""

    # Get all customers with period totals
    period_data = frappe.db.sql(f"""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_net_total ELSE 0 END), 0) as period_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_net_total) ELSE 0 END), 0) as period_returns,
            COUNT(CASE WHEN si.is_return = 0 THEN 1 END) as period_invoice_count,
            COUNT(CASE WHEN si.is_return = 1 THEN 1 END) as period_return_count
        FROM `tabSales Invoice` si
        {customer_join}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        {customer_where}
        {extra_where}
        GROUP BY si.customer
    """, values, as_dict=1)

    if not period_data:
        return []

    customer_list = tuple([d.customer for d in period_data])

    # Get customer names and payment terms
    customer_info = frappe.db.sql("""
        SELECT name, customer_name, payment_terms
        FROM `tabCustomer`
        WHERE name IN %(customers)s
    """, {"customers": customer_list}, as_dict=1)

    customer_names = {c.name: c.customer_name or c.name for c in customer_info}
    customer_payment_terms = {c.name: c.payment_terms for c in customer_info if c.payment_terms}

    # Get credit days from payment terms
    customer_credit_days = {}
    if customer_payment_terms:
        payment_terms_list = tuple(set(customer_payment_terms.values()))
        credit_days_data = frappe.db.sql("""
            SELECT parent, MAX(credit_days) as credit_days
            FROM `tabPayment Terms Template Detail`
            WHERE parent IN %(terms)s
            GROUP BY parent
        """, {"terms": payment_terms_list}, as_dict=1)

        terms_to_days = {d.parent: cint(d.credit_days) for d in credit_days_data if cint(d.credit_days) > 0}
        for cust, terms in customer_payment_terms.items():
            if terms in terms_to_days:
                customer_credit_days[cust] = terms_to_days[terms]

    # Get credit limits
    credit_limit_data = frappe.db.sql("""
        SELECT parent as customer, credit_limit, company
        FROM `tabCustomer Credit Limit`
        WHERE parent IN %(customers)s
        AND (company = %(company)s OR company IS NULL OR company = '')
        ORDER BY CASE WHEN company = %(company)s THEN 0 ELSE 1 END
    """, {"customers": customer_list, "company": company}, as_dict=1)

    customer_credit_limits = {}
    for cl in credit_limit_data:
        if cl.customer not in customer_credit_limits and flt(cl.credit_limit) > 0:
            customer_credit_limits[cl.customer] = flt(cl.credit_limit)

    # All-time totals + due amounts
    all_time_data = frappe.db.sql("""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_net_total ELSE 0 END), 0) as all_time_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_net_total) ELSE 0 END), 0) as all_time_returns,
            COALESCE(SUM(si.outstanding_amount), 0) as total_balance,
            COUNT(CASE WHEN si.is_return = 0 THEN 1 END) as all_time_invoice_count,
            COUNT(CASE WHEN si.is_return = 1 THEN 1 END) as all_time_return_count,
            COALESCE(SUM(CASE WHEN si.outstanding_amount > 0 AND si.due_date <= CURDATE() THEN si.outstanding_amount ELSE 0 END), 0) as total_due
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)

    all_time_map = {d.customer: d for d in all_time_data}

    # Top item groups
    top_item_groups = frappe.db.sql(f"""
        SELECT
            si.customer,
            i.item_group,
            COUNT(*) as item_count,
            ROUND(SUM(sii.base_net_amount), 2) as group_amount
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` i ON i.name = sii.item_code
        {customer_join}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND si.customer IN %(customers)s
        AND si.is_return = 0
        {customer_where}
        {extra_where}
        GROUP BY si.customer, i.item_group
        ORDER BY si.customer, group_amount DESC
    """, {**values, "customers": customer_list}, as_dict=1)

    top_group_map = defaultdict(list)
    for row in top_item_groups:
        if len(top_group_map[row.customer]) < 2:
            top_group_map[row.customer].append({
                "item_group": row.item_group or "غير محدد",
                "item_count": row.item_count,
                "group_amount": row.group_amount
            })

    # Invoice dates
    invoice_dates = frappe.db.sql("""
        SELECT
            si.customer,
            MIN(si.posting_date) as first_invoice_date,
            MAX(si.posting_date) as last_invoice_date
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        AND si.is_return = 0
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)

    invoice_dates_map = {d.customer: d for d in invoice_dates}

    # Last invoice before period (no profit)
    last_invoice_details = frappe.db.sql("""
        SELECT
            si.customer,
            si.name as last_invoice_id,
            si.posting_date as last_invoice_date,
            si.base_grand_total as last_invoice_amount
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        AND si.is_return = 0
        AND si.posting_date < %(from_date)s
        AND si.posting_date = (
            SELECT MAX(si2.posting_date)
            FROM `tabSales Invoice` si2
            WHERE si2.customer = si.customer
            AND si2.docstatus = 1
            AND si2.company = %(company)s
            AND si2.is_return = 0
            AND si2.posting_date < %(from_date)s
        )
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list, "from_date": from_date}, as_dict=1)

    last_invoice_map = {d.customer: d for d in last_invoice_details}

    # Get items data (no profit)
    items_data = get_all_customer_items_batch(values, extra_where, customer_join, customer_where, customer_list)

    # Build result
    result = []
    for pd in period_data:
        cust = pd.customer

        at = all_time_map.get(cust, {})
        all_time_sales = flt(at.get("all_time_sales", 0))
        all_time_returns = flt(at.get("all_time_returns", 0))

        top_groups = top_group_map.get(cust, [])
        top_group = top_groups[0] if len(top_groups) > 0 else {}
        top_group_2 = top_groups[1] if len(top_groups) > 1 else {}

        inv_dates = invoice_dates_map.get(cust, {})
        last_inv = last_invoice_map.get(cust, {})

        cust_items = items_data.get(cust, [])
        total_weight_tons = sum(flt(item.get("weight_in_tons", 0)) for item in cust_items)
        total_items_count = len(cust_items)
        unique_items_count = len(set(item.get("item_code") for item in cust_items if item.get("item_code")))

        unique_branches = list(set(item.get("invoice_branch") for item in cust_items if item.get("invoice_branch")))
        unique_creators = list(set(item.get("invoice_creator") for item in cust_items if item.get("invoice_creator")))

        credit_days = customer_credit_days.get(cust, 0)
        credit_limit = customer_credit_limits.get(cust, 0)
        total_balance = flt(at.get("total_balance", 0))
        credit_remaining = max(0, credit_limit - total_balance)

        result.append({
            "customer": cust,
            "customer_name": customer_names.get(cust, cust),
            "credit_limit": credit_limit,
            "credit_remaining": credit_remaining,
            "credit_days": credit_days,
            "total_purchase_all_time": all_time_sales - all_time_returns,
            "total_purchase_period": flt(pd.period_sales) - flt(pd.period_returns),
            "total_balance": total_balance,
            "total_due": flt(at.get("total_due", 0)),
            "invoice_count_all_time": cint(at.get("all_time_invoice_count", 0)),
            "return_count_all_time": cint(at.get("all_time_return_count", 0)),
            "total_returns_all_time": all_time_returns,
            "invoice_count_period": cint(pd.period_invoice_count),
            "return_count_period": cint(pd.period_return_count),
            "total_returns_period": flt(pd.period_returns),
            "top_item_group": top_group.get("item_group", ""),
            "top_group_amount": flt(top_group.get("group_amount", 0)),
            "top_item_group_2": top_group_2.get("item_group", ""),
            "top_group_amount_2": flt(top_group_2.get("group_amount", 0)),
            "first_invoice_date": str(inv_dates.get("first_invoice_date", "")) if inv_dates.get("first_invoice_date") else "",
            "last_invoice_date": str(last_inv.get("last_invoice_date", "")) if last_inv.get("last_invoice_date") else "",
            "last_invoice_id": last_inv.get("last_invoice_id", ""),
            "last_invoice_amount": flt(last_inv.get("last_invoice_amount", 0)),
            "total_weight_tons": flt(total_weight_tons, 3),
            "total_items_count": total_items_count,
            "unique_items_count": unique_items_count,
            "unique_branches": unique_branches,
            "unique_creators": unique_creators,
            "items": cust_items
        })

    result.sort(key=lambda x: x.get("customer_name", ""))
    return result


def get_all_customer_items_batch(values, extra_where, customer_join, customer_where, customer_list):
    """Get items sold to all customers using SQL - WITHOUT profit"""

    items = frappe.db.sql(f"""
        SELECT
            si.customer,
            si.name as invoice_id,
            si.posting_date,
            si.owner as invoice_owner,
            si.branch as invoice_branch,
            si.base_grand_total as invoice_grand_total,
            si.outstanding_amount as invoice_outstanding_amount,
            sii.item_code,
            sii.item_name,
            sii.uom as invoice_uom,
            sii.stock_uom,
            sii.qty,
            sii.stock_qty,
            sii.base_net_amount as total_amount,
            COALESCE(sii.base_net_amount * (si.base_total_taxes_and_charges / NULLIF(si.base_net_total, 0)), 0) as tax_amount,
            COALESCE(item.weight_per_unit, 1) as weight_per_unit
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` item ON item.name = sii.item_code
        {customer_join}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND si.customer IN %(customers)s
        AND si.is_return = 0
        {customer_where}
        {extra_where}
        ORDER BY si.customer, si.posting_date DESC, si.name
    """, {**values, "customers": customer_list}, as_dict=1)

    if not items:
        return {}

    # Get unique item codes and owners
    item_codes = list(set([i.item_code for i in items]))
    owner_list = list(set([i.invoice_owner for i in items if i.invoice_owner]))

    # Batch get owner names
    owner_names = {}
    if owner_list:
        owner_data = frappe.db.sql("""
            SELECT name, full_name FROM `tabUser` WHERE name IN %(owners)s
        """, {"owners": tuple(owner_list)}, as_dict=1)
        owner_names = {d.name: d.full_name or d.name for d in owner_data}

    # Batch get stock levels
    stock_map = {}
    if item_codes:
        stock_data = frappe.db.sql("""
            SELECT
                b.item_code,
                COALESCE(SUM(b.actual_qty), 0) as available_qty
            FROM `tabBin` b
            WHERE b.item_code IN %(items)s
            GROUP BY b.item_code
        """, {"items": tuple(item_codes)}, as_dict=1)
        stock_map = {d.item_code: d.available_qty for d in stock_data}

    # Group items by customer
    customer_items = defaultdict(list)
    for item in items:
        cust = item.customer

        weight_per_unit_kg = flt(item.weight_per_unit) or 1
        total_weight_kg = flt(item.stock_qty) * weight_per_unit_kg
        weight_in_tons = total_weight_kg / 1000

        rate_per_ton = flt(item.total_amount) / weight_in_tons if weight_in_tons > 0 else 0
        creator_name = owner_names.get(item.invoice_owner, item.invoice_owner or "")

        tax_amount = flt(item.tax_amount, 2)
        total_after_tax = flt(item.total_amount, 2) + tax_amount

        customer_items[cust].append({
            "invoice_id": item.invoice_id,
            "posting_date": str(item.posting_date) if item.posting_date else "",
            "invoice_creator": creator_name,
            "invoice_branch": item.invoice_branch or "",
            "item_code": item.item_code,
            "item_name": item.item_name,
            "invoice_uom": item.invoice_uom,
            "stock_uom": item.stock_uom,
            "qty": flt(item.qty, 3),
            "stock_qty": flt(item.stock_qty, 3),
            "weight_per_unit_kg": weight_per_unit_kg,
            "total_weight_kg": flt(total_weight_kg, 2),
            "weight_in_tons": flt(weight_in_tons, 4),
            "total_amount": flt(item.total_amount, 2),
            "tax_amount": tax_amount,
            "total_after_tax": total_after_tax,
            "rate_per_ton": flt(rate_per_ton, 2),
            "current_stock": flt(stock_map.get(item.item_code, 0), 3),
            "invoice_grand_total": flt(item.invoice_grand_total, 2),
            "invoice_outstanding_amount": flt(item.invoice_outstanding_amount, 2)
        })

    return dict(customer_items)
