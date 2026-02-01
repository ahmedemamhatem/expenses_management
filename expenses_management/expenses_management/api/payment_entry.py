# -*- coding: utf-8 -*-
import frappe
from frappe import _
from frappe.utils import flt, today, getdate, fmt_money


@frappe.whitelist()
def get_customer_analysis(customer, company):
    """Get comprehensive customer financial analysis for Payment Entry popup"""
    if not customer or not company:
        frappe.throw(_("Customer and Company are required"))

    customer_name = frappe.db.get_value("Customer", customer, "customer_name") or customer

    # Total balance from GL Entry (debit - credit) - the TRUE balance
    gl_result = frappe.db.sql("""
        SELECT
            COALESCE(SUM(debit), 0) as total_debit,
            COALESCE(SUM(credit), 0) as total_credit,
            COALESCE(SUM(debit - credit), 0) as balance
        FROM `tabGL Entry`
        WHERE party_type = 'Customer'
        AND party = %s
        AND company = %s
        AND is_cancelled = 0
    """, (customer, company), as_dict=True)
    total_balance = flt(gl_result[0].balance) if gl_result else 0

    # Total outstanding from Sales Invoices (may differ from GL if JEs/unlinked payments exist)
    outstanding_result = frappe.db.sql("""
        SELECT COALESCE(SUM(outstanding_amount), 0) as total_outstanding,
               COUNT(*) as invoice_count
        FROM `tabSales Invoice`
        WHERE customer = %s
        AND company = %s
        AND docstatus = 1
        AND outstanding_amount > 0
    """, (customer, company), as_dict=True)
    total_outstanding = flt(outstanding_result[0].total_outstanding) if outstanding_result else 0
    outstanding_invoice_count = outstanding_result[0].invoice_count if outstanding_result else 0

    # Unlinked adjustments (JE credits not reflected in SI outstanding)
    unlinked_adjustment = flt(total_outstanding - total_balance, 2)

    # Total overdue (past due_date)
    current_date = today()
    overdue_result = frappe.db.sql("""
        SELECT COALESCE(SUM(outstanding_amount), 0) as total_overdue,
               COUNT(*) as overdue_count
        FROM `tabSales Invoice`
        WHERE customer = %s
        AND company = %s
        AND docstatus = 1
        AND outstanding_amount > 0
        AND due_date < %s
    """, (customer, company, current_date), as_dict=True)
    total_overdue = flt(overdue_result[0].total_overdue) if overdue_result else 0
    overdue_count = overdue_result[0].overdue_count if overdue_result else 0

    # All outstanding invoices (top 20)
    all_outstanding_invoices = frappe.db.sql("""
        SELECT name, due_date, outstanding_amount, grand_total, posting_date,
               CASE WHEN due_date < %s THEN 1 ELSE 0 END as is_overdue
        FROM `tabSales Invoice`
        WHERE customer = %s
        AND company = %s
        AND docstatus = 1
        AND outstanding_amount > 0
        ORDER BY due_date ASC
        LIMIT 20
    """, (current_date, customer, company), as_dict=True)

    # Recent payments (last 5)
    recent_payments = frappe.db.sql("""
        SELECT name, posting_date, paid_amount, mode_of_payment, reference_no
        FROM `tabPayment Entry`
        WHERE party_type = 'Customer'
        AND party = %s
        AND company = %s
        AND docstatus = 1
        AND payment_type = 'Receive'
        ORDER BY posting_date DESC
        LIMIT 5
    """, (customer, company), as_dict=True)

    # Credit limit
    credit_limit_data = frappe.db.get_value(
        "Customer Credit Limit",
        {"parent": customer, "company": company},
        "credit_limit",
        as_dict=True
    )
    credit_limit = flt(credit_limit_data.credit_limit) if credit_limit_data else 0
    credit_remaining = max(0, credit_limit - total_balance) if credit_limit > 0 else 0
    credit_used_pct = round((total_balance / credit_limit) * 100, 1) if credit_limit > 0 else 0

    # Determine status
    if credit_limit <= 0 and total_outstanding > 0:
        status = "blocked"
    elif credit_limit > 0 and total_balance > credit_limit:
        status = "blocked"
    elif total_overdue > 0:
        status = "warning"
    else:
        status = "good"

    return {
        "customer_name": customer_name,
        "total_balance": round(total_balance, 2),
        "total_outstanding": round(total_outstanding, 2),
        "outstanding_invoice_count": outstanding_invoice_count,
        "unlinked_adjustment": round(unlinked_adjustment, 2),
        "total_overdue": round(total_overdue, 2),
        "overdue_count": overdue_count,
        "all_outstanding_invoices": all_outstanding_invoices,
        "recent_payments": recent_payments,
        "credit_limit": round(credit_limit, 2),
        "credit_remaining": round(credit_remaining, 2),
        "credit_used_pct": credit_used_pct,
        "status": status
    }
