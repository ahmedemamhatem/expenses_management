import frappe
from frappe import _
from erpnext.stock.get_item_details import get_conversion_factor


@frappe.whitelist()
def get_customer_balance(customer):
    """Get customer balance across all companies from GL Entry"""
    if not customer:
        return 0

    # Get balance from GL Entry (debit - credit) for all companies
    result = frappe.db.sql(
        """
        SELECT COALESCE(SUM(debit - credit), 0) as total_balance
        FROM `tabGL Entry`
        WHERE party_type = 'Customer'
        AND party = %s
        AND is_cancelled = 0
        """,
        (customer,),
        as_dict=True,
    )

    return result[0].total_balance if result else 0


@frappe.whitelist()
def get_customer_overdue_amount(customer):
    """Get customer overdue amount - sum of outstanding from invoices where due_date < today and outstanding > 0"""
    if not customer:
        return 0

    today = frappe.utils.today()

    result = frappe.db.sql(
        """
        SELECT COALESCE(SUM(outstanding_amount), 0) as overdue_amount
        FROM `tabSales Invoice`
        WHERE customer = %s
        AND docstatus = 1
        AND due_date < %s
        AND outstanding_amount > 0
        """,
        (customer, today),
        as_dict=True,
    )

    return result[0].overdue_amount if result else 0


@frappe.whitelist()
def get_available_qty(item_code, warehouse):
    """Get available quantity for an item in a warehouse"""
    if not item_code or not warehouse:
        return 0

    # Get actual qty from Bin
    actual_qty = frappe.db.get_value(
        "Bin",
        {"item_code": item_code, "warehouse": warehouse},
        "actual_qty",
    )

    return actual_qty or 0


def validate_available_qty(doc, method=None):
    """Validate that expected delivery warehouse is set and available qty is sufficient for each item before submit.
    Only validates stock items (is_stock_item = 1)."""

    warehouse_errors = []
    qty_errors = []
    user_roles = frappe.get_roles()

    for item in doc.items:
        # Check if item is a stock item - skip validation for non-stock items
        is_stock_item = frappe.db.get_value("Item", item.item_code, "is_stock_item")
        if not is_stock_item:
            continue

        # Check if Expected Delivery Warehouse is set
        if not item.custom_expected_delivery_warehouse:
            warehouse_errors.append({
                "idx": item.idx,
                "item_code": item.item_code,
                "item_name": item.item_name
            })
        else:
            # Check if validation is excluded for this warehouse
            warehouse_settings = frappe.db.get_value(
                "Warehouse",
                item.custom_expected_delivery_warehouse,
                ["custom_validate_available_qty", "custom_bypass_qty_validation_role"],
                as_dict=True
            )

            # Skip validation for this item if warehouse is excluded (checkbox checked)
            if warehouse_settings and warehouse_settings.custom_validate_available_qty:
                continue

            # Skip validation for this item if user has bypass role
            bypass_role = warehouse_settings.custom_bypass_qty_validation_role if warehouse_settings else None
            if bypass_role and bypass_role in user_roles:
                continue

            # Check available qty (available is in stock UOM)
            available = get_available_qty(
                item.item_code, item.custom_expected_delivery_warehouse
            )

            # Get stock UOM for the item
            stock_uom = frappe.db.get_value("Item", item.item_code, "stock_uom")

            # Convert required qty to stock UOM if different UOM is used
            if item.uom and item.uom != stock_uom:
                conversion_factor = get_conversion_factor(item.item_code, item.uom).get("conversion_factor", 1)
                required_in_stock_uom = item.qty * conversion_factor
            else:
                conversion_factor = 1
                required_in_stock_uom = item.qty

            if available < required_in_stock_uom:
                # Calculate shortage in stock UOM
                shortage_in_stock_uom = required_in_stock_uom - available

                # Convert available and shortage back to item UOM for display
                if conversion_factor != 1:
                    available_in_item_uom = available / conversion_factor
                    shortage_in_item_uom = shortage_in_stock_uom / conversion_factor
                else:
                    available_in_item_uom = available
                    shortage_in_item_uom = shortage_in_stock_uom

                qty_errors.append({
                    "idx": item.idx,
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "available": available_in_item_uom,
                    "required": item.qty,
                    "shortage": shortage_in_item_uom,
                    "warehouse": item.custom_expected_delivery_warehouse,
                    "uom": item.uom or stock_uom,
                    "stock_uom": stock_uom,
                    "conversion_factor": conversion_factor
                })

    if warehouse_errors or qty_errors:
        message = build_error_message(warehouse_errors, qty_errors)
        frappe.throw(message, title=_("⚠️ خطأ في التحقق من المخزون"))


def build_error_message(warehouse_errors, qty_errors):
    """Build formatted error message in Arabic"""
    
    message_parts = []
    
    # Warehouse errors
    if warehouse_errors:
        message_parts.append("""
            <div style="margin-bottom: 15px;">
                <h4 style="color: #e74c3c; margin-bottom: 10px;">
                    <i class="fa fa-warehouse"></i> 
                    مستودع التسليم المتوقع غير محدد
                </h4>
                <table class="table table-bordered table-sm" style="margin: 0;">
                    <thead style="background-color: #f8d7da;">
                        <tr>
                            <th style="text-align: center; width: 60px;">السطر</th>
                            <th style="text-align: center;">رمز الصنف</th>
                            <th style="text-align: center;">اسم الصنف</th>
                        </tr>
                    </thead>
                    <tbody>
        """)
        
        for err in warehouse_errors:
            message_parts.append(f"""
                <tr>
                    <td style="text-align: center;">{err['idx']}</td>
                    <td style="text-align: center;">{err['item_code']}</td>
                    <td style="text-align: center;">{err['item_name']}</td>
                </tr>
            """)
        
        message_parts.append("""
                    </tbody>
                </table>
            </div>
        """)
    
    # Quantity errors
    if qty_errors:
        message_parts.append("""
            <div style="margin-bottom: 15px;">
                <h4 style="color: #e74c3c; margin-bottom: 10px;">
                    <i class="fa fa-exclamation-triangle"></i>
                    الكمية المتوفرة غير كافية
                </h4>
                <table class="table table-bordered table-sm" style="margin: 0;">
                    <thead style="background-color: #f8d7da;">
                        <tr>
                            <th style="text-align: center; width: 60px;">السطر</th>
                            <th style="text-align: center;">الصنف</th>
                            <th style="text-align: center;">المستودع</th>
                            <th style="text-align: center;">المطلوب</th>
                            <th style="text-align: center;">المتوفر</th>
                            <th style="text-align: center;">العجز</th>
                            <th style="text-align: center;">الوحدة</th>
                        </tr>
                    </thead>
                    <tbody>
        """)

        for err in qty_errors:
            # Format quantities for display
            required_display = frappe.utils.flt(err['required'], 3)
            available_display = frappe.utils.flt(err['available'], 3)
            shortage_display = frappe.utils.flt(err['shortage'], 3)
            uom = err.get('uom', '')

            message_parts.append(f"""
                <tr>
                    <td style="text-align: center;">{err['idx']}</td>
                    <td style="text-align: center;">
                        <strong>{err['item_code']}</strong><br>
                        <small style="color: #666;">{err['item_name']}</small>
                    </td>
                    <td style="text-align: center;">{err['warehouse']}</td>
                    <td style="text-align: center; color: #2980b9;">
                        <strong>{required_display}</strong>
                    </td>
                    <td style="text-align: center; color: #27ae60;">
                        <strong>{available_display}</strong>
                    </td>
                    <td style="text-align: center; color: #e74c3c;">
                        <strong>{shortage_display}</strong>
                    </td>
                    <td style="text-align: center;">
                        <strong>{uom}</strong>
                    </td>
                </tr>
            """)
        
        message_parts.append("""
                    </tbody>
                </table>
            </div>
        """)
    
    # Summary
    total_errors = len(warehouse_errors) + len(qty_errors)
    message_parts.append(f"""
        <div style="margin-top: 15px; padding: 10px; background-color: #fff3cd; border-radius: 5px; border-right: 4px solid #ffc107;">
            <strong>📋 ملخص:</strong> 
            تم العثور على <strong style="color: #e74c3c;">{total_errors}</strong> خطأ يجب تصحيحه قبل الإرسال
        </div>
    """)
    
    return "".join(message_parts)


def update_available_qty_on_validate(doc, method=None):
    """Update available qty field for each item on validate and set default warehouse"""

    # Skip if return invoice
    if doc.is_return:
        return

    # Skip if not draft
    if doc.docstatus != 0:
        return

    # Get default warehouse from POS Profile for current user
    default_warehouse = get_user_pos_warehouse()

    for item in doc.items:
        # Set default warehouse if not set
        if not item.custom_expected_delivery_warehouse and default_warehouse:
            item.custom_expected_delivery_warehouse = default_warehouse

        # Update available qty if warehouse is set
        if item.custom_expected_delivery_warehouse and item.item_code:
            item.custom_available_qty = get_available_qty(
                item.item_code, item.custom_expected_delivery_warehouse
            )
        else:
            item.custom_available_qty = 0


def get_user_pos_warehouse():
    """Get warehouse from POS Profile for current user"""

    pos_profile = frappe.db.get_value(
        "POS Profile User",
        {"user": frappe.session.user},
        "parent"
    )

    if pos_profile:
        warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
        return warehouse

    return None


def validate_customer_credit(doc, method=None):
    """Validate customer credit limit and overdue amounts before submitting Sales Invoice

    Credit Limit Logic:
    1. If customer has NO credit limit (0 or not set) → Invoice must be fully paid
    2. If customer HAS credit limit → Check if total outstanding would exceed the limit
    3. Also check for overdue invoices based on credit days
    """

    # Skip if no customer
    if not doc.customer:
        return

    # Skip if this is a Credit Note (return)
    if doc.is_return:
        return

    # Get customer data
    customer = frappe.get_doc("Customer", doc.customer)

    # Check if Stop Payment Terms is set (skip blocking, only warn)
    skip_blocking = customer.get("custom_stop_payment_terms") == 1

    # Get credit limit for the current company
    customer_credit_limit = 0
    bypass_credit_limit = False
    for cl in customer.get("credit_limits", []):
        if cl.company == doc.company:
            customer_credit_limit = frappe.utils.flt(cl.credit_limit)
            bypass_credit_limit = cl.get("bypass_credit_limit_check") == 1
            break

    # Get current total outstanding for this customer (excluding current invoice)
    current_outstanding = get_customer_total_outstanding(doc.customer, doc.company, exclude_invoice=doc.name)

    # Outstanding amount from this invoice
    invoice_outstanding = frappe.utils.flt(doc.outstanding_amount)

    # Case 1: No credit limit (0 or not set) → Must pay fully
    if customer_credit_limit <= 0:
        if invoice_outstanding > 0:
            frappe.throw(
                _("لا يمكن الإرسال! العميل ليس لديه حد ائتماني. يجب أن تكون الفاتورة مدفوعة بالكامل قبل الإرسال.<br><br>"
                  "المبلغ المتبقي: <b>{0}</b> ريال").format(invoice_outstanding),
                title=_("خطأ في الحد الائتماني")
            )
        # If fully paid, allow and skip other checks
        return

    # Case 2: Has credit limit → Check if would exceed limit
    new_total_outstanding = current_outstanding + invoice_outstanding

    if new_total_outstanding > customer_credit_limit and not bypass_credit_limit:
        exceeded_by = new_total_outstanding - customer_credit_limit
        if skip_blocking:
            frappe.msgprint(
                _("تحذير: سيتجاوز العميل الحد الائتماني!<br><br>"
                  "الحد الائتماني: <b>{0}</b> ريال<br>"
                  "الرصيد الحالي: <b>{1}</b> ريال<br>"
                  "هذه الفاتورة: <b>{2}</b> ريال<br>"
                  "الإجمالي الجديد: <b>{3}</b> ريال<br>"
                  "التجاوز: <b>{4}</b> ريال").format(
                    customer_credit_limit, current_outstanding, invoice_outstanding,
                    new_total_outstanding, exceeded_by
                ),
                title=_("تحذير - تجاوز الحد الائتماني"),
                indicator="orange"
            )
        else:
            frappe.throw(
                _("لا يمكن الإرسال! سيتجاوز العميل الحد الائتماني.<br><br>"
                  "الحد الائتماني: <b>{0}</b> ريال<br>"
                  "الرصيد الحالي: <b>{1}</b> ريال<br>"
                  "هذه الفاتورة: <b>{2}</b> ريال<br>"
                  "الإجمالي الجديد: <b>{3}</b> ريال<br>"
                  "التجاوز: <b>{4}</b> ريال").format(
                    customer_credit_limit, current_outstanding, invoice_outstanding,
                    new_total_outstanding, exceeded_by
                ),
                title=_("خطأ - تجاوز الحد الائتماني")
            )

    # Case 3: Check for overdue invoices
    credit_days = 0
    if doc.payment_terms_template:
        payment_terms = frappe.get_doc("Payment Terms Template", doc.payment_terms_template)
        if payment_terms.terms and len(payment_terms.terms) > 0:
            credit_days = frappe.utils.cint(payment_terms.terms[0].credit_days or 0)

    # Get overdue invoices (exclude credit notes & negative outstanding)
    today = frappe.utils.today()
    invoices = frappe.get_all(
        "Sales Invoice",
        filters=[
            ["customer", "=", doc.customer],
            ["docstatus", "=", 1],
            ["is_return", "=", 0]
        ],
        fields=["name", "posting_date", "outstanding_amount"],
        limit=100
    )

    total_overdue = 0
    for inv in invoices:
        amount = frappe.utils.flt(inv.outstanding_amount)

        # Skip negative or zero balances
        if amount <= 0:
            continue

        credit_limit_date = frappe.utils.add_days(inv.posting_date, credit_days)
        if frappe.utils.date_diff(today, credit_limit_date) > 0:
            total_overdue += amount

    # Block only if overdue total is >= 10 SAR
    if total_overdue >= 10:
        if skip_blocking:
            frappe.msgprint(
                _("تحذير: لدى العميل مبالغ متأخرة عن فترة الائتمان (إجمالي: {0} ريال).").format(total_overdue),
                title=_("تحذير"),
                indicator="orange"
            )
        else:
            frappe.throw(
                _("لا يمكن الإرسال! لدى العميل مبالغ متأخرة عن فترة الائتمان (إجمالي: {0} ريال).").format(total_overdue),
                title=_("خطأ في فترة الائتمان")
            )


def get_customer_total_outstanding(customer, company, exclude_invoice=None):
    """Get total outstanding amount for a customer in a specific company"""

    filters = [
        ["customer", "=", customer],
        ["company", "=", company],
        ["docstatus", "=", 1],
        ["outstanding_amount", ">", 0]
    ]

    if exclude_invoice:
        filters.append(["name", "!=", exclude_invoice])

    result = frappe.db.sql(
        """
        SELECT COALESCE(SUM(outstanding_amount), 0) as total_outstanding
        FROM `tabSales Invoice`
        WHERE customer = %s
        AND company = %s
        AND docstatus = 1
        AND outstanding_amount > 0
        {exclude_clause}
        """.format(
            exclude_clause="AND name != %s" if exclude_invoice else ""
        ),
        (customer, company, exclude_invoice) if exclude_invoice else (customer, company),
        as_dict=True
    )

    return frappe.utils.flt(result[0].total_outstanding) if result else 0