# -*- coding: utf-8 -*-
# Copyright (c) 2024, Expenses Management
# License: MIT

import frappe
from frappe import _
from frappe.utils import flt, getdate, formatdate, cint

def check_user_permission(doctype, value):
    """Check if user has permission to access the given document"""
    if frappe.session.user == "Administrator":
        return True

    # Check if user has permission for this doctype/value
    user_permissions = frappe.get_all(
        "User Permission",
        filters={
            "user": frappe.session.user,
            "allow": doctype,
            "for_value": value
        },
        limit=1
    )

    # If user has specific permissions set, check if this value is in them
    all_user_permissions = frappe.get_all(
        "User Permission",
        filters={
            "user": frappe.session.user,
            "allow": doctype
        },
        limit=1
    )

    # If no permissions are set for this doctype, allow access
    if not all_user_permissions:
        return True

    # If permissions are set, check if this specific value is allowed
    return bool(user_permissions)


def get_permitted_customers():
    """Get list of customers the current user has access to"""
    if frappe.session.user == "Administrator":
        return None  # No filter needed

    user_permissions = frappe.get_all(
        "User Permission",
        filters={
            "user": frappe.session.user,
            "allow": "Customer"
        },
        pluck="for_value"
    )

    # If no customer permissions set, user has access to all
    if not user_permissions:
        return None

    return user_permissions


def get_permitted_companies():
    """Get list of companies the current user has access to"""
    if frappe.session.user == "Administrator":
        return None  # No filter needed

    user_permissions = frappe.get_all(
        "User Permission",
        filters={
            "user": frappe.session.user,
            "allow": "Company"
        },
        pluck="for_value"
    )

    # If no company permissions set, user has access to all
    if not user_permissions:
        return None

    return user_permissions


@frappe.whitelist()
def get_customer_ledger(customer, company=None, from_date=None, to_date=None):
    """
    Get customer ledger with all transactions (Sales Invoices, Payment Entries, Journal Entries)
    Returns debit, credit, running balance for each transaction
    Applies user permission filters for Customer and Company
    """
    if not customer:
        frappe.throw(_("Customer is required"))

    # Check customer permission
    if not check_user_permission("Customer", customer):
        frappe.throw(_("ليس لديك صلاحية للوصول إلى هذا العميل"))

    # Get customer info
    customer_doc = frappe.get_doc("Customer", customer)
    customer_name = customer_doc.customer_name

    # Default company
    if not company:
        company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")

    # Check company permission
    if company and not check_user_permission("Company", company):
        frappe.throw(_("ليس لديك صلاحية للوصول إلى هذه الشركة"))

    # Default dates - last 1 year
    if not from_date:
        from_date = frappe.utils.add_months(frappe.utils.today(), -12)
    if not to_date:
        to_date = frappe.utils.today()

    # Ensure dates are in proper format
    from_date = getdate(from_date)
    to_date = getdate(to_date)

    # Get opening balance (all transactions before from_date)
    opening_balance = get_opening_balance(customer, company, from_date)

    # Get all GL entries for the customer within date range
    gl_entries = frappe.db.sql("""
        SELECT
            gle.posting_date,
            gle.voucher_type,
            gle.voucher_no,
            gle.debit,
            gle.credit,
            gle.remarks,
            gle.against_voucher_type,
            gle.against_voucher
        FROM `tabGL Entry` gle
        WHERE gle.party_type = 'Customer'
        AND gle.party = %(customer)s
        AND gle.company = %(company)s
        AND gle.posting_date BETWEEN %(from_date)s AND %(to_date)s
        AND gle.is_cancelled = 0
        ORDER BY gle.posting_date ASC, gle.creation ASC
    """, {
        "customer": customer,
        "company": company,
        "from_date": from_date,
        "to_date": to_date
    }, as_dict=1)

    # Process entries and calculate running balance
    ledger_entries = []
    running_balance = flt(opening_balance, 2)
    total_debit = 0
    total_credit = 0

    for entry in gl_entries:
        debit = flt(entry.debit, 2)
        credit = flt(entry.credit, 2)
        running_balance = flt(running_balance + debit - credit, 2)
        total_debit += debit
        total_credit += credit

        # Get description based on voucher type
        description = get_transaction_description(entry)

        ledger_entries.append({
            "posting_date": str(entry.posting_date),
            "posting_date_formatted": formatdate(entry.posting_date, "dd-MM-yyyy"),
            "voucher_type": entry.voucher_type,
            "voucher_type_ar": get_voucher_type_arabic(entry.voucher_type),
            "voucher_no": entry.voucher_no,
            "description": description,
            "debit": debit,
            "credit": credit,
            "balance": running_balance
        })

    # Get credit limit and credit days
    credit_limit = get_customer_credit_limit(customer, company)
    credit_days = get_customer_credit_days(customer)

    return {
        "customer": customer,
        "customer_name": customer_name,
        "company": company,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "from_date_formatted": formatdate(from_date, "dd-MM-yyyy"),
        "to_date_formatted": formatdate(to_date, "dd-MM-yyyy"),
        "opening_balance": flt(opening_balance, 2),
        "entries": ledger_entries,
        "total_debit": flt(total_debit, 2),
        "total_credit": flt(total_credit, 2),
        "closing_balance": running_balance,
        "credit_limit": flt(credit_limit, 2),
        "credit_days": cint(credit_days),
        "available_credit": flt(credit_limit - running_balance, 2) if credit_limit else 0
    }


def get_opening_balance(customer, company, from_date):
    """Get the opening balance before the from_date"""
    result = frappe.db.sql("""
        SELECT
            COALESCE(SUM(debit) - SUM(credit), 0) as opening_balance
        FROM `tabGL Entry`
        WHERE party_type = 'Customer'
        AND party = %(customer)s
        AND company = %(company)s
        AND posting_date < %(from_date)s
        AND is_cancelled = 0
    """, {
        "customer": customer,
        "company": company,
        "from_date": from_date
    }, as_dict=1)

    return flt(result[0].opening_balance if result else 0, 2)


def get_transaction_description(entry):
    """Get Arabic description for the transaction with enhanced details"""
    voucher_type = entry.voucher_type
    voucher_no = entry.voucher_no
    remarks = entry.remarks or ""

    if voucher_type == "Sales Invoice":
        # Get more details from Sales Invoice
        invoice_data = frappe.db.get_value("Sales Invoice", voucher_no,
            ["is_return", "remarks", "po_no", "po_date"], as_dict=True)
        if invoice_data:
            if invoice_data.is_return:
                desc = "مرتجع مبيعات"
            else:
                desc = "فاتورة مبيعات"

            # Get invoice items - item name, qty and uom
            items = frappe.db.sql("""
                SELECT item_name, qty, uom
                FROM `tabSales Invoice Item`
                WHERE parent = %s
                ORDER BY idx
                LIMIT 5
            """, voucher_no, as_dict=True)

            if items:
                item_details = []
                for item in items:
                    qty = int(item.qty) if item.qty == int(item.qty) else item.qty
                    uom = item.uom or ""
                    item_details.append(f"{item.item_name}({qty} {uom})")
                desc += " - " + ", ".join(item_details)

                # Check if there are more items
                total_items = frappe.db.count("Sales Invoice Item", {"parent": voucher_no})
                if total_items > 5:
                    desc += f" +{total_items - 5} أخرى"
            elif invoice_data.remarks:
                desc += f" - {invoice_data.remarks[:60]}"
            return desc
        return "فاتورة مبيعات"

    elif voucher_type == "Payment Entry":
        payment_data = frappe.db.get_value("Payment Entry", voucher_no,
            ["payment_type", "mode_of_payment", "reference_no", "remarks"], as_dict=True)
        if payment_data:
            if payment_data.payment_type == "Receive":
                desc = "تحصيل"
            elif payment_data.payment_type == "Pay":
                desc = "صرف"
            else:
                desc = "دفعة"

            # Add mode of payment
            if payment_data.mode_of_payment:
                desc += f" - {payment_data.mode_of_payment}"

            # Add reference or remarks
            if payment_data.reference_no:
                desc += f" - مرجع: {payment_data.reference_no}"
            elif payment_data.remarks:
                desc += f" - {payment_data.remarks[:40]}"
            return desc
        return "سند دفع"

    elif voucher_type == "Journal Entry":
        je_data = frappe.db.get_value("Journal Entry", voucher_no,
            ["user_remark", "cheque_no", "cheque_date"], as_dict=True)
        if je_data:
            desc = "قيد يومية"
            if je_data.user_remark:
                desc += f" - {je_data.user_remark[:60]}"
            elif je_data.cheque_no:
                desc += f" - شيك رقم: {je_data.cheque_no}"
            elif remarks:
                desc += f" - {remarks[:60]}"
            return desc
        return f"قيد يومية - {remarks[:60]}" if remarks else "قيد يومية"

    elif voucher_type == "Delivery Note":
        dn_data = frappe.db.get_value("Delivery Note", voucher_no, ["po_no", "remarks"], as_dict=True)
        if dn_data:
            desc = "إذن تسليم"
            if dn_data.remarks:
                desc += f" - {dn_data.remarks[:50]}"
            elif dn_data.po_no:
                desc += f" - طلب: {dn_data.po_no}"
            return desc
        return "إذن تسليم"

    elif voucher_type == "Sales Order":
        so_data = frappe.db.get_value("Sales Order", voucher_no, ["po_no", "remarks"], as_dict=True)
        if so_data:
            desc = "أمر بيع"
            if so_data.remarks:
                desc += f" - {so_data.remarks[:50]}"
            elif so_data.po_no:
                desc += f" - طلب شراء: {so_data.po_no}"
            return desc
        return "أمر بيع"

    else:
        return remarks[:60] if remarks else voucher_type


def get_voucher_type_arabic(voucher_type):
    """Get Arabic name for voucher type"""
    types = {
        "Sales Invoice": "فاتورة مبيعات",
        "Payment Entry": "سند قبض/صرف",
        "Journal Entry": "قيد يومية",
        "Delivery Note": "إذن تسليم",
        "Sales Order": "أمر بيع",
        "Purchase Invoice": "فاتورة مشتريات",
        "Stock Entry": "حركة مخزون"
    }
    return types.get(voucher_type, voucher_type)


def get_customer_credit_limit(customer, company):
    """Get customer credit limit for company"""
    credit_limit = frappe.db.get_value(
        "Customer Credit Limit",
        {"parent": customer, "company": company},
        "credit_limit"
    )
    return flt(credit_limit, 2)


def get_customer_credit_days(customer):
    """Get customer credit days from payment terms"""
    payment_terms = frappe.db.get_value("Customer", customer, "payment_terms")
    if not payment_terms:
        return 0

    credit_days = frappe.db.get_value(
        "Payment Terms Template Detail",
        {"parent": payment_terms},
        "credit_days",
        order_by="credit_days desc"
    )
    return cint(credit_days)


@frappe.whitelist()
def get_customer_ledger_html(customer, company=None, from_date=None, to_date=None):
    """Generate HTML for customer ledger print"""
    data = get_customer_ledger(customer, company, from_date, to_date)

    # Get company info
    company_doc = frappe.get_doc("Company", data["company"])
    company_name = company_doc.company_name

    # Get print metadata
    print_date = frappe.utils.formatdate(frappe.utils.today(), "dd-MM-yyyy")
    print_time = frappe.utils.nowtime()[:5]
    printed_by = frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user

    html = f"""
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>كشف حساب العميل - {data['customer_name']}</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
                font-size: 14px;
                direction: rtl;
                padding: 20px;
                background: #fff;
                color: #000;
            }}
            .header {{
                text-align: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 3px solid #000;
            }}
            .header h1 {{
                font-size: 28px;
                font-weight: 900;
                margin-bottom: 8px;
                color: #000;
            }}
            .header .company {{
                font-size: 18px;
                font-weight: 700;
                color: #000;
            }}
            .info-section {{
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 10px;
                padding: 8px 10px;
                border: 1px solid #000;
                gap: 20px;
            }}
            .info-box {{
                flex: 1;
                padding: 0 10px;
                border-left: 1px solid #ccc;
            }}
            .info-box:last-child {{
                border-left: none;
            }}
            .info-box h3 {{
                font-size: 11px;
                font-weight: 700;
                color: #000;
                margin-bottom: 5px;
                border-bottom: 1px solid #000;
                padding-bottom: 3px;
            }}
            .info-item {{
                display: flex;
                justify-content: space-between;
                margin-bottom: 3px;
                font-size: 11px;
            }}
            .info-item .label {{
                font-weight: normal;
                color: #000;
            }}
            .info-item .value {{
                font-weight: 700;
                color: #000;
            }}

            .ledger-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }}
            .ledger-table th {{
                background: #000;
                color: #fff;
                padding: 12px 8px;
                text-align: center;
                font-weight: 900;
                font-size: 14px;
                border: 2px solid #000;
            }}
            .ledger-table td {{
                border: 1px solid #000;
                padding: 10px 8px;
                text-align: center;
                font-weight: 700;
                font-size: 13px;
                color: #000;
            }}
            .ledger-table .date-col {{ width: 100px; white-space: nowrap; }}
            .ledger-table .ref-col {{ width: 200px; font-size: 12px; text-align: right; padding-right: 10px; }}
            .ledger-table .desc-col {{ text-align: right; padding-right: 15px; font-size: 11px; font-weight: normal; }}
            .ledger-table .amount-col {{ width: 120px; font-weight: 900; }}

            .opening-row {{ font-weight: 900; }}
            .closing-row {{ font-weight: 900; border-top: 2px solid #000; }}

            .footer-section {{
                margin-top: 15px;
                padding: 8px 0;
                border-top: 1px solid #000;
                text-align: center;
            }}
            .footer-text {{
                font-size: 10px;
                color: #000;
                margin-bottom: 5px;
            }}
            .print-info {{
                font-size: 9px;
                color: #666;
            }}

            @media print {{
                body {{ padding: 10mm; font-size: 12px; }}
                .ledger-table {{ page-break-inside: auto; }}
                .ledger-table tr {{ page-break-inside: avoid; page-break-after: auto; }}
                .ledger-table thead {{ display: table-header-group; }}
                .ledger-table th {{ font-size: 12px; padding: 8px 5px; }}
                .ledger-table td {{ font-size: 11px; padding: 6px 5px; }}
                .info-section {{ padding: 5px; page-break-inside: avoid; }}
                .footer-section {{ page-break-inside: avoid; }}
                @page {{
                    size: A4 landscape;
                    margin: 10mm;
                    @bottom-center {{
                        content: "صفحة " counter(page) " من " counter(pages);
                        font-size: 10px;
                        font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
                    }}
                }}
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>كشف حساب العميل</h1>
            <div class="company">{company_name}</div>
        </div>

        <div class="info-section">
            <div class="info-box">
                <h3>بيانات العميل</h3>
                <div class="info-item">
                    <span class="label">كود العميل:</span>
                    <span class="value">{data['customer']}</span>
                </div>
                <div class="info-item">
                    <span class="label">اسم العميل:</span>
                    <span class="value">{data['customer_name']}</span>
                </div>
            </div>
            <div class="info-box">
                <h3>فترة الكشف</h3>
                <div class="info-item">
                    <span class="label">من تاريخ:</span>
                    <span class="value">{data['from_date_formatted']}</span>
                </div>
                <div class="info-item">
                    <span class="label">إلى تاريخ:</span>
                    <span class="value">{data['to_date_formatted']}</span>
                </div>
            </div>
            <div class="info-box">
                <h3>ملخص الحساب</h3>
                <div class="info-item">
                    <span class="label">الرصيد الحالي:</span>
                    <span class="value">{format_currency(data['closing_balance'])}</span>
                </div>
            </div>
        </div>

        <table class="ledger-table">
            <thead>
                <tr>
                    <th class="date-col">التاريخ</th>
                    <th class="ref-col">المستند</th>
                    <th class="desc-col">البيان</th>
                    <th class="amount-col">مدين</th>
                    <th class="amount-col">دائن</th>
                    <th class="amount-col">الرصيد</th>
                </tr>
            </thead>
            <tbody>
                <tr class="opening-row">
                    <td colspan="3" style="text-align: right; padding-right: 20px;">رصيد أول المدة</td>
                    <td></td>
                    <td></td>
                    <td class="balance">{format_currency(data['opening_balance'])}</td>
                </tr>
    """

    for entry in data["entries"]:
        # Combine voucher type and number
        voucher_ref = f"{entry['voucher_type_ar']}<br/><small>{entry['voucher_no']}</small>"
        html += f"""
                <tr>
                    <td class="date-col">{entry['posting_date_formatted']}</td>
                    <td class="ref-col">{voucher_ref}</td>
                    <td class="desc-col">{entry['description']}</td>
                    <td class="amount-col">{format_currency(entry['debit']) if entry['debit'] else '-'}</td>
                    <td class="amount-col">{format_currency(entry['credit']) if entry['credit'] else '-'}</td>
                    <td class="amount-col">{format_currency(entry['balance'])}</td>
                </tr>
        """

    html += f"""
                <tr class="closing-row">
                    <td colspan="3" style="text-align: right; padding-right: 20px;">رصيد آخر المدة</td>
                    <td class="amount-col">{format_currency(data['total_debit'])}</td>
                    <td class="amount-col">{format_currency(data['total_credit'])}</td>
                    <td class="amount-col">{format_currency(data['closing_balance'])}</td>
                </tr>
            </tbody>
        </table>

        <div class="footer-section">
            <div class="footer-text">هذا كشف حساب رسمي صادر من النظام</div>
            <div class="print-info">تاريخ الطباعة: {print_date} {print_time} | طبع بواسطة: {printed_by}</div>
        </div>
    </body>
    </html>
    """

    return html


def format_currency(amount):
    """Format currency with thousands separator"""
    if amount is None:
        return "0.00"
    return "{:,.2f}".format(flt(amount, 2))
