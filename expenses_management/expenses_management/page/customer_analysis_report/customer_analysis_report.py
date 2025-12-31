# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import today, getdate, flt, cint


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
                    customer_group=None, territory=None, sales_person=None):
    """Get customer analysis report data"""

    if not company:
        frappe.throw(_("Company is required"))

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

    extra_where = (" AND " + " AND ".join(extra_conditions)) if extra_conditions else ""

    customers_data = get_customers_analysis_optimized(values, extra_where)

    return {
        "customers": customers_data,
        "filters": {
            "company": company,
            "from_date": str(from_date),
            "to_date": str(to_date),
            "branch": branch,
            "customer": customer,
            "pos_profile": pos_profile,
            "customer_group": customer_group,
            "territory": territory,
            "sales_person": sales_person
        }
    }


def get_customers_analysis_optimized(values, extra_where):
    """Get detailed analysis for all customers using batch queries"""

    company = values["company"]
    from_date = values["from_date"]
    to_date = values["to_date"]

    # Add customer join if filtering by customer_group or territory
    customer_join = ""
    if "customer_group" in values or "territory" in values:
        customer_join = "LEFT JOIN `tabCustomer` c ON c.name = si.customer"

    # BATCH 1: Get all customers with period totals
    period_data = frappe.db.sql(f"""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_grand_total ELSE 0 END), 0) as period_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_grand_total) ELSE 0 END), 0) as period_returns,
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
    
    customer_list = [d.customer for d in period_data]
    
    # Get customer names using cached doc
    customer_names = {}
    for cust in customer_list:
        customer_names[cust] = frappe.get_cached_value("Customer", cust, "customer_name") or cust
    
    # BATCH 2: All-time totals
    all_time_data = frappe.db.sql("""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN si.base_grand_total ELSE 0 END), 0) as all_time_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 1 THEN ABS(si.base_grand_total) ELSE 0 END), 0) as all_time_returns,
            COALESCE(SUM(si.outstanding_amount), 0) as total_balance,
            COUNT(CASE WHEN si.is_return = 0 THEN 1 END) as all_time_invoice_count,
            COUNT(CASE WHEN si.is_return = 1 THEN 1 END) as all_time_return_count
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)
    
    all_time_map = {d.customer: d for d in all_time_data}
    
    # BATCH 3: Due amounts
    due_data = frappe.db.sql("""
        SELECT
            si.customer,
            COALESCE(SUM(si.outstanding_amount), 0) as total_due
        FROM `tabSales Invoice` si
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        AND si.outstanding_amount > 0
        AND si.due_date <= CURDATE()
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)
    
    due_map = {d.customer: d.total_due for d in due_data}
    
    # BATCH 4: All-time revenue
    all_time_revenue = frappe.db.sql("""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.base_net_amount ELSE -sii.base_net_amount END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * sii.incoming_rate ELSE -sii.stock_qty * sii.incoming_rate END), 0) as cost_of_goods
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.customer IN %(customers)s
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)
    
    all_time_revenue_map = {d.customer: d for d in all_time_revenue}
    
    # BATCH 5: Period revenue
    period_revenue = frappe.db.sql(f"""
        SELECT
            si.customer,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.base_net_amount ELSE -sii.base_net_amount END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN si.is_return = 0 THEN sii.stock_qty * sii.incoming_rate ELSE -sii.stock_qty * sii.incoming_rate END), 0) as cost_of_goods
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND si.customer IN %(customers)s
        {extra_where}
        GROUP BY si.customer
    """, {**values, "customers": customer_list}, as_dict=1)
    
    period_revenue_map = {d.customer: d for d in period_revenue}
    
    # BATCH 6: Get all items
    items_data = get_all_customer_items_batch(values, extra_where, customer_list)

    # BATCH 7: Get top item groups per customer
    top_item_groups = frappe.db.sql(f"""
        SELECT
            si.customer,
            i.item_group,
            COUNT(*) as item_count,
            ROUND(SUM(sii.base_net_amount), 2) as group_amount
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` i ON i.name = sii.item_code
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND si.customer IN %(customers)s
        AND si.is_return = 0
        {extra_where}
        GROUP BY si.customer, i.item_group
        ORDER BY si.customer, group_amount DESC
    """, {**values, "customers": customer_list}, as_dict=1)

    # Map top item group per customer
    top_group_map = {}
    for row in top_item_groups:
        if row.customer not in top_group_map:
            top_group_map[row.customer] = {
                "item_group": row.item_group or "غير محدد",
                "item_count": row.item_count,
                "group_amount": row.group_amount
            }

    # BATCH 8: Get first and last invoice dates per customer
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

    # BATCH 9: Get last invoice details per customer (amount and profit)
    last_invoice_details = frappe.db.sql("""
        SELECT
            si.customer,
            si.name as last_invoice_id,
            si.posting_date as last_invoice_date,
            si.base_grand_total as last_invoice_amount,
            COALESCE(
                (SELECT SUM(sii.base_net_amount - (sii.stock_qty * sii.incoming_rate))
                 FROM `tabSales Invoice Item` sii
                 WHERE sii.parent = si.name), 0
            ) as last_invoice_profit
        FROM `tabSales Invoice` si
        INNER JOIN (
            SELECT customer, MAX(posting_date) as max_date
            FROM `tabSales Invoice`
            WHERE docstatus = 1
            AND company = %(company)s
            AND customer IN %(customers)s
            AND is_return = 0
            GROUP BY customer
        ) latest ON si.customer = latest.customer AND si.posting_date = latest.max_date
        WHERE si.docstatus = 1
        AND si.company = %(company)s
        AND si.is_return = 0
        GROUP BY si.customer
    """, {"company": company, "customers": customer_list}, as_dict=1)

    last_invoice_map = {d.customer: d for d in last_invoice_details}

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

        # Get top item group for this customer
        top_group = top_group_map.get(cust, {})

        # Get invoice dates for this customer
        inv_dates = invoice_dates_map.get(cust, {})

        # Get last invoice details
        last_inv = last_invoice_map.get(cust, {})

        # Calculate total weight sold in period
        cust_items = items_data.get(cust, [])
        total_weight_tons = sum(flt(item.get("weight_in_tons", 0)) for item in cust_items)
        total_items_count = len(cust_items)
        unique_items_count = len(set(item.get("item_code") for item in cust_items if item.get("item_code")))

        result.append({
            "customer": cust,
            "customer_name": customer_names.get(cust, cust),
            "total_purchase_all_time": all_time_sales - all_time_returns,
            "total_purchase_period": flt(pd.period_sales) - flt(pd.period_returns),
            "total_balance": flt(at.get("total_balance", 0)),
            "total_due": flt(due_map.get(cust, 0)),
            "revenue_all_time": all_time_revenue_value,
            "revenue_period": period_revenue_value,
            "invoice_count_all_time": cint(at.get("all_time_invoice_count", 0)),
            "return_count_all_time": cint(at.get("all_time_return_count", 0)),
            "invoice_count_period": cint(pd.period_invoice_count),
            "return_count_period": cint(pd.period_return_count),
            "top_item_group": top_group.get("item_group", ""),
            "top_group_amount": flt(top_group.get("group_amount", 0)),
            "first_invoice_date": str(inv_dates.get("first_invoice_date", "")) if inv_dates.get("first_invoice_date") else "",
            "last_invoice_date": str(inv_dates.get("last_invoice_date", "")) if inv_dates.get("last_invoice_date") else "",
            "last_invoice_id": last_inv.get("last_invoice_id", ""),
            "last_invoice_amount": flt(last_inv.get("last_invoice_amount", 0)),
            "last_invoice_profit": flt(last_inv.get("last_invoice_profit", 0)),
            "total_weight_tons": flt(total_weight_tons, 3),
            "total_items_count": total_items_count,
            "unique_items_count": unique_items_count,
            "items": cust_items
        })
    
    result.sort(key=lambda x: x.get("customer_name", ""))
    
    return result


def get_all_customer_items_batch(values, extra_where, customer_list):
    """Get items sold to all customers in single batch query - excludes returns"""

    # BATCH: Get all items with invoice details (not grouped to show invoice IDs)
    # Only get sales invoices (is_return = 0), exclude returns
    items = frappe.db.sql(f"""
        SELECT
            si.customer,
            si.name as invoice_id,
            si.posting_date,
            sii.item_code,
            sii.item_name,
            sii.uom as invoice_uom,
            sii.stock_uom,
            sii.qty,
            sii.stock_qty,
            sii.base_net_amount as total_amount,
            sii.stock_qty * sii.incoming_rate as cost_of_goods
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
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
    
    # Get unique item codes
    item_codes = list(set([i.item_code for i in items]))
    
    # Get item details using cached values (weight_per_unit and weight_uom)
    item_weights = {}
    for item_code in item_codes:
        weight_per_unit = flt(frappe.get_cached_value("Item", item_code, "weight_per_unit")) or 0
        weight_uom = frappe.get_cached_value("Item", item_code, "weight_uom") or "Kg"
        item_weights[item_code] = {
            "weight_per_unit": weight_per_unit,
            "weight_uom": weight_uom
        }
    
    # Get stock levels in batch
    stock_map = get_stock_levels_batch(item_codes)
    
    # Group items by customer
    customer_items = {}
    for item in items:
        cust = item.customer
        if cust not in customer_items:
            customer_items[cust] = []

        revenue = flt(item.total_amount) - flt(item.cost_of_goods)

        # Get weight info - weight_per_unit is in KG
        weight_info = item_weights.get(item.item_code, {"weight_per_unit": 0, "weight_uom": "Kg"})
        weight_per_unit_kg = flt(weight_info["weight_per_unit"])

        # If weight_per_unit is 0 or not set, default to 1 kg
        if not weight_per_unit_kg or weight_per_unit_kg == 0:
            weight_per_unit_kg = 1

        # Calculate total weight in kg (stock_qty * weight_per_unit in kg)
        total_weight_kg = flt(item.stock_qty) * weight_per_unit_kg

        # Convert kg to tons (1 ton = 1000 kg)
        weight_in_tons = total_weight_kg / 1000

        # Calculate rate per ton
        rate_per_ton = 0
        if weight_in_tons > 0:
            rate_per_ton = flt(item.total_amount) / weight_in_tons

        customer_items[cust].append({
            "invoice_id": item.invoice_id,
            "posting_date": str(item.posting_date) if item.posting_date else "",
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
            "cost_of_goods": flt(item.cost_of_goods, 2),
            "rate_per_ton": flt(rate_per_ton, 2),
            "revenue": flt(revenue, 2),
            "current_stock": flt(stock_map.get(item.item_code, 0), 3)
        })

    return customer_items


def get_stock_levels_batch(item_codes):
    """Get stock levels for items in batch"""
    
    if not item_codes:
        return {}
    
    stock_data = frappe.db.sql("""
        SELECT
            b.item_code,
            COALESCE(SUM(b.actual_qty), 0) as available_qty
        FROM `tabBin` b
        WHERE b.item_code IN %(items)s
        GROUP BY b.item_code
    """, {"items": item_codes}, as_dict=1)
    
    return {d.item_code: d.available_qty for d in stock_data}