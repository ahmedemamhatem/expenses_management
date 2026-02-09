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

    # Skip validation for شركة المهنا التجاريه company
    if doc.company == "شركة المهنا التجاريه":
        return

    if not doc.items:
        return

    warehouse_errors = []
    qty_errors = []
    user_roles = frappe.get_roles()

    # Batch: get is_stock_item and stock_uom for all item codes in ONE query
    item_codes = list(set(item.item_code for item in doc.items if item.item_code))
    if not item_codes:
        return

    item_data = frappe.get_all(
        "Item",
        filters={"name": ["in", item_codes]},
        fields=["name", "is_stock_item", "stock_uom"],
        limit_page_length=0,
    )
    item_map = {d.name: d for d in item_data}

    # Batch: get warehouse settings for all unique warehouses in ONE query
    warehouses = list(set(
        item.custom_expected_delivery_warehouse
        for item in doc.items
        if item.custom_expected_delivery_warehouse
    ))
    wh_map = {}
    if warehouses:
        wh_data = frappe.get_all(
            "Warehouse",
            filters={"name": ["in", warehouses]},
            fields=["name", "custom_validate_available_qty", "custom_bypass_qty_validation_role"],
            limit_page_length=0,
        )
        wh_map = {d.name: d for d in wh_data}

    # Batch: get available qty from Bin for all (item_code, warehouse) pairs
    bin_pairs = list(set(
        (item.item_code, item.custom_expected_delivery_warehouse)
        for item in doc.items
        if item.item_code and item.custom_expected_delivery_warehouse
        and item_map.get(item.item_code, {}).get("is_stock_item")
    ))
    bin_map = {}
    if bin_pairs:
        # Build OR conditions for batch Bin lookup
        bin_item_codes = list(set(p[0] for p in bin_pairs))
        bin_warehouses = list(set(p[1] for p in bin_pairs))
        bin_data = frappe.db.sql("""
            SELECT item_code, warehouse, actual_qty
            FROM `tabBin`
            WHERE item_code IN %(items)s AND warehouse IN %(warehouses)s
        """, {"items": bin_item_codes, "warehouses": bin_warehouses}, as_dict=True)
        for b in bin_data:
            bin_map[(b.item_code, b.warehouse)] = b.actual_qty or 0

    for item in doc.items:
        item_info = item_map.get(item.item_code)
        if not item_info or not item_info.is_stock_item:
            continue

        # Check if Expected Delivery Warehouse is set
        if not item.custom_expected_delivery_warehouse:
            warehouse_errors.append({
                "idx": item.idx,
                "item_code": item.item_code,
                "item_name": item.item_name
            })
        else:
            # Check warehouse settings from batch lookup
            wh_settings = wh_map.get(item.custom_expected_delivery_warehouse)

            if wh_settings and wh_settings.custom_validate_available_qty:
                continue

            bypass_role = wh_settings.custom_bypass_qty_validation_role if wh_settings else None
            if bypass_role and bypass_role in user_roles:
                continue

            # Get available qty from batch lookup
            available = bin_map.get(
                (item.item_code, item.custom_expected_delivery_warehouse), 0
            )

            stock_uom = item_info.stock_uom

            # Convert required qty to stock UOM if different UOM is used
            if item.uom and item.uom != stock_uom:
                conversion_factor = get_conversion_factor(item.item_code, item.uom).get("conversion_factor", 1)
                required_in_stock_uom = item.qty * conversion_factor
            else:
                conversion_factor = 1
                required_in_stock_uom = item.qty

            if available < required_in_stock_uom:
                shortage_in_stock_uom = required_in_stock_uom - available

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

    if not doc.items:
        return

    # Get default warehouse from POS Profile for current user
    default_warehouse = get_user_pos_warehouse()

    # Set default warehouse first
    for item in doc.items:
        if not item.custom_expected_delivery_warehouse and default_warehouse:
            item.custom_expected_delivery_warehouse = default_warehouse

    # Batch: get all Bin quantities in ONE query
    bin_pairs = list(set(
        (item.item_code, item.custom_expected_delivery_warehouse)
        for item in doc.items
        if item.item_code and item.custom_expected_delivery_warehouse
    ))
    bin_map = {}
    if bin_pairs:
        bin_item_codes = list(set(p[0] for p in bin_pairs))
        bin_warehouses = list(set(p[1] for p in bin_pairs))
        bin_data = frappe.db.sql("""
            SELECT item_code, warehouse, actual_qty
            FROM `tabBin`
            WHERE item_code IN %(items)s AND warehouse IN %(warehouses)s
        """, {"items": bin_item_codes, "warehouses": bin_warehouses}, as_dict=True)
        for b in bin_data:
            bin_map[(b.item_code, b.warehouse)] = b.actual_qty or 0

    for item in doc.items:
        if item.custom_expected_delivery_warehouse and item.item_code:
            item.custom_available_qty = bin_map.get(
                (item.item_code, item.custom_expected_delivery_warehouse), 0
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


@frappe.whitelist()
def get_pos_profile_warehouse(owner=None):
    """Get warehouse from POS Profile for a specific user (called from Client Script)"""
    user = owner or frappe.session.user

    pos_profile = frappe.db.get_value(
        "POS Profile User",
        {"user": user},
        "parent"
    )

    if pos_profile:
        warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
        return {"warehouse": warehouse}

    return {"warehouse": None}


def get_customer_gl_balance(customer, company):
    """Get customer balance from GL Entry for a specific company.
    This includes all transactions: invoices, payments, journal entries.
    Positive = customer owes money, Negative = customer has credit/advance.
    """
    if not customer or not company:
        return 0

    result = frappe.db.sql(
        """
        SELECT COALESCE(SUM(debit - credit), 0) as balance
        FROM `tabGL Entry`
        WHERE party_type = 'Customer'
        AND party = %s
        AND company = %s
        AND is_cancelled = 0
        """,
        (customer, company),
        as_dict=True,
    )

    return frappe.utils.flt(result[0].balance) if result else 0


def validate_customer_credit(doc, method=None):
    """Validate customer credit limit and overdue amounts before submitting Sales Invoice

    Credit Limit Logic:
    1. If customer has NO credit limit (0 or not set) → Invoice must be fully paid
    2. If customer HAS credit limit → Check if total balance (from GL) would exceed the limit
    3. Also check for overdue invoices based on due_date (only if outstanding > 1)

    Note: Uses GL Entry balance which includes all transactions (invoices, payments, journal entries)
    not just invoice outstanding amounts, to catch unlinked payments and JE adjustments.
    """

    # Skip if no customer
    if not doc.customer:
        return

    # Skip if this is a Credit Note (return)
    if doc.is_return:
        return

    # Get customer data using direct SQL to avoid import errors from child table doctypes
    # (e.g., KSA Compliance module's Additional Buyer IDs may cause import failures)
    skip_blocking = frappe.db.get_value("Customer", doc.customer, "custom_stop_payment_terms") == 1

    # Get credit limit for the current company using direct SQL
    credit_limit_data = frappe.db.get_value(
        "Customer Credit Limit",
        {"parent": doc.customer, "company": doc.company},
        ["credit_limit", "bypass_credit_limit_check"],
        as_dict=True
    )

    customer_credit_limit = 0
    bypass_credit_limit = False
    if credit_limit_data:
        customer_credit_limit = frappe.utils.flt(credit_limit_data.credit_limit)
        bypass_credit_limit = credit_limit_data.bypass_credit_limit_check == 1

    # Get current GL balance for this customer (includes all: invoices, payments, JEs)
    current_gl_balance = get_customer_gl_balance(doc.customer, doc.company)

    # Get invoice outstanding for comparison/display
    current_invoice_outstanding = get_customer_total_outstanding(doc.customer, doc.company, exclude_invoice=doc.name)

    # Outstanding amount from this invoice
    # During validate, outstanding_amount may not be calculated yet, so compute it manually
    # Outstanding = grand_total (or rounded_total) - paid_amount
    grand_total = frappe.utils.flt(doc.rounded_total) or frappe.utils.flt(doc.grand_total)
    paid_amount = frappe.utils.flt(doc.paid_amount)
    invoice_outstanding = grand_total - paid_amount

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

    # Case 2: Has credit limit → Check if GL balance would exceed limit
    # GL balance is the source of truth (includes all transactions)
    # Invoice outstanding may be wrong if payments weren't linked
    current_balance = current_gl_balance
    new_total_balance = current_balance + invoice_outstanding

    if new_total_balance > customer_credit_limit and not bypass_credit_limit:
        exceeded_by = new_total_balance - customer_credit_limit

        # Show both GL balance and invoice outstanding if they differ significantly
        balance_note = ""
        if abs(current_gl_balance - current_invoice_outstanding) > 1:
            balance_note = _("<br><small>رصيد الفواتير غير المسددة: {0}</small>").format(
                round(current_invoice_outstanding, 2)
            )

        if skip_blocking:
            frappe.msgprint(
                _("تحذير: سيتجاوز العميل الحد الائتماني!<br><br>"
                  "الحد الائتماني: <b>{0}</b> ريال<br>"
                  "الرصيد الحالي: <b>{1}</b> ريال{5}<br>"
                  "هذه الفاتورة: <b>{2}</b> ريال<br>"
                  "الإجمالي الجديد: <b>{3}</b> ريال<br>"
                  "التجاوز: <b>{4}</b> ريال").format(
                    customer_credit_limit, round(current_balance, 2), invoice_outstanding,
                    round(new_total_balance, 2), round(exceeded_by, 2), balance_note
                ),
                title=_("تحذير - تجاوز الحد الائتماني"),
                indicator="orange"
            )
        else:
            frappe.throw(
                _("لا يمكن الإرسال! سيتجاوز العميل الحد الائتماني.<br><br>"
                  "الحد الائتماني: <b>{0}</b> ريال<br>"
                  "الرصيد الحالي: <b>{1}</b> ريال{5}<br>"
                  "هذه الفاتورة: <b>{2}</b> ريال<br>"
                  "الإجمالي الجديد: <b>{3}</b> ريال<br>"
                  "التجاوز: <b>{4}</b> ريال").format(
                    customer_credit_limit, round(current_balance, 2), invoice_outstanding,
                    round(new_total_balance, 2), round(exceeded_by, 2), balance_note
                ),
                title=_("خطأ - تجاوز الحد الائتماني")
            )

    # Case 3: Check for overdue invoices using due_date
    # Only block if customer has NO credit limit or would exceed credit limit
    # If within credit limit, just show warning for overdue invoices
    today = frappe.utils.today()

    # ✅ Get overdue invoices - only where outstanding > 1 SAR
    overdue_invoices = frappe.db.sql("""
        SELECT name, due_date, outstanding_amount
        FROM `tabSales Invoice`
        WHERE customer = %s
          AND company = %s
          AND docstatus = 1
          AND is_return = 0
          AND outstanding_amount > 1
          AND due_date < %s
        ORDER BY due_date ASC
    """, (doc.customer, doc.company, today), as_dict=True)

    # Calculate total overdue (only amounts > 1 are included)
    total_overdue = sum(frappe.utils.flt(inv.outstanding_amount) for inv in overdue_invoices)

    # ✅ Check overdue invoices - but allow if within credit limit
    if total_overdue > 0:
        # Build invoice details (show first 5)
        invoice_details = ""
        for i, inv in enumerate(overdue_invoices[:5]):
            invoice_details += "• {0} - {1} ريال (تاريخ الاستحقاق: {2})<br>".format(
                inv.name,
                round(inv.outstanding_amount, 2),
                inv.due_date
            )

        if len(overdue_invoices) > 5:
            invoice_details += "• ... و {0} فواتير أخرى".format(len(overdue_invoices) - 5)

        message = _(
            "لدى العميل مبالغ متأخرة عن تاريخ الاستحقاق.<br><br>"
            "<b>إجمالي المبالغ المتأخرة: {0} ريال</b><br><br>"
            "<b>الفواتير المتأخرة:</b><br>{1}"
        ).format(round(total_overdue, 2), invoice_details)

        # If customer has credit limit and new balance is within limit, just show warning
        # Otherwise block (unless skip_blocking is enabled)
        within_credit_limit = customer_credit_limit > 0 and new_total_balance <= customer_credit_limit

        if skip_blocking or within_credit_limit:
            frappe.msgprint(
                msg=message,
                title=_("تحذير: مبالغ متأخرة"),
                indicator="orange"
            )
        else:
            frappe.throw(
                msg=_("لا يمكن الإرسال! ") + message,
                title=_("خطأ - فواتير متأخرة")
            )


def get_customer_total_outstanding(customer, company, exclude_invoice=None):
    """Get total outstanding amount for a customer in a specific company"""

    if exclude_invoice:
        result = frappe.db.sql(
            """
            SELECT COALESCE(SUM(outstanding_amount), 0) as total_outstanding
            FROM `tabSales Invoice`
            WHERE customer = %s
              AND company = %s
              AND docstatus = 1
              AND outstanding_amount > 0
              AND name != %s
            """,
            (customer, company, exclude_invoice),
            as_dict=True
        )
    else:
        result = frappe.db.sql(
            """
            SELECT COALESCE(SUM(outstanding_amount), 0) as total_outstanding
            FROM `tabSales Invoice`
            WHERE customer = %s
              AND company = %s
              AND docstatus = 1
              AND outstanding_amount > 0
            """,
            (customer, company),
            as_dict=True
        )

    return frappe.utils.flt(result[0].total_outstanding) if result else 0


@frappe.whitelist()
def get_item_weight(item_code):
    """Get item weight per unit and convert to kg for ton rate calculation.

    Returns:
        dict: {
            weight_per_unit: original weight,
            weight_uom: original UOM,
            weight_in_kg: weight converted to kg
        }
    """
    if not item_code:
        return {"weight_per_unit": 0, "weight_uom": "", "weight_in_kg": 0}

    item = frappe.db.get_value(
        "Item",
        item_code,
        ["weight_per_unit", "weight_uom"],
        as_dict=True
    )

    if not item or not item.weight_per_unit:
        return {"weight_per_unit": 0, "weight_uom": "", "weight_in_kg": 0}

    weight = frappe.utils.flt(item.weight_per_unit)
    weight_uom = item.weight_uom or "Kg"

    # Convert to kg
    weight_in_kg = convert_weight_to_kg(weight, weight_uom)

    return {
        "weight_per_unit": weight,
        "weight_uom": weight_uom,
        "weight_in_kg": weight_in_kg
    }


def convert_weight_to_kg(weight, from_uom):
    """Convert weight to kilograms"""
    if not from_uom or from_uom.lower() in ["kg", "kilogram", "kilograms"]:
        return weight

    # Try to get conversion factor from UOM Conversion Factor
    conversion = frappe.db.get_value(
        "UOM Conversion Factor",
        {"from_uom": from_uom, "to_uom": "Kg"},
        "value"
    )

    if conversion:
        return frappe.utils.flt(weight) * frappe.utils.flt(conversion)

    # Try reverse conversion
    conversion = frappe.db.get_value(
        "UOM Conversion Factor",
        {"from_uom": "Kg", "to_uom": from_uom},
        "value"
    )

    if conversion and frappe.utils.flt(conversion) > 0:
        return frappe.utils.flt(weight) / frappe.utils.flt(conversion)

    # Common conversions if not found in UOM Conversion Factor
    common_conversions = {
        "gram": 0.001,
        "grams": 0.001,
        "g": 0.001,
        "ton": 1000,
        "tons": 1000,
        "tonne": 1000,
        "tonnes": 1000,
        "pound": 0.453592,
        "pounds": 0.453592,
        "lb": 0.453592,
        "lbs": 0.453592,
        "ounce": 0.0283495,
        "ounces": 0.0283495,
        "oz": 0.0283495
    }

    from_uom_lower = from_uom.lower()
    if from_uom_lower in common_conversions:
        return frappe.utils.flt(weight) * common_conversions[from_uom_lower]

    # Default: assume it's already in kg
    return weight


def validate_item_rate_limits(doc, method=None):
    """Validate that item rates in Sales Invoice are within min/max limits defined in Item Price.

    This validation checks each item's rate against the custom_minimum_rate and custom_maximum_rate
    fields in the Item Price record for the corresponding price list.
    """

    # Skip if return invoice
    if doc.is_return:
        return

    # Skip if no selling_price_list
    if not doc.selling_price_list:
        return

    if not doc.items:
        return

    # Batch: get all Item Prices for items in this invoice + price list in ONE query
    item_codes = list(set(item.item_code for item in doc.items if item.item_code))
    if not item_codes:
        return

    price_data = frappe.db.sql("""
        SELECT item_code, custom_minimum_rate, custom_maximum_rate, price_list_rate
        FROM `tabItem Price`
        WHERE item_code IN %(items)s
        AND price_list = %(price_list)s
    """, {"items": item_codes, "price_list": doc.selling_price_list}, as_dict=True)

    price_map = {p.item_code: p for p in price_data}

    rate_errors = []

    for item in doc.items:
        if not item.item_code:
            continue

        item_price = price_map.get(item.item_code)
        if not item_price:
            continue

        min_rate = frappe.utils.flt(item_price.custom_minimum_rate)
        max_rate = frappe.utils.flt(item_price.custom_maximum_rate)
        item_rate = frappe.utils.flt(item.rate)

        # Skip if no min/max limits are defined
        if min_rate <= 0 and max_rate <= 0:
            continue

        error_type = None

        # Check minimum rate
        if min_rate > 0 and item_rate < min_rate:
            error_type = "below_min"

        # Check maximum rate
        if max_rate > 0 and item_rate > max_rate:
            error_type = "above_max"

        if error_type:
            rate_errors.append({
                "idx": item.idx,
                "item_code": item.item_code,
                "item_name": item.item_name,
                "rate": item_rate,
                "min_rate": min_rate,
                "max_rate": max_rate,
                "standard_rate": frappe.utils.flt(item_price.price_list_rate),
                "error_type": error_type
            })

    if rate_errors:
        message = build_rate_limit_error_message(rate_errors)
        frappe.throw(message, title=_("خطأ في سعر الصنف"))


def build_rate_limit_error_message(rate_errors):
    """Build formatted error message for rate limit violations in Arabic"""

    message_parts = []

    message_parts.append("""
        <div style="margin-bottom: 15px;">
            <h4 style="color: #e74c3c; margin-bottom: 10px;">
                <i class="fa fa-exclamation-triangle"></i>
                سعر الصنف خارج النطاق المسموح
            </h4>
            <table class="table table-bordered table-sm" style="margin: 0;">
                <thead style="background-color: #f8d7da;">
                    <tr>
                        <th style="text-align: center; width: 60px;">السطر</th>
                        <th style="text-align: center;">الصنف</th>
                        <th style="text-align: center;">السعر المدخل</th>
                        <th style="text-align: center;">الحد الأدنى</th>
                        <th style="text-align: center;">الحد الأقصى</th>
                        <th style="text-align: center;">السعر المعياري</th>
                        <th style="text-align: center;">الخطأ</th>
                    </tr>
                </thead>
                <tbody>
    """)

    for err in rate_errors:
        error_text = "أقل من الحد الأدنى" if err['error_type'] == "below_min" else "أعلى من الحد الأقصى"
        error_color = "#e74c3c"

        min_display = frappe.utils.fmt_money(err['min_rate']) if err['min_rate'] > 0 else "-"
        max_display = frappe.utils.fmt_money(err['max_rate']) if err['max_rate'] > 0 else "-"

        message_parts.append(f"""
            <tr>
                <td style="text-align: center;">{err['idx']}</td>
                <td style="text-align: center;">
                    <strong>{err['item_code']}</strong><br>
                    <small style="color: #666;">{err['item_name']}</small>
                </td>
                <td style="text-align: center; color: {error_color};">
                    <strong>{frappe.utils.fmt_money(err['rate'])}</strong>
                </td>
                <td style="text-align: center; color: #27ae60;">
                    {min_display}
                </td>
                <td style="text-align: center; color: #e67e22;">
                    {max_display}
                </td>
                <td style="text-align: center; color: #2980b9;">
                    {frappe.utils.fmt_money(err['standard_rate'])}
                </td>
                <td style="text-align: center; color: {error_color};">
                    <strong>{error_text}</strong>
                </td>
            </tr>
        """)

    message_parts.append("""
                </tbody>
            </table>
        </div>
    """)

    # Summary
    message_parts.append(f"""
        <div style="margin-top: 15px; padding: 10px; background-color: #fff3cd; border-radius: 5px; border-right: 4px solid #ffc107;">
            <strong>ملاحظة:</strong>
            يجب تعديل الأسعار لتكون ضمن النطاق المسموح أو التواصل مع المسؤول للحصول على إذن
        </div>
    """)

    return "".join(message_parts)