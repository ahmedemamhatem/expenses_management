# -*- coding: utf-8 -*-
import frappe
from frappe import _
from frappe.utils import flt, today, getdate, cint


@frappe.whitelist()
def get_employee_loans_analysis(employee, company):
    """Get comprehensive employee loans analysis for Loan Application popup"""
    if not employee or not company:
        frappe.throw(_("Employee and Company are required"))

    employee_name = frappe.db.get_value("Employee", employee, "employee_name") or employee

    # ── Salary Info ──
    salary_info = get_salary_info(employee, company)

    # ── Active Loans ──
    active_loans = frappe.db.sql("""
        SELECT
            name, loan_product, loan_amount, disbursed_amount,
            total_amount_paid, total_principal_paid,
            monthly_repayment_amount, status, days_past_due,
            posting_date, disbursement_date, repay_from_salary
        FROM `tabLoan`
        WHERE docstatus = 1
        AND applicant_type = 'Employee'
        AND applicant = %s
        AND company = %s
        AND status IN ('Active', 'Disbursed', 'Partially Disbursed', 'Sanctioned')
        ORDER BY posting_date DESC
    """, (employee, company), as_dict=True)

    # Calculate outstanding per loan and get EMI details
    total_loan_amount = 0
    total_outstanding = 0
    total_monthly_emi = 0

    for loan in active_loans:
        loan.outstanding = flt(loan.loan_amount) - flt(loan.total_principal_paid)
        total_loan_amount += flt(loan.loan_amount)
        total_outstanding += flt(loan.outstanding)
        total_monthly_emi += flt(loan.monthly_repayment_amount)

        # Get EMI schedule info
        emi_info = get_emi_info(loan.name)
        loan.update(emi_info)

    # ── Loan-to-Salary Ratio ──
    gross_pay = flt(salary_info.get("gross_pay", 0))
    loan_salary_pct = round((total_monthly_emi / gross_pay) * 100, 1) if gross_pay > 0 else 0

    if loan_salary_pct < 30:
        ratio_status = "good"
    elif loan_salary_pct <= 50:
        ratio_status = "warning"
    else:
        ratio_status = "critical"

    # ── Closed Loans Summary ──
    closed_loans = frappe.db.sql("""
        SELECT COUNT(*) as count, COALESCE(SUM(loan_amount), 0) as total_amount
        FROM `tabLoan`
        WHERE docstatus = 1
        AND applicant_type = 'Employee'
        AND applicant = %s
        AND company = %s
        AND status IN ('Closed', 'Settled', 'Written Off')
    """, (employee, company), as_dict=True)

    closed_count = cint(closed_loans[0].count) if closed_loans else 0
    closed_total = flt(closed_loans[0].total_amount) if closed_loans else 0

    return {
        "employee_name": employee_name,
        "salary": salary_info,
        "active_loans": active_loans,
        "total_loan_amount": round(total_loan_amount, 2),
        "total_outstanding": round(total_outstanding, 2),
        "total_monthly_emi": round(total_monthly_emi, 2),
        "loan_salary_pct": loan_salary_pct,
        "ratio_status": ratio_status,
        "closed_count": closed_count,
        "closed_total": round(closed_total, 2)
    }


def get_salary_info(employee, company):
    """Get employee salary from latest Salary Slip and Salary Structure Assignment"""
    # Latest submitted Salary Slip
    latest_slip = frappe.db.sql("""
        SELECT gross_pay, base_gross_pay, net_pay, base_net_pay, posting_date
        FROM `tabSalary Slip`
        WHERE docstatus = 1
        AND employee = %s
        AND company = %s
        ORDER BY posting_date DESC
        LIMIT 1
    """, (employee, company), as_dict=True)

    # Salary Structure Assignment (base salary)
    ssa = frappe.db.sql("""
        SELECT base, variable, from_date
        FROM `tabSalary Structure Assignment`
        WHERE docstatus = 1
        AND employee = %s
        AND company = %s
        ORDER BY from_date DESC
        LIMIT 1
    """, (employee, company), as_dict=True)

    result = {
        "gross_pay": 0,
        "net_pay": 0,
        "base_salary": 0,
        "salary_slip_date": "",
        "ssa_date": ""
    }

    if latest_slip:
        slip = latest_slip[0]
        result["gross_pay"] = flt(slip.base_gross_pay) or flt(slip.gross_pay)
        result["net_pay"] = flt(slip.base_net_pay) or flt(slip.net_pay)
        result["salary_slip_date"] = str(slip.posting_date) if slip.posting_date else ""

    if ssa:
        result["base_salary"] = flt(ssa[0].base)
        result["ssa_date"] = str(ssa[0].from_date) if ssa[0].from_date else ""

    return result


def get_emi_info(loan_name):
    """Get EMI schedule summary for a loan"""
    current_date = today()

    # Get latest active repayment schedule
    schedule = frappe.db.sql("""
        SELECT name, total_installments_paid, total_installments_raised,
               total_installments_overdue, repayment_start_date, maturity_date,
               monthly_repayment_amount
        FROM `tabLoan Repayment Schedule`
        WHERE docstatus = 1
        AND loan = %s
        AND status IN ('Active', 'Initiated')
        ORDER BY posting_date DESC
        LIMIT 1
    """, (loan_name,), as_dict=True)

    if not schedule:
        return {
            "installments_paid": 0,
            "installments_total": 0,
            "installments_overdue": 0,
            "next_emi_date": "",
            "next_emi_amount": 0,
            "maturity_date": ""
        }

    sched = schedule[0]

    # Get next upcoming EMI
    next_emi = frappe.db.sql("""
        SELECT payment_date, total_payment
        FROM `tabRepayment Schedule`
        WHERE parent = %s
        AND payment_date >= %s
        AND demand_generated = 0
        ORDER BY payment_date ASC
        LIMIT 1
    """, (sched.name, current_date), as_dict=True)

    return {
        "installments_paid": cint(sched.total_installments_paid),
        "installments_total": cint(sched.total_installments_raised),
        "installments_overdue": cint(sched.total_installments_overdue),
        "next_emi_date": str(next_emi[0].payment_date) if next_emi else "",
        "next_emi_amount": flt(next_emi[0].total_payment) if next_emi else 0,
        "maturity_date": str(sched.maturity_date) if sched.maturity_date else ""
    }
