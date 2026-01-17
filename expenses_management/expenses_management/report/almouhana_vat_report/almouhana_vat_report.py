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


def get_tax_accounts(company):
    """Get all accounts with account_type = 'Tax' for a company"""
    return frappe.db.sql_list("""
        SELECT name FROM `tabAccount`
        WHERE company = %s
        AND account_type = 'Tax'
        AND is_group = 0
    """, company)


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
    """Generate report for a single company - matching GL entries"""
    data = []

    # -----------------------------
    # 1. SALES VAT (OUTPUT VAT)
    # -----------------------------
    sales_totals = get_sales_vat_totals(filters)

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
    purchase_totals = get_purchase_vat_totals(filters)

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
    expenses_totals = get_expenses_vat_totals(filters)

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
    # 4. JOURNAL ENTRY VAT
    # -----------------------------
    journal_vat = get_journal_entry_vat(filters)

    if journal_vat["vat"] != 0:
        data.append({
            "category": "",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })
        data.append({
            "category": "<b>قيود يومية - ضريبة القيمة المضافة (JOURNAL ENTRY VAT)</b>",
            "amount": None, "vat_amount": None,
            "returned_amount": None, "returned_vat": None, "net_vat": None
        })

        data.append({
            "category": "تسويات ضريبية / VAT Adjustments",
            "amount": None,
            "vat_amount": journal_vat["vat"],
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": journal_vat["vat"],
        })

        # Add journal VAT to input VAT (if positive, it's additional input VAT)
        total_journal_vat = journal_vat["vat"]
    else:
        total_journal_vat = 0

    # -----------------------------
    # 5. VAT SUMMARY
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

    # Box 14: Total Input VAT (purchases + expenses + journal adjustments)
    total_input_vat = total_purchase_net_vat + total_expenses_vat + total_journal_vat
    data.append({
        "category": "<b>14. إجمالي ضريبة القيمة المضافة القابلة للخصم / Total Input VAT</b>",
        "amount": None,
        "vat_amount": total_purchase_vat + total_expenses_vat + total_journal_vat,
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
        "journal": {"vat": 0},
    }

    # Process each company
    for company in companies:
        company_filters = {
            "company": company,
            "from_date": filters.get("from_date"),
            "to_date": filters.get("to_date"),
        }

        # Get data for this company
        sales_totals = get_sales_vat_totals(company_filters)
        purchase_totals = get_purchase_vat_totals(company_filters)
        expenses_totals = get_expenses_vat_totals(company_filters)
        journal_vat = get_journal_entry_vat(company_filters)

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

        company_journal_vat = journal_vat["vat"]

        # Skip if company has no data
        if (company_sales_amount == 0 and company_purchase_amount == 0 and
            company_expenses_net == 0 and company_journal_vat == 0):
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

        # Journal Entry VAT (if any)
        if company_journal_vat != 0:
            data.append({
                "category": "تسويات ضريبية / VAT Adjustments",
                "amount": None,
                "vat_amount": company_journal_vat,
                "returned_amount": None,
                "returned_vat": None,
                "net_vat": company_journal_vat,
            })

        # Company Net VAT
        company_net_vat = company_sales_net_vat - company_purchase_net_vat - company_expenses_vat - company_journal_vat
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

        grand_totals["journal"]["vat"] += company_journal_vat

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

    if grand_totals["journal"]["vat"] != 0:
        data.append({
            "category": "<b>إجمالي التسويات الضريبية / Total VAT Adjustments</b>",
            "amount": None,
            "vat_amount": grand_totals["journal"]["vat"],
            "returned_amount": None,
            "returned_vat": None,
            "net_vat": grand_totals["journal"]["vat"],
        })

    # Grand Net VAT Due
    grand_net_vat = (grand_totals["sales"]["net_vat"] -
                     grand_totals["purchases"]["net_vat"] -
                     grand_totals["expenses"]["vat"] -
                     grand_totals["journal"]["vat"])
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
# VAT CALCULATION FUNCTIONS
# -----------------------------

def build_company_condition(filters, table_alias="si"):
    """Build company filter condition"""
    if not filters or not filters.get("company"):
        return ""

    is_group = frappe.db.get_value("Company", filters.get("company"), "is_group")
    if is_group:
        companies = get_descendants_of(filters.get("company"))
        if companies:
            company_list = ", ".join([f"'{c}'" for c in companies])
            return f"{table_alias}.company IN ({company_list})"
    return f"{table_alias}.company = %(company)s"


def build_date_condition(filters, table_alias="si"):
    """Build date filter condition"""
    if not filters:
        return ""

    conditions = []
    if filters.get("from_date") and filters.get("to_date"):
        conditions.append(f"{table_alias}.posting_date BETWEEN %(from_date)s AND %(to_date)s")
    elif filters.get("from_date"):
        conditions.append(f"{table_alias}.posting_date >= %(from_date)s")
    elif filters.get("to_date"):
        conditions.append(f"{table_alias}.posting_date <= %(to_date)s")

    return " AND ".join(conditions) if conditions else ""


def get_sales_vat_totals(filters):
    """
    Get sales VAT totals from Sales Taxes and Charges table.
    Only includes rows where account_head has account_type = 'Tax'.
    - Amount = base_net_total (net amount excluding VAT)
    - VAT = sum of base_tax_amount from Tax account rows only
    """
    totals = {
        "Standard": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "GCC": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exports": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exempt": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
    }

    # Build conditions
    conditions = ["si.docstatus = 1"]

    company_cond = build_company_condition(filters, "si")
    if company_cond:
        conditions.append(company_cond)

    date_cond = build_date_condition(filters, "si")
    if date_cond:
        conditions.append(date_cond)

    where_clause = " AND ".join(conditions)

    # Get invoices with VAT from taxes table (only Tax account type rows)
    query = f"""
        SELECT
            si.name AS invoice,
            si.is_return,
            si.currency,
            si.custom_zatca_export_invoice,
            si.base_net_total AS net_amount,
            COALESCE(vat.vat_amount, 0) AS vat_amount
        FROM `tabSales Invoice` si
        LEFT JOIN (
            SELECT
                stc.parent,
                SUM(stc.base_tax_amount) AS vat_amount
            FROM `tabSales Taxes and Charges` stc
            INNER JOIN `tabAccount` acc ON acc.name = stc.account_head
            WHERE acc.account_type = 'Tax'
            GROUP BY stc.parent
        ) vat ON vat.parent = si.name
        WHERE {where_clause}
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    for r in rows:
        is_return = bool(r.get("is_return"))
        net_amount = abs(r.get("net_amount") or 0)
        vat_amount = abs(r.get("vat_amount") or 0)
        currency = r.get("currency") or "SAR"
        is_export = int(r.get("custom_zatca_export_invoice") or 0) == 1

        # Determine which fields to update
        if is_return:
            amount_key = "returned_amount"
            vat_key = "returned_vat"
        else:
            amount_key = "amount"
            vat_key = "vat"

        # Categorize the invoice
        if is_export:
            totals["Exports"][amount_key] += net_amount
        elif currency != "SAR" and vat_amount == 0:
            # Non-SAR with no VAT = Export
            totals["Exports"][amount_key] += net_amount
        elif vat_amount > 0:
            # Standard rated (has VAT)
            totals["Standard"][amount_key] += net_amount
            totals["Standard"][vat_key] += vat_amount
        elif currency == "SAR" and vat_amount == 0 and net_amount > 0:
            # SAR with no VAT - skip (not included in report)
            pass

    return totals


def get_purchase_vat_totals(filters):
    """
    Get purchase VAT totals from Purchase Taxes and Charges table.
    Only includes rows where account_head has account_type = 'Tax'.
    - Amount = base_net_total (net amount excluding VAT)
    - VAT = sum of base_tax_amount from Tax account rows only
    """
    totals = {
        "Standard": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "ImportsCustoms": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "ImportsReverseCharge": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
        "Exempt": {"amount": 0, "vat": 0, "returned_amount": 0, "returned_vat": 0},
    }

    # Build conditions
    conditions = ["pi.docstatus = 1"]

    company_cond = build_company_condition(filters, "pi")
    if company_cond:
        conditions.append(company_cond)

    date_cond = build_date_condition(filters, "pi")
    if date_cond:
        conditions.append(date_cond)

    where_clause = " AND ".join(conditions)

    # Get invoices with VAT from taxes table (only Tax account type rows)
    query = f"""
        SELECT
            pi.name AS invoice,
            pi.is_return,
            pi.currency,
            pi.custom_zatca_import_invoice,
            pi.base_net_total AS net_amount,
            COALESCE(vat.vat_amount, 0) AS vat_amount
        FROM `tabPurchase Invoice` pi
        LEFT JOIN (
            SELECT
                ptc.parent,
                SUM(ptc.base_tax_amount) AS vat_amount
            FROM `tabPurchase Taxes and Charges` ptc
            INNER JOIN `tabAccount` acc ON acc.name = ptc.account_head
            WHERE acc.account_type = 'Tax'
            GROUP BY ptc.parent
        ) vat ON vat.parent = pi.name
        WHERE {where_clause}
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    for r in rows:
        is_return = bool(r.get("is_return"))
        net_amount = abs(r.get("net_amount") or 0)
        vat_amount = abs(r.get("vat_amount") or 0)
        currency = r.get("currency") or "SAR"
        is_import = int(r.get("custom_zatca_import_invoice") or 0) == 1

        # Determine which fields to update
        if is_return:
            amount_key = "returned_amount"
            vat_key = "returned_vat"
        else:
            amount_key = "amount"
            vat_key = "vat"

        # Categorize the invoice
        if is_import:
            # Import invoice - VAT paid at customs
            totals["ImportsCustoms"][amount_key] += net_amount
            totals["ImportsCustoms"][vat_key] += vat_amount
        elif currency != "SAR":
            # Non-SAR = Imports Reverse Charge
            totals["ImportsReverseCharge"][amount_key] += net_amount
            totals["ImportsReverseCharge"][vat_key] += vat_amount
        elif vat_amount > 0:
            # Standard rated (has VAT)
            totals["Standard"][amount_key] += net_amount
            totals["Standard"][vat_key] += vat_amount
        elif currency == "SAR" and vat_amount == 0 and net_amount > 0:
            # SAR with no VAT - skip (not included in report)
            pass

    return totals


def get_expenses_vat_totals(filters):
    """
    Get expense VAT totals from GL entries for Expense Entry vouchers.
    Uses GL entries because Expense Entry may not have a taxes child table.
    Only includes accounts with account_type = 'Tax'.
    """
    totals = {
        "Standard": {"amount": 0, "vat": 0},
        "Zero Rated": {"amount": 0, "vat": 0},
    }

    # Build conditions for GL query
    conditions = ["gl.is_cancelled = 0", "gl.voucher_type = 'Expense Entry'"]

    if filters:
        if filters.get("company"):
            is_group = frappe.db.get_value("Company", filters.get("company"), "is_group")
            if is_group:
                companies = get_descendants_of(filters.get("company"))
                if companies:
                    company_list = ", ".join([f"'{c}'" for c in companies])
                    conditions.append(f"gl.company IN ({company_list})")
            else:
                conditions.append("gl.company = %(company)s")

        if filters.get("from_date") and filters.get("to_date"):
            conditions.append("gl.posting_date BETWEEN %(from_date)s AND %(to_date)s")
        elif filters.get("from_date"):
            conditions.append("gl.posting_date >= %(from_date)s")
        elif filters.get("to_date"):
            conditions.append("gl.posting_date <= %(to_date)s")

    where_clause = " AND ".join(conditions)

    # Get VAT amounts from GL entries for Expense Entries (only Tax account type)
    query = f"""
        SELECT
            gl.voucher_no,
            ee.total_amount_before_tax as net_amount,
            SUM(CASE WHEN acc.account_type = 'Tax' THEN gl.debit - gl.credit ELSE 0 END) as vat_amount
        FROM `tabGL Entry` gl
        JOIN `tabExpense Entry` ee ON ee.name = gl.voucher_no
        LEFT JOIN `tabAccount` acc ON acc.name = gl.account
        WHERE {where_clause}
        GROUP BY gl.voucher_no, ee.total_amount_before_tax
    """

    rows = frappe.db.sql(query, filters, as_dict=True)

    for r in rows:
        net_amount = abs(r.get("net_amount") or 0)
        vat_amount = abs(r.get("vat_amount") or 0)

        if vat_amount > 0:
            totals["Standard"]["amount"] += net_amount
            totals["Standard"]["vat"] += vat_amount
        else:
            totals["Zero Rated"]["amount"] += net_amount

    return totals


def get_journal_entry_vat(filters):
    """
    Get VAT amounts from Journal Entry GL entries.
    Returns net VAT (debit - credit) for accounts with account_type = 'Tax'.
    Positive = Input VAT (deductible), Negative = Output VAT adjustment
    """
    result = {"vat": 0}

    # Build conditions
    conditions = ["gl.is_cancelled = 0", "gl.voucher_type = 'Journal Entry'", "acc.account_type = 'Tax'"]

    if filters:
        if filters.get("company"):
            is_group = frappe.db.get_value("Company", filters.get("company"), "is_group")
            if is_group:
                companies = get_descendants_of(filters.get("company"))
                if companies:
                    company_list = ", ".join([f"'{c}'" for c in companies])
                    conditions.append(f"gl.company IN ({company_list})")
            else:
                conditions.append("gl.company = %(company)s")

        if filters.get("from_date") and filters.get("to_date"):
            conditions.append("gl.posting_date BETWEEN %(from_date)s AND %(to_date)s")
        elif filters.get("from_date"):
            conditions.append("gl.posting_date >= %(from_date)s")
        elif filters.get("to_date"):
            conditions.append("gl.posting_date <= %(to_date)s")

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT
            SUM(gl.debit - gl.credit) as net_vat
        FROM `tabGL Entry` gl
        INNER JOIN `tabAccount` acc ON acc.name = gl.account
        WHERE {where_clause}
    """

    row = frappe.db.sql(query, filters, as_dict=True)

    if row and row[0].get("net_vat"):
        result["vat"] = row[0].get("net_vat")

    return result


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
