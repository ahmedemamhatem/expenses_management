import frappe
from frappe import _


def get_descendants_of(company):
    """Get all descendant companies of a group company (recursive)"""
    lft, rgt = frappe.db.get_value("Company", company, ["lft", "rgt"])
    if lft and rgt:
        return frappe.db.sql_list(
            """
            SELECT name FROM `tabCompany`
            WHERE lft >= %s AND rgt <= %s
            ORDER BY name
            """,
            (lft, rgt),
        )
    return [company]


def execute(filters=None):
    columns = get_columns()
    data = []

    # Check if it's a group company for consolidated reporting
    is_group = False
    companies = []
    if filters and filters.get("company"):
        is_group = frappe.db.get_value("Company", filters.get("company"), "is_group")
        if is_group:
            companies = get_descendants_of(filters.get("company"))
            # Filter out the group company itself (only include leaf companies with transactions)
            companies = [c for c in companies if not frappe.db.get_value("Company", c, "is_group")]

    if is_group and len(companies) > 1:
        # Consolidated report - show each company separately
        data = generate_consolidated_report(filters, companies)
    else:
        # Single company report
        data = generate_single_company_report(filters)

    return columns, data


def generate_single_company_report(filters):
    """Generate report for a single company"""
    data = []

    # -----------------------------
    # 1. SALES VAT
    # -----------------------------
    sales_totals = get_sales_vat_totals_sql(filters)

    data.append({
        "category": "<b>Sales VAT</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    for key in ["Standard", "HealthcareEdu", "Zero Rated", "Exports", "Exempt"]:
        cat_name = {
            "Standard": "Standard rated sales",
            "HealthcareEdu": "Private Healthcare / Private Education sales to citizens",
            "Zero Rated": "Zero rated domestic sales",
            "Exports": "Exports",
            "Exempt": "Exempt sales"
        }[key]

        vat = sales_totals[key]["vat"] if key not in ["Zero Rated", "Exempt"] else 0
        ret_vat = sales_totals[key]["returned_vat"] if key not in ["Zero Rated", "Exempt"] else 0
        net_vat = vat - ret_vat

        data.append({
            "category": cat_name,
            "amount": sales_totals[key]["amount"],
            "vat_amount": vat,
            "returned_amount": sales_totals[key]["returned_amount"],
            "returned_vat": ret_vat,
            "net_vat": net_vat,
        })

    # Total Sales
    total_sales_amount = sum(v["amount"] for v in sales_totals.values())
    total_sales_vat = sum(v["vat"] for v in sales_totals.values())
    total_sales_returned_amount = sum(v["returned_amount"] for v in sales_totals.values())
    total_sales_returned_vat = sum(v["returned_vat"] for v in sales_totals.values())
    total_sales_net_vat = total_sales_vat - total_sales_returned_vat

    data.append({
        "category": "<b>Total Sales</b>",
        "amount": total_sales_amount,
        "vat_amount": total_sales_vat,
        "returned_amount": total_sales_returned_amount,
        "returned_vat": total_sales_returned_vat,
        "net_vat": total_sales_net_vat,
    })

    # -----------------------------
    # 2. PURCHASE VAT
    # -----------------------------
    purchase_totals = get_purchase_vat_totals_sql(filters)

    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>Purchase VAT</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    for key in ["Standard", "ImportsCustoms", "Zero Rated", "Exempt"]:
        cat_name = {
            "Standard": "Standard rated domestic purchases",
            "ImportsCustoms": "Imports subject to VAT paid at customs",
            "Zero Rated": "Zero rated purchases",
            "Exempt": "Exempt purchases"
        }[key]

        vat = purchase_totals[key]["vat"] if key not in ["Zero Rated", "Exempt"] else 0
        ret_vat = purchase_totals[key]["returned_vat"] if key not in ["Zero Rated", "Exempt"] else 0
        net_vat = vat - ret_vat

        data.append({
            "category": cat_name,
            "amount": purchase_totals[key]["amount"],
            "vat_amount": vat,
            "returned_amount": purchase_totals[key]["returned_amount"],
            "returned_vat": ret_vat,
            "net_vat": net_vat,
        })

    # Total Purchases
    total_purchase_amount = sum(v["amount"] for v in purchase_totals.values())
    total_purchase_vat = sum(v["vat"] for v in purchase_totals.values())
    total_purchase_returned_amount = sum(v["returned_amount"] for v in purchase_totals.values())
    total_purchase_returned_vat = sum(v["returned_vat"] for v in purchase_totals.values())
    total_purchase_net_vat = total_purchase_vat - total_purchase_returned_vat

    data.append({
        "category": "<b>Total purchases</b>",
        "amount": total_purchase_amount,
        "vat_amount": total_purchase_vat,
        "returned_amount": total_purchase_returned_amount,
        "returned_vat": total_purchase_returned_vat,
        "net_vat": total_purchase_net_vat,
    })

    # -----------------------------
    # 3. EXPENSES VAT
    # -----------------------------
    expenses_totals = get_expenses_vat_totals_sql(filters)

    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>Expenses VAT</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    # Standard rated expenses (with VAT) - Amount includes tax
    standard_expenses_net = expenses_totals["Standard"]["amount"]
    standard_expenses_vat = expenses_totals["Standard"]["vat"]
    standard_expenses_gross = standard_expenses_net + standard_expenses_vat

    data.append({
        "category": "Standard rated expenses",
        "amount": standard_expenses_gross,
        "vat_amount": standard_expenses_vat,
        "returned_amount": None,
        "returned_vat": None,
        "net_vat": standard_expenses_vat,
    })

    # Total Expenses
    total_expenses_amount = standard_expenses_gross
    total_expenses_vat = standard_expenses_vat

    data.append({
        "category": "<b>Total Expenses</b>",
        "amount": total_expenses_amount,
        "vat_amount": total_expenses_vat,
        "returned_amount": None,
        "returned_vat": None,
        "net_vat": total_expenses_vat,
    })

    # Net VAT Due (including expenses)
    total_input_vat = total_purchase_net_vat + total_expenses_vat
    net_vat_due = total_sales_net_vat - total_input_vat

    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>Net VAT Due (Sales VAT - Purchases VAT - Expenses VAT)</b>",
        "amount": None,
        "vat_amount": None,
        "returned_amount": None,
        "returned_vat": None,
        "net_vat": net_vat_due,
    })

    return data


def generate_consolidated_report(filters, companies):
    """Generate consolidated report showing each company's data and totals"""
    data = []

    # Initialize grand totals
    grand_totals = {
        "sales": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0, "net_vat": 0},
        "purchases": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0, "net_vat": 0},
        "expenses": {"amount": 0, "vat": 0},
    }

    # Process each company
    for company in companies:
        company_filters = {
            "company": company,
            "from_date": filters.get("from_date"),
            "to_date": filters.get("to_date"),
        }

        # Get data for this company
        sales_totals = get_sales_vat_totals_sql(company_filters)
        purchase_totals = get_purchase_vat_totals_sql(company_filters)
        expenses_totals = get_expenses_vat_totals_sql(company_filters)

        # Calculate company totals
        company_sales_amount = sum(v["amount"] for v in sales_totals.values())
        company_sales_vat = sum(v["vat"] for v in sales_totals.values())
        company_sales_returned_amount = sum(v["returned_amount"] for v in sales_totals.values())
        company_sales_returned_vat = sum(v["returned_vat"] for v in sales_totals.values())
        company_sales_net_vat = company_sales_vat - company_sales_returned_vat

        company_purchase_amount = sum(v["amount"] for v in purchase_totals.values())
        company_purchase_vat = sum(v["vat"] for v in purchase_totals.values())
        company_purchase_returned_amount = sum(v["returned_amount"] for v in purchase_totals.values())
        company_purchase_returned_vat = sum(v["returned_vat"] for v in purchase_totals.values())
        company_purchase_net_vat = company_purchase_vat - company_purchase_returned_vat

        company_expenses_net = expenses_totals["Standard"]["amount"]
        company_expenses_vat = expenses_totals["Standard"]["vat"]
        company_expenses_amount = company_expenses_net + company_expenses_vat  # Gross amount including tax

        # Skip if company has no data
        if (company_sales_amount == 0 and company_purchase_amount == 0 and company_expenses_amount == 0):
            continue

        # Add company header
        data.append({
            "category": f"<b>═══ {company} ═══</b>",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })

        # Sales row
        data.append({
            "category": "Sales VAT",
            "amount": company_sales_amount,
            "vat_amount": company_sales_vat,
            "returned_amount": company_sales_returned_amount,
            "returned_vat": company_sales_returned_vat,
            "net_vat": company_sales_net_vat,
        })

        # Purchases row
        data.append({
            "category": "Purchases VAT",
            "amount": company_purchase_amount,
            "vat_amount": company_purchase_vat,
            "returned_amount": company_purchase_returned_amount,
            "returned_vat": company_purchase_returned_vat,
            "net_vat": company_purchase_net_vat,
        })

        # Expenses row
        data.append({
            "category": "Expenses VAT",
            "amount": company_expenses_amount,
            "vat_amount": company_expenses_vat,
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": company_expenses_vat,
        })

        # Company Net VAT
        company_net_vat = company_sales_net_vat - company_purchase_net_vat - company_expenses_vat
        data.append({
            "category": "<b>Net VAT Due</b>",
            "amount": None,
            "vat_amount": None,
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": company_net_vat,
        })

        # Add to grand totals
        grand_totals["sales"]["amount"] += company_sales_amount
        grand_totals["sales"]["vat"] += company_sales_vat
        grand_totals["sales"]["returned_amount"] += company_sales_returned_amount
        grand_totals["sales"]["returned_vat"] += company_sales_returned_vat
        grand_totals["sales"]["net_vat"] += company_sales_net_vat

        grand_totals["purchases"]["amount"] += company_purchase_amount
        grand_totals["purchases"]["vat"] += company_purchase_vat
        grand_totals["purchases"]["returned_amount"] += company_purchase_returned_amount
        grand_totals["purchases"]["returned_vat"] += company_purchase_returned_vat
        grand_totals["purchases"]["net_vat"] += company_purchase_net_vat

        grand_totals["expenses"]["amount"] += company_expenses_amount
        grand_totals["expenses"]["vat"] += company_expenses_vat

        # Empty row between companies
        data.append({
            "category": "",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })

    # Add consolidated totals
    data.append({
        "category": "<b>═══════════════════════════════════════</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>CONSOLIDATED TOTALS</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    data.append({
        "category": "<b>Total Sales VAT</b>",
        "amount": grand_totals["sales"]["amount"],
        "vat_amount": grand_totals["sales"]["vat"],
        "returned_amount": grand_totals["sales"]["returned_amount"],
        "returned_vat": grand_totals["sales"]["returned_vat"],
        "net_vat": grand_totals["sales"]["net_vat"],
    })

    data.append({
        "category": "<b>Total Purchases VAT</b>",
        "amount": grand_totals["purchases"]["amount"],
        "vat_amount": grand_totals["purchases"]["vat"],
        "returned_amount": grand_totals["purchases"]["returned_amount"],
        "returned_vat": grand_totals["purchases"]["returned_vat"],
        "net_vat": grand_totals["purchases"]["net_vat"],
    })

    data.append({
        "category": "<b>Total Expenses VAT</b>",
        "amount": grand_totals["expenses"]["amount"],
        "vat_amount": grand_totals["expenses"]["vat"],
        "returned_amount": None,
        "returned_vat": None,
        "net_vat": grand_totals["expenses"]["vat"],
    })

    # Grand Net VAT Due
    grand_net_vat = grand_totals["sales"]["net_vat"] - grand_totals["purchases"]["net_vat"] - grand_totals["expenses"]["vat"]
    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>GRAND NET VAT DUE</b>",
        "amount": None,
        "vat_amount": None,
        "returned_amount": None,
        "returned_vat": None,
        "net_vat": grand_net_vat,
    })

    return data


# -----------------------------
# SQL HELPERS
# -----------------------------
def build_filters_sql(filters, table_alias="si"):
    conditions = [f"{table_alias}.docstatus = 1"]
    if filters:
        if filters.get("company"):
            # Check if it's a group company and get all descendants
            is_group = frappe.db.get_value("Company", filters.get("company"), "is_group")
            if is_group:
                companies = get_descendants_of(filters.get("company"))
                if companies:
                    company_list = ", ".join([f"'{c}'" for c in companies])
                    conditions.append(f"{table_alias}.company IN ({company_list})")
            else:
                conditions.append(f"{table_alias}.company = %(company)s")
        if filters.get("from_date") and filters.get("to_date"):
            conditions.append(f"{table_alias}.posting_date BETWEEN %(from_date)s AND %(to_date)s")
        elif filters.get("from_date"):
            conditions.append(f"{table_alias}.posting_date >= %(from_date)s")
        elif filters.get("to_date"):
            conditions.append(f"{table_alias}.posting_date <= %(to_date)s")
    return " AND ".join(conditions)


def get_zatca_category_from_template(zatca_cat_value):
    """
    Parse the custom_zatca_category value from Tax Category
    Examples:
    - "Standard rate" -> "Standard"
    - "Zero rated goods || Export of goods" -> "Zero Rated"
    - "Exempted" -> "Exempted"
    """
    if not zatca_cat_value:
        return None

    zatca_lower = zatca_cat_value.lower()

    if "zero" in zatca_lower:
        return "Zero Rated"
    elif "standard" in zatca_lower:
        return "Standard"
    elif "exempt" in zatca_lower:
        return "Exempted"

    return None


# -----------------------------
# SALES VAT
# -----------------------------
def get_sales_vat_totals_sql(filters):
    totals = {
        "Standard": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "HealthcareEdu": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exports": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exempt": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
    }

    where_clause = build_filters_sql(filters)

    # Join with Sales Taxes and Charges Template -> Tax Category to get custom_zatca_category
    query = f"""
        SELECT
            si.name AS invoice,
            si.is_return AS is_return,
            si.is_debit_note,
            si.grand_total AS grand_total,
            si.total_taxes_and_charges AS total_taxes_and_charges,
            si.taxes_and_charges AS taxes_and_charges_template,
            si.custom_zatca_tax_category AS invoice_zatca_cat,
            si.custom_exemption_reason_code AS invoice_exemption_code,
            si.custom_zatca_export_invoice AS invoice_export_flag,
            stct.tax_category AS template_tax_category,
            tc.custom_zatca_category AS template_zatca_category,
            sii.name AS item_name,
            COALESCE(sii.amount, 0) AS item_amount,
            COALESCE(sii.net_amount, sii.amount, 0) AS item_net_amount,
            sii.item_tax_template AS item_tax_template,
            itt.custom_zatca_tax_category AS item_template_category,
            itt.custom_exemption_reason_code AS item_template_exemption_code,
            tax.tax_rate AS item_template_first_tax_rate
        FROM `tabSales Invoice` si
        LEFT JOIN `tabSales Taxes and Charges Template` stct ON stct.name = si.taxes_and_charges
        LEFT JOIN `tabTax Category` tc ON tc.name = stct.tax_category
        LEFT JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
        LEFT JOIN `tabItem Tax Template` itt ON itt.name = sii.item_tax_template
        LEFT JOIN `tabItem Tax Template Detail` tax ON tax.parent = itt.name AND tax.idx = 1
        WHERE {where_clause}
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    # Group rows by invoice
    invoices = {}
    for r in rows:
        inv = r.get("invoice")
        if inv not in invoices:
            invoices[inv] = {
                "is_return": bool(r.get("is_return")),
                "is_debit_note": bool(r.get("is_debit_note")),
                "grand_total": r.get("grand_total") or 0,
                "total_taxes_and_charges": r.get("total_taxes_and_charges") or 0,
                "taxes_and_charges_template": r.get("taxes_and_charges_template") or "",
                "template_zatca_category": r.get("template_zatca_category") or "",
                "custom_zatca_tax_category": r.get("invoice_zatca_cat"),
                "custom_exemption_reason_code": r.get("invoice_exemption_code"),
                "custom_zatca_export_invoice": r.get("invoice_export_flag") or 0,
                "items": []
            }
        if r.get("item_name"):
            invoices[inv]["items"].append({
                "amount": r.get("item_amount") or 0,
                "net_amount": r.get("item_net_amount") or 0,
                "item_tax_template": r.get("item_tax_template"),
                "template_category": r.get("item_template_category"),
                "template_exemption_code": r.get("item_template_exemption_code"),
                "tax_rate": r.get("item_template_first_tax_rate") or 0,
            })

    # Process invoices
    for inv_doc in invoices.values():
        is_return = bool(inv_doc["is_return"])
        is_debit = bool(inv_doc["is_debit_note"])

        grand_total = abs(inv_doc["grand_total"] or 0)
        vat_amount = abs(inv_doc["total_taxes_and_charges"] or 0)
        # Net amount is the taxable base (before VAT)
        net_amount = grand_total - vat_amount

        # Get ZATCA category from Tax Template -> Tax Category
        template_zatca_cat = get_zatca_category_from_template(inv_doc.get("template_zatca_category"))

        def calculate_item_vat(item):
            return (item.get("net_amount") or 0) * (item.get("tax_rate") or 0) / 100.0

        # Determine which fields to update
        if is_return:
            amount_key = "returned_amount"
            vat_key = "returned_vat"
        else:
            amount_key = "amount"
            vat_key = "vat"

        # Priority: Tax Template's Tax Category ZATCA category > Invoice ZATCA category
        effective_zatca_cat = template_zatca_cat or inv_doc.get("custom_zatca_tax_category")

        # If no category is determined BUT the invoice has 0 tax, treat as Zero Rated
        if not effective_zatca_cat and vat_amount == 0 and grand_total > 0:
            effective_zatca_cat = "Zero Rated"

        # If category is "Standard" but there's no VAT on invoice, treat as Zero Rated
        # (handles data inconsistency where ZATCA category is set but no tax applied)
        if effective_zatca_cat == "Standard" and vat_amount == 0 and net_amount > 0:
            effective_zatca_cat = "Zero Rated"

        # --- Zero Rated ---
        if effective_zatca_cat == "Zero Rated":
            totals["Zero Rated"][amount_key] += net_amount
        # --- Standard Rated ---
        elif effective_zatca_cat == "Standard":
            totals["Standard"][amount_key] += net_amount
            totals["Standard"][vat_key] += vat_amount
        # --- Exempted ---
        elif effective_zatca_cat == "Exempted":
            totals["Exempt"][amount_key] += net_amount
        else:
            # Item-level processing if no invoice-level category
            has_items = len(inv_doc["items"]) > 0
            if has_items:
                for item in inv_doc["items"]:
                    item_amount = abs(item.get("net_amount") or item.get("amount") or 0)
                    item_vat = abs(calculate_item_vat(item))

                    if item.get("template_category") == "Zero Rated":
                        totals["Zero Rated"][amount_key] += item_amount
                    elif item.get("template_category") == "Standard":
                        if item.get("tax_rate", 0) == 0:
                            totals["Zero Rated"][amount_key] += item_amount
                        else:
                            totals["Standard"][amount_key] += item_amount
                            totals["Standard"][vat_key] += item_vat
                    elif item.get("template_category") == "Exempted":
                        totals["Exempt"][amount_key] += item_amount
            else:
                # No items and no category - check if 0 tax means Zero Rated
                if vat_amount == 0 and net_amount > 0:
                    totals["Zero Rated"][amount_key] += net_amount
                elif vat_amount > 0:
                    # Default to Standard if there's tax
                    totals["Standard"][amount_key] += net_amount
                    totals["Standard"][vat_key] += vat_amount

        # --- Exports ---
        if int(inv_doc.get("custom_zatca_export_invoice") or 0) == 1:
            totals["Exports"][amount_key] += net_amount
            totals["Exports"][vat_key] += vat_amount

        # --- Healthcare / Education ---
        if inv_doc.get("custom_exemption_reason_code") in ["VATEX-SA-HEA", "VATEX-SA-EDU"]:
            totals["HealthcareEdu"][amount_key] += net_amount
            totals["HealthcareEdu"][vat_key] += vat_amount
        else:
            for item in inv_doc["items"]:
                if item.get("template_exemption_code") in ["VATEX-SA-HEA", "VATEX-SA-EDU"]:
                    item_amount = abs(item.get("net_amount") or item.get("amount") or 0)
                    item_vat = abs(calculate_item_vat(item))
                    totals["HealthcareEdu"][amount_key] += item_amount
                    totals["HealthcareEdu"][vat_key] += item_vat

    return totals


# -----------------------------
# PURCHASE VAT
# -----------------------------
def get_purchase_vat_totals_sql(filters):
    totals = {
        "Standard": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "ImportsCustoms": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exempt": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
    }

    where_clause = build_filters_sql(filters, table_alias="pi")

    # Join with Purchase Taxes and Charges Template -> Tax Category to get custom_zatca_category
    query = f"""
        SELECT
            pi.name AS invoice,
            pi.is_return AS is_return,
            pi.grand_total AS grand_total,
            pi.total_taxes_and_charges AS total_taxes_and_charges,
            pi.taxes_and_charges AS taxes_and_charges_template,
            pi.custom_zatca_tax_category,
            pi.custom_exemption_reason_code,
            pi.custom_zatca_import_invoice,
            ptct.tax_category AS template_tax_category,
            tc.custom_zatca_category AS template_zatca_category
        FROM `tabPurchase Invoice` pi
        LEFT JOIN `tabPurchase Taxes and Charges Template` ptct ON ptct.name = pi.taxes_and_charges
        LEFT JOIN `tabTax Category` tc ON tc.name = ptct.tax_category
        WHERE {where_clause}
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    for r in rows:
        is_return = bool(r.get("is_return"))

        grand_total = abs(r.get("grand_total") or 0)
        vat_amount = abs(r.get("total_taxes_and_charges") or 0)
        # Net amount is the taxable base (before VAT)
        net_amount = grand_total - vat_amount

        # Get ZATCA category from Tax Template -> Tax Category
        template_zatca_cat = get_zatca_category_from_template(r.get("template_zatca_category"))

        if is_return:
            amount_key = "returned_amount"
            vat_key = "returned_vat"
        else:
            amount_key = "amount"
            vat_key = "vat"

        # Priority: Tax Template's Tax Category ZATCA category > Invoice ZATCA category
        effective_zatca_cat = template_zatca_cat or r.get("custom_zatca_tax_category")

        # If no category is determined BUT the invoice has 0 tax, treat as Zero Rated
        if not effective_zatca_cat and vat_amount == 0 and net_amount > 0:
            effective_zatca_cat = "Zero Rated"

        # If category is "Standard" but there's no VAT on invoice, it means
        # VAT was paid at customs (imports) - categorize as ImportsCustoms
        if effective_zatca_cat == "Standard" and vat_amount == 0 and net_amount > 0:
            totals["ImportsCustoms"][amount_key] += net_amount
            # VAT paid at customs is 15% of net amount
            customs_vat = net_amount * 0.15
            totals["ImportsCustoms"][vat_key] += customs_vat
        elif effective_zatca_cat == "Zero Rated":
            totals["Zero Rated"][amount_key] += net_amount
        elif effective_zatca_cat == "Standard":
            totals["Standard"][amount_key] += net_amount
            totals["Standard"][vat_key] += vat_amount
        elif effective_zatca_cat == "Exempted":
            totals["Exempt"][amount_key] += net_amount
        elif vat_amount > 0:
            # No category but has tax - treat as Standard
            totals["Standard"][amount_key] += net_amount
            totals["Standard"][vat_key] += vat_amount

        # Also check explicit import flag
        if int(r.get("custom_zatca_import_invoice") or 0) == 1 and vat_amount > 0:
            totals["ImportsCustoms"][amount_key] += net_amount
            totals["ImportsCustoms"][vat_key] += vat_amount

    return totals


# -----------------------------
# EXPENSES VAT
# -----------------------------
def get_expenses_vat_totals_sql(filters):
    """Get VAT totals from Expense Entry documents"""
    totals = {
        "Standard": {"amount": 0, "vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0},
    }

    conditions = ["ee.docstatus = 1"]

    if filters:
        if filters.get("company"):
            # Check if it's a group company and get all descendants
            is_group = frappe.db.get_value("Company", filters.get("company"), "is_group")
            if is_group:
                companies = get_descendants_of(filters.get("company"))
                if companies:
                    company_list = ", ".join([f"'{c}'" for c in companies])
                    conditions.append(f"ee.company IN ({company_list})")
            else:
                conditions.append("ee.company = %(company)s")
        if filters.get("from_date") and filters.get("to_date"):
            conditions.append("ee.posting_date BETWEEN %(from_date)s AND %(to_date)s")
        elif filters.get("from_date"):
            conditions.append("ee.posting_date >= %(from_date)s")
        elif filters.get("to_date"):
            conditions.append("ee.posting_date <= %(to_date)s")

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT
            ee.name AS expense_entry,
            ee.total_amount_before_tax AS net_amount,
            ee.total_tax_amount AS vat_amount,
            ee.total_amount AS gross_amount
        FROM `tabExpense Entry` ee
        WHERE {where_clause}
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    for r in rows:
        net_amount = abs(r.get("net_amount") or 0)
        vat_amount = abs(r.get("vat_amount") or 0)

        if vat_amount > 0:
            # Has VAT - Standard rated
            totals["Standard"]["amount"] += net_amount
            totals["Standard"]["vat"] += vat_amount
        else:
            # No VAT - Zero rated
            totals["Zero Rated"]["amount"] += net_amount

    return totals


# -----------------------------
# COLUMNS
# -----------------------------
def get_columns():
    return [
        {"label": "Category", "fieldname": "category", "fieldtype": "Data", "width": 380, "options": "HTML"},
        {"label": "Amount (SAR)", "fieldname": "amount", "fieldtype": "Currency", "width": 150},
        {"label": "VAT Amount (SAR)", "fieldname": "vat_amount", "fieldtype": "Currency", "width": 150},
        {"label": "Returned Amount (SAR)", "fieldname": "returned_amount", "fieldtype": "Currency", "width": 150},
        {"label": "Returned VAT (SAR)", "fieldname": "returned_vat", "fieldtype": "Currency", "width": 150},
        {"label": "Net VAT (SAR)", "fieldname": "net_vat", "fieldtype": "Currency", "width": 150},
    ]
