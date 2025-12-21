import frappe
from frappe import _


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
    """Validate that expected delivery warehouse is set and available qty is sufficient for each item before submit"""
    errors = []
    for item in doc.items:
        # Check if Expected Delivery Warehouse is set
        if not item.custom_expected_delivery_warehouse:
            errors.append(
                _("Row {0}: Expected Delivery Warehouse is required for item {1}").format(
                    item.idx,
                    item.item_code,
                )
            )
        else:
            # Check available qty
            available = get_available_qty(
                item.item_code, item.custom_expected_delivery_warehouse
            )
            if available < item.qty:
                errors.append(
                    _(
                        "Row {0}: Item {1} has only {2} available in {3}, but {4} is required"
                    ).format(
                        item.idx,
                        item.item_code,
                        available,
                        item.custom_expected_delivery_warehouse,
                        item.qty,
                    )
                )

    if errors:
        frappe.throw("<br>".join(errors), title=_("Validation Error"))


def update_available_qty_on_validate(doc, method=None):
    """Update available qty field for each item on validate"""
    for item in doc.items:
        if item.custom_expected_delivery_warehouse and item.item_code:
            item.custom_available_qty = get_available_qty(
                item.item_code, item.custom_expected_delivery_warehouse
            )
        else:
            item.custom_available_qty = 0
