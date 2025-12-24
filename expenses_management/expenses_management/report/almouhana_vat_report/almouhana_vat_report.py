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
    """Generate report for a single company - ZATCA compliant"""
    data = []

    # -----------------------------
    # 1. SALES VAT (OUTPUT VAT)
    # -----------------------------
    sales_totals = get_sales_vat_totals_sql(filters)

    data.append({
        "category": "<b>المبيعات - ضريبة القيمة المضافة المستحقة (OUTPUT VAT)</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    # Box 1: Standard rated sales (15%)
    data.append({
        "category": "1. المبيعات الخاضعة للنسبة الأساسية / Standard rated sales (15%)",
        "amount": sales_totals["Standard"]["amount"],
        "vat_amount": sales_totals["Standard"]["vat"],
        "returned_amount": sales_totals["Standard"]["returned_amount"],
        "returned_vat": sales_totals["Standard"]["returned_vat"],
        "net_vat": sales_totals["Standard"]["vat"] - sales_totals["Standard"]["returned_vat"],
    })

    # Box 2: Sales to registered customers in other GCC states
    data.append({
        "category": "2. المبيعات للعملاء المسجلين في دول مجلس التعاون / Sales to registered customers in GCC",
        "amount": sales_totals["GCC"]["amount"],
        "vat_amount": sales_totals["GCC"]["vat"],
        "returned_amount": sales_totals["GCC"]["returned_amount"],
        "returned_vat": sales_totals["GCC"]["returned_vat"],
        "net_vat": sales_totals["GCC"]["vat"] - sales_totals["GCC"]["returned_vat"],
    })

    # Box 3: Zero rated domestic sales
    data.append({
        "category": "3. المبيعات المحلية الخاضعة لنسبة الصفر / Zero rated domestic sales",
        "amount": sales_totals["Zero Rated"]["amount"],
        "vat_amount": 0,
        "returned_amount": sales_totals["Zero Rated"]["returned_amount"],
        "returned_vat": 0,
        "net_vat": 0,
    })

    # Box 4: Exports
    data.append({
        "category": "4. الصادرات / Exports",
        "amount": sales_totals["Exports"]["amount"],
        "vat_amount": 0,  # Exports are zero-rated
        "returned_amount": sales_totals["Exports"]["returned_amount"],
        "returned_vat": 0,
        "net_vat": 0,
    })

    # Box 5: Exempt sales
    data.append({
        "category": "5. المبيعات المعفاة / Exempt sales",
        "amount": sales_totals["Exempt"]["amount"],
        "vat_amount": 0,
        "returned_amount": sales_totals["Exempt"]["returned_amount"],
        "returned_vat": 0,
        "net_vat": 0,
    })

    # Box 6: Total Sales
    total_sales_amount = sum(v["amount"] for v in sales_totals.values())
    total_sales_vat = sales_totals["Standard"]["vat"] + sales_totals["GCC"]["vat"]  # Only taxable categories
    total_sales_returned_amount = sum(v["returned_amount"] for v in sales_totals.values())
    total_sales_returned_vat = sales_totals["Standard"]["returned_vat"] + sales_totals["GCC"]["returned_vat"]
    total_sales_net_vat = total_sales_vat - total_sales_returned_vat

    data.append({
        "category": "<b>6. إجمالي المبيعات / Total Sales</b>",
        "amount": total_sales_amount,
        "vat_amount": total_sales_vat,
        "returned_amount": total_sales_returned_amount,
        "returned_vat": total_sales_returned_vat,
        "net_vat": total_sales_net_vat,
    })

    # -----------------------------
    # 2. PURCHASE VAT (INPUT VAT)
    # -----------------------------
    purchase_totals = get_purchase_vat_totals_sql(filters)

    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>المشتريات - ضريبة القيمة المضافة القابلة للخصم (INPUT VAT)</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    # Box 7: Standard rated domestic purchases
    data.append({
        "category": "7. المشتريات المحلية الخاضعة للنسبة الأساسية / Standard rated domestic purchases (15%)",
        "amount": purchase_totals["Standard"]["amount"],
        "vat_amount": purchase_totals["Standard"]["vat"],
        "returned_amount": purchase_totals["Standard"]["returned_amount"],
        "returned_vat": purchase_totals["Standard"]["returned_vat"],
        "net_vat": purchase_totals["Standard"]["vat"] - purchase_totals["Standard"]["returned_vat"],
    })

    # Box 8: Imports subject to VAT paid at customs
    data.append({
        "category": "8. الواردات الخاضعة للضريبة المدفوعة في الجمارك / Imports - VAT paid at customs",
        "amount": purchase_totals["ImportsCustoms"]["amount"],
        "vat_amount": purchase_totals["ImportsCustoms"]["vat"],
        "returned_amount": purchase_totals["ImportsCustoms"]["returned_amount"],
        "returned_vat": purchase_totals["ImportsCustoms"]["returned_vat"],
        "net_vat": purchase_totals["ImportsCustoms"]["vat"] - purchase_totals["ImportsCustoms"]["returned_vat"],
    })

    # Box 9: Imports subject to VAT under reverse charge
    data.append({
        "category": "9. الواردات الخاضعة للضريبة بموجب آلية الاحتساب العكسي / Imports - Reverse charge",
        "amount": purchase_totals["ImportsReverseCharge"]["amount"],
        "vat_amount": purchase_totals["ImportsReverseCharge"]["vat"],
        "returned_amount": purchase_totals["ImportsReverseCharge"]["returned_amount"],
        "returned_vat": purchase_totals["ImportsReverseCharge"]["returned_vat"],
        "net_vat": purchase_totals["ImportsReverseCharge"]["vat"] - purchase_totals["ImportsReverseCharge"]["returned_vat"],
    })

    # Box 10: Zero rated purchases
    data.append({
        "category": "10. المشتريات الخاضعة لنسبة الصفر / Zero rated purchases",
        "amount": purchase_totals["Zero Rated"]["amount"],
        "vat_amount": 0,
        "returned_amount": purchase_totals["Zero Rated"]["returned_amount"],
        "returned_vat": 0,
        "net_vat": 0,
    })

    # Box 11: Exempt purchases
    data.append({
        "category": "11. المشتريات المعفاة / Exempt purchases",
        "amount": purchase_totals["Exempt"]["amount"],
        "vat_amount": 0,
        "returned_amount": purchase_totals["Exempt"]["returned_amount"],
        "returned_vat": 0,
        "net_vat": 0,
    })

    # Box 12: Total Purchases
    total_purchase_amount = sum(v["amount"] for v in purchase_totals.values())
    total_purchase_vat = (purchase_totals["Standard"]["vat"] +
                          purchase_totals["ImportsCustoms"]["vat"] +
                          purchase_totals["ImportsReverseCharge"]["vat"])
    total_purchase_returned_amount = sum(v["returned_amount"] for v in purchase_totals.values())
    total_purchase_returned_vat = (purchase_totals["Standard"]["returned_vat"] +
                                   purchase_totals["ImportsCustoms"]["returned_vat"] +
                                   purchase_totals["ImportsReverseCharge"]["returned_vat"])
    total_purchase_net_vat = total_purchase_vat - total_purchase_returned_vat

    data.append({
        "category": "<b>12. إجمالي المشتريات / Total Purchases</b>",
        "amount": total_purchase_amount,
        "vat_amount": total_purchase_vat,
        "returned_amount": total_purchase_returned_amount,
        "returned_vat": total_purchase_returned_vat,
        "net_vat": total_purchase_net_vat,
    })

    # -----------------------------
    # 3. EXPENSES VAT (Additional Input VAT)
    # -----------------------------
    expenses_totals = get_expenses_vat_totals_sql(filters)

    if expenses_totals["Standard"]["amount"] > 0 or expenses_totals["Standard"]["vat"] > 0:
        data.append({
            "category": "",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })
        data.append({
            "category": "<b>المصروفات - ضريبة القيمة المضافة القابلة للخصم (EXPENSES VAT)</b>",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })

        # Standard rated expenses - Amount includes VAT (gross)
        standard_expenses_net = expenses_totals["Standard"]["amount"]
        standard_expenses_vat = expenses_totals["Standard"]["vat"]
        standard_expenses_gross = standard_expenses_net + standard_expenses_vat

        data.append({
            "category": "المصروفات الخاضعة للنسبة الأساسية / Standard rated expenses",
            "amount": standard_expenses_gross,  # Total including VAT
            "vat_amount": standard_expenses_vat,
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": standard_expenses_vat,
        })

        total_expenses_vat = standard_expenses_vat
        total_expenses_amount = standard_expenses_gross
    else:
        total_expenses_vat = 0
        total_expenses_amount = 0

    # -----------------------------
    # 4. VAT SUMMARY
    # -----------------------------
    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })
    data.append({
        "category": "<b>═══════════════════════════════════════════════════════════════</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    # Box 13: Total Output VAT
    data.append({
        "category": "<b>13. إجمالي ضريبة القيمة المضافة المستحقة / Total Output VAT</b>",
        "amount": None,
        "vat_amount": total_sales_vat,
        "returned_amount": None,
        "returned_vat": total_sales_returned_vat,
        "net_vat": total_sales_net_vat,
    })

    # Box 14: Total Input VAT (purchases + expenses)
    total_input_vat = total_purchase_net_vat + total_expenses_vat
    data.append({
        "category": "<b>14. إجمالي ضريبة القيمة المضافة القابلة للخصم / Total Input VAT</b>",
        "amount": None,
        "vat_amount": total_purchase_vat + total_expenses_vat,
        "returned_amount": None,
        "returned_vat": total_purchase_returned_vat,
        "net_vat": total_input_vat,
    })

    # Box 15: Net VAT Due
    net_vat_due = total_sales_net_vat - total_input_vat

    data.append({
        "category": "",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    if net_vat_due >= 0:
        data.append({
            "category": "<b>15. صافي ضريبة القيمة المضافة المستحقة / Net VAT Due</b>",
            "amount": None,
            "vat_amount": None,
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": net_vat_due,
        })
    else:
        data.append({
            "category": "<b>15. صافي ضريبة القيمة المضافة القابلة للاسترداد / Net VAT Refundable</b>",
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

        # Calculate company totals - only taxable categories for VAT
        company_sales_amount = sum(v["amount"] for v in sales_totals.values())
        company_sales_vat = sales_totals["Standard"]["vat"] + sales_totals["GCC"]["vat"]
        company_sales_returned_amount = sum(v["returned_amount"] for v in sales_totals.values())
        company_sales_returned_vat = sales_totals["Standard"]["returned_vat"] + sales_totals["GCC"]["returned_vat"]
        company_sales_net_vat = company_sales_vat - company_sales_returned_vat

        company_purchase_amount = sum(v["amount"] for v in purchase_totals.values())
        company_purchase_vat = (purchase_totals["Standard"]["vat"] +
                                purchase_totals["ImportsCustoms"]["vat"] +
                                purchase_totals["ImportsReverseCharge"]["vat"])
        company_purchase_returned_amount = sum(v["returned_amount"] for v in purchase_totals.values())
        company_purchase_returned_vat = (purchase_totals["Standard"]["returned_vat"] +
                                         purchase_totals["ImportsCustoms"]["returned_vat"] +
                                         purchase_totals["ImportsReverseCharge"]["returned_vat"])
        company_purchase_net_vat = company_purchase_vat - company_purchase_returned_vat

        company_expenses_net = expenses_totals["Standard"]["amount"]
        company_expenses_vat = expenses_totals["Standard"]["vat"]
        company_expenses_amount = company_expenses_net + company_expenses_vat  # Gross amount including VAT

        # Skip if company has no data
        if (company_sales_amount == 0 and company_purchase_amount == 0 and company_expenses_net == 0):
            continue

        # Add company header
        data.append({
            "category": f"<b>═══ {company} ═══</b>",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })

        # Sales row
        data.append({
            "category": "ضريبة المبيعات / Sales VAT",
            "amount": company_sales_amount,
            "vat_amount": company_sales_vat,
            "returned_amount": company_sales_returned_amount,
            "returned_vat": company_sales_returned_vat,
            "net_vat": company_sales_net_vat,
        })

        # Purchases row
        data.append({
            "category": "ضريبة المشتريات / Purchases VAT",
            "amount": company_purchase_amount,
            "vat_amount": company_purchase_vat,
            "returned_amount": company_purchase_returned_amount,
            "returned_vat": company_purchase_returned_vat,
            "net_vat": company_purchase_net_vat,
        })

        # Expenses row (if any)
        if company_expenses_vat > 0:
            data.append({
                "category": "ضريبة المصروفات / Expenses VAT",
                "amount": company_expenses_amount,  # Gross amount including VAT
                "vat_amount": company_expenses_vat,
                "returned_amount": None,
                "returned_vat": None,
                "net_vat": company_expenses_vat,
            })

        # Company Net VAT
        company_net_vat = company_sales_net_vat - company_purchase_net_vat - company_expenses_vat
        data.append({
            "category": "<b>صافي الضريبة المستحقة / Net VAT Due</b>",
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
        "category": "<b>الإجماليات الموحدة / CONSOLIDATED TOTALS</b>",
        "amount": None, "vat_amount": None,
        "returned_amount": None, "returned_vat": None, "net_vat": None
    })

    data.append({
        "category": "<b>إجمالي ضريبة المبيعات / Total Sales VAT</b>",
        "amount": grand_totals["sales"]["amount"],
        "vat_amount": grand_totals["sales"]["vat"],
        "returned_amount": grand_totals["sales"]["returned_amount"],
        "returned_vat": grand_totals["sales"]["returned_vat"],
        "net_vat": grand_totals["sales"]["net_vat"],
    })

    data.append({
        "category": "<b>إجمالي ضريبة المشتريات / Total Purchases VAT</b>",
        "amount": grand_totals["purchases"]["amount"],
        "vat_amount": grand_totals["purchases"]["vat"],
        "returned_amount": grand_totals["purchases"]["returned_amount"],
        "returned_vat": grand_totals["purchases"]["returned_vat"],
        "net_vat": grand_totals["purchases"]["net_vat"],
    })

    if grand_totals["expenses"]["vat"] > 0:
        data.append({
            "category": "<b>إجمالي ضريبة المصروفات / Total Expenses VAT</b>",
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

    if grand_net_vat >= 0:
        data.append({
            "category": "<b>صافي الضريبة المستحقة الإجمالي / GRAND NET VAT DUE</b>",
            "amount": None,
            "vat_amount": None,
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": grand_net_vat,
        })
    else:
        data.append({
            "category": "<b>صافي الضريبة القابلة للاسترداد / GRAND NET VAT REFUNDABLE</b>",
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
    """
    Get sales VAT totals.
    - Amount = gross amount (including VAT) = base_grand_total
    - VAT = tax amount = base_total_taxes_and_charges
    - SAR invoices with 0 VAT = skip (ignore)
    - Non-SAR invoices with 0 VAT = Exports (Box 4)
    """
    totals = {
        "Standard": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "GCC": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
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
            si.base_grand_total AS grand_total,
            si.base_total_taxes_and_charges AS total_taxes_and_charges,
            si.taxes_and_charges AS taxes_and_charges_template,
            si.custom_zatca_tax_category AS invoice_zatca_cat,
            si.custom_exemption_reason_code AS invoice_exemption_code,
            si.custom_zatca_export_invoice AS invoice_export_flag,
            si.currency AS currency,
            stct.tax_category AS template_tax_category,
            tc.custom_zatca_category AS template_zatca_category
        FROM `tabSales Invoice` si
        LEFT JOIN `tabSales Taxes and Charges Template` stct ON stct.name = si.taxes_and_charges
        LEFT JOIN `tabTax Category` tc ON tc.name = stct.tax_category
        WHERE {where_clause}
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    for r in rows:
        is_return = bool(r.get("is_return"))

        # Amount = gross amount (including VAT)
        gross_amount = abs(r.get("grand_total") or 0)
        vat_amount = abs(r.get("total_taxes_and_charges") or 0)
        currency = r.get("currency") or "SAR"

        # Get ZATCA category from Tax Template -> Tax Category
        template_zatca_cat = get_zatca_category_from_template(r.get("template_zatca_category"))

        # Determine which fields to update
        if is_return:
            amount_key = "returned_amount"
            vat_key = "returned_vat"
        else:
            amount_key = "amount"
            vat_key = "vat"

        # Check if it's an export first (exports are zero-rated, no VAT)
        if int(r.get("custom_zatca_export_invoice") or 0) == 1:
            totals["Exports"][amount_key] += gross_amount
            continue

        # Priority: Tax Template's Tax Category ZATCA category > Invoice ZATCA category
        effective_zatca_cat = template_zatca_cat or r.get("invoice_zatca_cat")

        # Skip SAR invoices with 0 VAT - they should not be included in the report
        if currency == "SAR" and vat_amount == 0 and gross_amount > 0:
            continue

        # Non-SAR invoices with 0 VAT go to Exports (Box 4)
        if currency != "SAR" and vat_amount == 0 and gross_amount > 0:
            totals["Exports"][amount_key] += gross_amount
            continue

        # --- Standard Rated (has VAT) ---
        if vat_amount > 0:
            totals["Standard"][amount_key] += gross_amount
            totals["Standard"][vat_key] += vat_amount
        # --- Exempted ---
        elif effective_zatca_cat == "Exempted":
            totals["Exempt"][amount_key] += gross_amount

    return totals


# -----------------------------
# PURCHASE VAT
# -----------------------------
def get_purchase_vat_totals_sql(filters):
    """
    Get purchase VAT totals.
    - Amount = gross amount (including VAT) = base_grand_total
    - VAT = tax amount = base_total_taxes_and_charges
    - SAR invoices with 0 VAT = skip (ignore)
    - Non-SAR invoices = Imports Reverse Charge (Box 9)
    """
    totals = {
        "Standard": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "ImportsCustoms": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "ImportsReverseCharge": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exempt": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
    }

    where_clause = build_filters_sql(filters, table_alias="pi")

    # Join with Purchase Taxes and Charges Template -> Tax Category to get custom_zatca_category
    query = f"""
        SELECT
            pi.name AS invoice,
            pi.is_return AS is_return,
            pi.base_grand_total AS grand_total,
            pi.base_total_taxes_and_charges AS total_taxes_and_charges,
            pi.taxes_and_charges AS taxes_and_charges_template,
            pi.custom_zatca_tax_category,
            pi.custom_exemption_reason_code,
            pi.custom_zatca_import_invoice,
            pi.currency AS currency,
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

        # Amount = gross amount (including VAT)
        gross_amount = abs(r.get("grand_total") or 0)
        vat_amount = abs(r.get("total_taxes_and_charges") or 0)
        currency = r.get("currency") or "SAR"

        # Get ZATCA category from Tax Template -> Tax Category
        template_zatca_cat = get_zatca_category_from_template(r.get("template_zatca_category"))

        if is_return:
            amount_key = "returned_amount"
            vat_key = "returned_vat"
        else:
            amount_key = "amount"
            vat_key = "vat"

        # Check if it's an import invoice (VAT paid at customs)
        is_import = int(r.get("custom_zatca_import_invoice") or 0) == 1

        if is_import:
            # Import invoice - VAT paid at customs
            totals["ImportsCustoms"][amount_key] += gross_amount
            totals["ImportsCustoms"][vat_key] += vat_amount
            continue

        # Skip SAR purchases with 0 VAT - they should not be included in the report
        if currency == "SAR" and vat_amount == 0 and gross_amount > 0:
            continue

        # Non-SAR purchases go to Imports Reverse Charge (Box 9)
        if currency != "SAR":
            totals["ImportsReverseCharge"][amount_key] += gross_amount
            totals["ImportsReverseCharge"][vat_key] += vat_amount
            continue

        # SAR purchases with VAT go to Standard (Box 7)
        if vat_amount > 0:
            totals["Standard"][amount_key] += gross_amount
            totals["Standard"][vat_key] += vat_amount

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
        {"label": _("Category / الفئة"), "fieldname": "category", "fieldtype": "Data", "width": 550, "options": "HTML"},
        {"label": _("Amount / المبلغ (SAR)"), "fieldname": "amount", "fieldtype": "Currency", "width": 200},
        {"label": _("VAT / الضريبة (SAR)"), "fieldname": "vat_amount", "fieldtype": "Currency", "width": 200},
        {"label": _("Returns / المرتجعات (SAR)"), "fieldname": "returned_amount", "fieldtype": "Currency", "width": 200},
        {"label": _("Returns VAT / ضريبة المرتجعات (SAR)"), "fieldname": "returned_vat", "fieldtype": "Currency", "width": 200},
        {"label": _("Net VAT / صافي الضريبة (SAR)"), "fieldname": "net_vat", "fieldtype": "Currency", "width": 200},
    ]
