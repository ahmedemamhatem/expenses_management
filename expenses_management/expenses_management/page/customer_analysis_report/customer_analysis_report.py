# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import today, getdate, flt, cint
from collections import defaultdict


@frappe.whitelist()
def get_filter_options():
    """Get options for report filters using cached queries"""

    companies = frappe.db.get_list("Company", pluck="name", cache=True)
    branches = frappe.db.get_list("Branch", pluck="name", cache=True)

    customers = frappe.db.get_list(
        "Customer",
        filters={"disabled": 0},
        fields=["name", "customer_name"],
        order_by="customer_name",
        cache=True
    )

    pos_profiles = frappe.db.get_list(
        "POS Profile",
        filters={"disabled": 0},
        pluck="name",
        cache=True
    )

    customer_groups = frappe.db.get_list("Customer Group", pluck="name", cache=True)
    territories = frappe.db.get_list("Territory", pluck="name", cache=True)
    sales_persons = frappe.db.get_list("Sales Person", pluck="name", cache=True)

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
    """Get customer analysis report data - optimized version"""

    if not company:
        frappe.throw(_("Company is required"))

    # Convert use_credit_days to boolean
    use_credit_days = use_credit_days in [True, 'true', '1', 1]

    if not from_date:
        from_date = today()
    if not to_date:
        to_date = today()

    from_date = getdate(from_date)
    to_date = getdate(to_date)

    values = {
        "company": company,
        "from_date": from_date,
        "to_date": to_date
    }

    extra_conditions = []
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
        extra_conditions.append("c.customer_group = %(customer_group)s")
        values["customer_group"] = customer_group
    if territory:
        extra_conditions.append("c.territory = %(territory)s")
        values["territory"] = territory
    if sales_person:
        extra_conditions.append("EXISTS (SELECT 1 FROM `tabSales Team` st WHERE st.parent = si.name AND st.sales_person = %(sales_person)s)")
        values["sales_person"] = sales_person

    if payment_status:
        values["payment_status"] = payment_status
        if payment_status == "paid":
            extra_conditions.append("si.outstanding_amount = 0")
        elif payment_status == "credit":
            extra_conditions.append("si.outstanding_amount > 0 AND si.outstanding_amount < si.grand_total")
        elif payment_status == "unpaid":
            extra_conditions.append("si.outstanding_amount = si.grand_total AND si.outstanding_amount > 0")

    extra_where = (" AND " + " AND ".join(extra_conditions)) if extra_conditions else ""

    customers_data = get_customers_analysis_optimized(values, extra_where, use_credit_days)

    # Calculate period totals directly from invoices (with all filters applied)
    period_totals = calculate_period_totals_from_invoices(values, extra_where)

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


def calculate_period_totals_from_invoices(values, extra_where):
    """Calculate totals directly from invoices with all filters applied - OPTIMIZED"""

    customer_join = ""
    if "customer_group" in values or "territory" in values:
        customer_join = "LEFT JOIN `tabCustomer` c ON c.name = si.customer"

    # Combined query for invoice totals, due amounts, and basic stats
    # Using base_net_total to exclude taxes from purchase totals
    combined_totals = frappe.db.sql(f"""
        SELECT
            COUNT(DISTINCT si.customer) as total_customers,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_net_total ELSE 0 END), 0) as period_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_net_total) ELSE 0 END), 0) as period_returns,
            COALESCE(SUM(si.outstanding_amount), 0) as total_balance,
            COUNT(CASE WHEN si.is_return = 0 THEN 1 END) as invoice_count_period,
            COUNT(CASE WHEN si.is_return = 1 THEN 1 END) as return_count_period,
            COALESCE(SUM(CASE WHEN si.outstanding_amount > 0 AND si.due_date <= CURDATE() THEN si.outstanding_amount ELSE 0 END), 0) as total_due
        FROM `tabSales Invoice` si
        {customer_join}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        {extra_where}
    """, values, as_dict=1)

    inv_data = combined_totals[0] if combined_totals else {}

    # Combined query for revenue, cost, weight, and items
    revenue_items_totals = frappe.db.sql(f"""
        SELECT
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.base_net_amount ELSE -sii.base_net_amount END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * sii.incoming_rate ELSE -sii.stock_qty * sii.incoming_rate END), 0) as cost_of_goods,
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
        {extra_where}
    """, values, as_dict=1)

    rev_data = revenue_items_totals[0] if revenue_items_totals else {}

    net_sales = flt(rev_data.get("net_sales", 0))
    cost_of_goods = flt(rev_data.get("cost_of_goods", 0))
    revenue_period = net_sales - cost_of_goods

    return {
        "total_customers": cint(inv_data.get("total_customers", 0)),
        "total_purchase_period": round(flt(inv_data.get("period_sales", 0)) - flt(inv_data.get("period_returns", 0)), 2),
        "total_purchase_all_time": round(flt(inv_data.get("period_sales", 0)) - flt(inv_data.get("period_returns", 0)), 2),
        "total_balance": round(flt(inv_data.get("total_balance", 0)), 2),
        "total_due": round(flt(inv_data.get("total_due", 0)), 2),
        "revenue_period": round(revenue_period, 2),
        "revenue_all_time": round(revenue_period, 2),
        "invoice_count_period": cint(inv_data.get("invoice_count_period", 0)),
        "invoice_count_all_time": cint(inv_data.get("invoice_count_period", 0)),
        "return_count_period": cint(inv_data.get("return_count_period", 0)),
        "return_count_all_time": cint(inv_data.get("return_count_period", 0)),
        "total_weight_tons": round(flt(rev_data.get("total_weight_tons", 0)), 3),
        "total_items_count": cint(rev_data.get("total_items_count", 0)),
        "unique_items_count": cint(rev_data.get("unique_items_count", 0))
    }


def get_customers_analysis_optimized(values, extra_where, use_credit_days=False):
    """Get detailed analysis for all customers using batch queries - OPTIMIZED"""
    from datetime import timedelta

    company = values["company"]
    from_date = values["from_date"]
    to_date = values["to_date"]

    customer_join = ""
    customer_join_sii = ""
    if "customer_group" in values or "territory" in values:
        customer_join = "LEFT JOIN `tabCustomer` c ON c.name = si.customer"
        customer_join_sii = "LEFT JOIN `tabCustomer` c ON c.name = si.customer"

    # Get customer credit days for display (but always use selected date filters)
    customer_credit_days_map = {}
    # Get all customers with their payment terms first
    all_customers_terms = frappe.db.sql("""
        SELECT c.name, c.payment_terms
        FROM `tabCustomer` c
        WHERE c.disabled = 0
        AND c.payment_terms IS NOT NULL AND c.payment_terms != ''
    """, as_dict=1)

    if all_customers_terms:
        payment_terms_list = list(set([c.payment_terms for c in all_customers_terms if c.payment_terms]))
        if payment_terms_list:
            credit_days_data = frappe.db.sql("""
                SELECT parent, MAX(credit_days) as credit_days
                FROM `tabPayment Terms Template Detail`
                WHERE parent IN %(terms)s
                GROUP BY parent
            """, {"terms": tuple(payment_terms_list)}, as_dict=1)

            terms_to_days = {d.parent: cint(d.credit_days) for d in credit_days_data if cint(d.credit_days) > 0}
            for cust in all_customers_terms:
                if cust.payment_terms in terms_to_days:
                    customer_credit_days_map[cust.name] = terms_to_days[cust.payment_terms]

    # BATCH 1: Get all customers with period totals - ALWAYS use selected date filters
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
        {extra_where}
        GROUP BY si.customer
    """, values, as_dict=1)

    if not period_data:
        return []

    customer_list = tuple([d.customer for d in period_data])

    # BATCH 2: Get customer names and payment terms in ONE query
    customer_info = frappe.db.sql("""
        SELECT name, customer_name, payment_terms
        FROM `tabCustomer`
        WHERE name IN %(customers)s
    """, {"customers": customer_list}, as_dict=1)

    customer_names = {c.name: c.customer_name or c.name for c in customer_info}
    customer_payment_terms = {c.name: c.payment_terms for c in customer_info if c.payment_terms}

    # BATCH 3: Get credit days from payment terms templates in ONE query
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

    # BATCH 4: Get credit limits in ONE query
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

    # BATCH 5: All-time totals + due amounts combined
    # Using base_net_total to exclude taxes from purchase totals
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

    # BATCH 6: All-time revenue with qty
    all_time_revenue = frappe.db.sql("""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.base_net_amount ELSE -sii.base_net_amount END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * sii.incoming_rate ELSE -sii.stock_qty * sii.incoming_rate END), 0) as cost_of_goods,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.qty ELSE 0 END), 0) as total_qty
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)

    all_time_revenue_map = {d.customer: d for d in all_time_revenue}

    # BATCH 7: Period revenue
    period_revenue = frappe.db.sql(f"""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.base_net_amount ELSE -sii.base_net_amount END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * sii.incoming_rate ELSE -sii.stock_qty * sii.incoming_rate END), 0) as cost_of_goods
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        {customer_join_sii}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND si.customer IN %(customers)s
        {extra_where}
        GROUP BY si.customer
    """, {**values, "customers": customer_list}, as_dict=1)

    period_revenue_map = {d.customer: d for d in period_revenue}

    # BATCH 8: Top item groups + invoice dates + last invoice combined
    top_item_groups = frappe.db.sql(f"""
        SELECT
            si.customer,
            i.item_group,
            COUNT(*) as item_count,
            ROUND(SUM(sii.base_net_amount), 2) as group_amount
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` i ON i.name = sii.item_code
        {customer_join_sii}
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND si.customer IN %(customers)s
        AND si.is_return = 0
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

    # BATCH 9: Invoice dates
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

    # BATCH 10: Last invoice details - optimized with window function approach
    last_invoice_details = frappe.db.sql("""
        SELECT
            t.customer,
            t.last_invoice_id,
            t.last_invoice_date,
            t.last_invoice_amount,
            COALESCE(SUM(sii.base_net_amount - (sii.stock_qty * sii.incoming_rate)), 0) as last_invoice_profit
        FROM (
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
            AND si.posting_date = (
                SELECT MAX(si2.posting_date)
                FROM `tabSales Invoice` si2
                WHERE si2.customer = si.customer
                AND si2.docstatus = 1
                AND si2.company = %(company)s
                AND si2.is_return = 0
            )
            GROUP BY si.customer
        ) t
        LEFT JOIN `tabSales Invoice Item` sii ON sii.parent = t.last_invoice_id
        GROUP BY t.customer, t.last_invoice_id, t.last_invoice_date, t.last_invoice_amount
    """, {"company": company, "customers": customer_list}, as_dict=1)

    last_invoice_map = {d.customer: d for d in last_invoice_details}

    # BATCH 11: Credit days data - batch all customers with credit days
    credit_days_data = {}
    customers_with_credit_days = [c for c in customer_list if c in customer_credit_days]

    if customers_with_credit_days:
        # Group customers by their credit days value to batch similar ones
        days_to_customers = defaultdict(list)
        for cust in customers_with_credit_days:
            days_to_customers[customer_credit_days[cust]].append(cust)

        for days, custs in days_to_customers.items():
            custs_tuple = tuple(custs)

            # Batch query for all customers with same credit days
            # Using base_net_total to exclude taxes from purchase totals
            cd_batch = frappe.db.sql("""
                SELECT
                    si.customer,
                    COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_net_total ELSE 0 END), 0) as credit_period_sales,
                    COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_net_total) ELSE 0 END), 0) as credit_period_returns,
                    COUNT(CASE WHEN si.is_return = 0 THEN 1 END) as credit_period_invoice_count,
                    COUNT(CASE WHEN si.is_return = 1 THEN 1 END) as credit_period_return_count
                FROM `tabSales Invoice` si
                WHERE si.docstatus = 1
                AND si.company = %(company)s
                AND si.customer IN %(customers)s
                AND si.posting_date >= DATE_SUB(CURDATE(), INTERVAL %(days)s DAY)
                GROUP BY si.customer
            """, {"company": company, "customers": custs_tuple, "days": days}, as_dict=1)

            cd_revenue_batch = frappe.db.sql("""
                SELECT
                    si.customer,
                    COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.base_net_amount ELSE -sii.base_net_amount END), 0) as net_sales,
                    COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * sii.incoming_rate ELSE -sii.stock_qty * sii.incoming_rate END), 0) as cost_of_goods,
                    COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.qty ELSE 0 END), 0) as total_qty
                FROM `tabSales Invoice Item` sii
                INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
                WHERE si.docstatus = 1
                AND si.company = %(company)s
                AND si.customer IN %(customers)s
                AND si.posting_date >= DATE_SUB(CURDATE(), INTERVAL %(days)s DAY)
                GROUP BY si.customer
            """, {"company": company, "customers": custs_tuple, "days": days}, as_dict=1)

            cd_map = {d.customer: d for d in cd_batch}
            cr_map = {d.customer: d for d in cd_revenue_batch}

            for cust in custs:
                cd = cd_map.get(cust, {})
                cr = cr_map.get(cust, {})
                credit_days_data[cust] = {
                    "purchases": flt(cd.get("credit_period_sales", 0)) - flt(cd.get("credit_period_returns", 0)),
                    "invoice_count": cint(cd.get("credit_period_invoice_count", 0)),
                    "return_count": cint(cd.get("credit_period_return_count", 0)),
                    "returns_amount": flt(cd.get("credit_period_returns", 0)),
                    "total_qty": flt(cr.get("total_qty", 0)),
                    "profit": flt(cr.get("net_sales", 0)) - flt(cr.get("cost_of_goods", 0))
                }

    # BATCH 12: Get all items data
    # Pass use_credit_days and credit_days_map for filtering items by credit period
    items_data = get_all_customer_items_batch(values, extra_where, customer_list, use_credit_days, customer_credit_days)

    # Build result
    result = []
    for pd in period_data:
        cust = pd.customer

        at = all_time_map.get(cust, {})
        all_time_sales = flt(at.get("all_time_sales", 0))
        all_time_returns = flt(at.get("all_time_returns", 0))

        atr = all_time_revenue_map.get(cust, {})
        pr = period_revenue_map.get(cust, {})

        all_time_revenue_value = flt(atr.get("net_sales", 0)) - flt(atr.get("cost_of_goods", 0))
        period_revenue_value = flt(pr.get("net_sales", 0)) - flt(pr.get("cost_of_goods", 0))

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
        cd_info = credit_days_data.get(cust, {})

        # Calculate credit remaining (credit_limit - balance), minimum 0
        credit_limit = customer_credit_limits.get(cust, 0)
        total_balance = flt(at.get("total_balance", 0))
        credit_remaining = max(0, credit_limit - total_balance)

        result.append({
            "customer": cust,
            "customer_name": customer_names.get(cust, cust),
            "credit_limit": credit_limit,
            "credit_remaining": credit_remaining,
            "credit_days": credit_days,
            "credit_days_purchases": flt(cd_info.get("purchases", 0)),
            "credit_days_profit": flt(cd_info.get("profit", 0)),
            "credit_days_invoice_count": cint(cd_info.get("invoice_count", 0)),
            "credit_days_return_count": cint(cd_info.get("return_count", 0)),
            "credit_days_returns_amount": flt(cd_info.get("returns_amount", 0)),
            "credit_days_total_qty": flt(cd_info.get("total_qty", 0)),
            "total_purchase_all_time": all_time_sales - all_time_returns,
            "total_purchase_period": flt(pd.period_sales) - flt(pd.period_returns),
            "total_balance": flt(at.get("total_balance", 0)),
            "total_due": flt(at.get("total_due", 0)),
            "revenue_all_time": all_time_revenue_value,
            "revenue_period": period_revenue_value,
            "invoice_count_all_time": cint(at.get("all_time_invoice_count", 0)),
            "return_count_all_time": cint(at.get("all_time_return_count", 0)),
            "total_returns_all_time": all_time_returns,
            "total_qty_all_time": flt(atr.get("total_qty", 0)),
            "invoice_count_period": cint(pd.period_invoice_count),
            "return_count_period": cint(pd.period_return_count),
            "total_returns_period": flt(pd.period_returns),
            "top_item_group": top_group.get("item_group", ""),
            "top_group_amount": flt(top_group.get("group_amount", 0)),
            "top_item_group_2": top_group_2.get("item_group", ""),
            "top_group_amount_2": flt(top_group_2.get("group_amount", 0)),
            "first_invoice_date": str(inv_dates.get("first_invoice_date", "")) if inv_dates.get("first_invoice_date") else "",
            "last_invoice_date": str(inv_dates.get("last_invoice_date", "")) if inv_dates.get("last_invoice_date") else "",
            "last_invoice_id": last_inv.get("last_invoice_id", ""),
            "last_invoice_amount": flt(last_inv.get("last_invoice_amount", 0)),
            "last_invoice_profit": flt(last_inv.get("last_invoice_profit", 0)),
            "total_weight_tons": flt(total_weight_tons, 3),
            "total_items_count": total_items_count,
            "unique_items_count": unique_items_count,
            "unique_branches": unique_branches,
            "unique_creators": unique_creators,
            "items": cust_items
        })

    result.sort(key=lambda x: x.get("customer_name", ""))

    return result


def get_all_customer_items_batch(values, extra_where, customer_list, use_credit_days=False, customer_credit_days=None):
    """Get items sold to all customers in single batch query - OPTIMIZED"""

    customer_join = ""
    if "customer_group" in values or "territory" in values:
        customer_join = "LEFT JOIN `tabCustomer` c ON c.name = si.customer"

    # ALWAYS use selected date filters - get all items with invoice details
    items = frappe.db.sql(f"""
        SELECT
            si.customer,
            si.name as invoice_id,
            si.posting_date,
            si.owner as invoice_owner,
            si.branch as invoice_branch,
            sii.item_code,
            sii.item_name,
            sii.uom as invoice_uom,
            sii.stock_uom,
            sii.qty,
            sii.stock_qty,
            sii.base_net_amount as total_amount,
            COALESCE(sii.base_net_amount * (si.base_total_taxes_and_charges / NULLIF(si.base_net_total, 0)), 0) as tax_amount,
            sii.stock_qty * sii.incoming_rate as cost_of_goods,
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
        revenue = flt(item.total_amount) - flt(item.cost_of_goods)

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
            "cost_of_goods": flt(item.cost_of_goods, 2),
            "rate_per_ton": flt(rate_per_ton, 2),
            "revenue": flt(revenue, 2),
            "current_stock": flt(stock_map.get(item.item_code, 0), 3)
        })

    return dict(customer_items)
