# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, today, cint

from expenses_management.expenses_management.doctype.stock_reservation.stock_reservation import (
    create_reservation,
    cancel_reservation,
    mark_reservation_delivered,
    get_available_qty,
    get_reserved_qty,
    validate_stock_availability
)

from expenses_management.expenses_management.doctype.stock_reservation_settings.stock_reservation_settings import (
    is_reservation_enabled,
    is_enabled_for_doctype,
    get_stock_entry_types,
    can_bypass_reservation,
    should_validate_on_save
)


# ============================================
# SALES INVOICE HANDLERS
# ============================================

def sales_invoice_on_submit(doc, method):
    """
    On Sales Invoice submit: Create reservations for each item
    """
    if not is_enabled_for_doctype("Sales Invoice"):
        return

    if doc.is_return:
        # For returns, cancel the original invoice reservations if any
        if doc.return_against:
            handle_sales_invoice_return(doc)
        return

    if doc.update_stock:
        # If update_stock is enabled, stock is directly reduced, no reservation needed
        return

    for item in doc.items:
        if not item.item_code or not item.warehouse:
            continue

        # Skip non-stock items
        if not frappe.db.get_value("Item", item.item_code, "is_stock_item"):
            continue

        create_reservation(
            item_code=item.item_code,
            warehouse=item.warehouse,
            qty=flt(item.stock_qty),
            voucher_type="Sales Invoice",
            voucher_no=doc.name,
            voucher_detail_no=item.name,
            company=doc.company,
            posting_date=doc.posting_date,
            remarks=f"Reserved for Sales Invoice {doc.name}"
        )


def sales_invoice_on_cancel(doc, method):
    """
    On Sales Invoice cancel: Cancel all reservations
    """
    if not is_reservation_enabled():
        return

    cancel_reservation("Sales Invoice", doc.name)


def sales_invoice_before_submit(doc, method):
    """
    Before Sales Invoice submit: Validate stock availability considering reservations
    """
    if not is_enabled_for_doctype("Sales Invoice"):
        return

    # Check if user can bypass validation
    if can_bypass_reservation():
        return

    if doc.is_return or doc.update_stock:
        return

    errors = []
    for item in doc.items:
        if not item.item_code or not item.warehouse:
            continue

        # Skip non-stock items
        if not frappe.db.get_value("Item", item.item_code, "is_stock_item"):
            continue

        is_valid, available_qty, message = validate_stock_availability(
            item_code=item.item_code,
            warehouse=item.warehouse,
            required_qty=flt(item.stock_qty),
            voucher_type="Sales Invoice",
            voucher_no=doc.name
        )

        if not is_valid:
            errors.append(message)

    if errors:
        frappe.throw("<br>".join(errors), title=_("Insufficient Stock"))


def handle_sales_invoice_return(doc):
    """
    Handle Sales Invoice return - cancel reservations of original invoice
    """
    if doc.return_against:
        # Cancel reservations of the original invoice
        cancel_reservation("Sales Invoice", doc.return_against)


# ============================================
# DELIVERY NOTE HANDLERS
# ============================================

def delivery_note_on_submit(doc, method):
    """
    On Delivery Note submit: Mark linked Sales Invoice reservations as delivered
    """
    if not is_enabled_for_doctype("Delivery Note"):
        return

    # Group items by Sales Invoice
    invoice_items = {}
    for item in doc.items:
        if item.against_sales_invoice:
            if item.against_sales_invoice not in invoice_items:
                invoice_items[item.against_sales_invoice] = []
            invoice_items[item.against_sales_invoice].append(item)

    # Mark reservations as delivered
    for invoice_no, items in invoice_items.items():
        for item in items:
            if item.si_detail:
                mark_reservation_delivered(
                    voucher_type="Sales Invoice",
                    voucher_no=invoice_no,
                    voucher_detail_no=item.si_detail
                )


def delivery_note_on_cancel(doc, method):
    """
    On Delivery Note cancel: Revert the delivered status back to reserved
    """
    if not is_reservation_enabled():
        return

    # Group items by Sales Invoice
    for item in doc.items:
        if item.against_sales_invoice and item.si_detail:
            # Find the reservation and revert delivered qty
            filters = {
                "voucher_type": "Sales Invoice",
                "voucher_no": item.against_sales_invoice,
                "voucher_detail_no": item.si_detail,
                "status": ["!=", "Cancelled"]
            }
            reservations = frappe.get_all("Stock Reservation", filters=filters, pluck="name")

            for res_name in reservations:
                res = frappe.get_doc("Stock Reservation", res_name)
                res.delivered_qty = 0
                res.status = "Reserved"
                res.remarks = (res.remarks or "") + f"\nDelivery Note {doc.name} cancelled, reservation restored"
                res.save(ignore_permissions=True)


# ============================================
# STOCK ENTRY HANDLERS
# ============================================

def _is_stock_entry_type_enabled(stock_entry_type):
    """Check if this stock entry type should create reservations"""
    enabled_types = get_stock_entry_types()
    return stock_entry_type in enabled_types


def stock_entry_validate(doc, method):
    """
    On Stock Entry validate (Material Issue, Material Transfer):
    - Validate stock availability
    """
    if not is_enabled_for_doctype("Stock Entry"):
        return

    if not _is_stock_entry_type_enabled(doc.stock_entry_type):
        return

    # Check if user can bypass validation
    if can_bypass_reservation():
        return

    # Only validate on save if setting is enabled, or always validate before submit
    if doc.docstatus == 0 and not should_validate_on_save():
        return

    errors = []
    for item in doc.items:
        if not item.item_code or not item.s_warehouse:
            continue

        # Skip non-stock items
        if not frappe.db.get_value("Item", item.item_code, "is_stock_item"):
            continue

        # Validate stock availability
        is_valid, available_qty, message = validate_stock_availability(
            item_code=item.item_code,
            warehouse=item.s_warehouse,
            required_qty=flt(item.qty),
            voucher_type="Stock Entry",
            voucher_no=doc.name
        )

        if not is_valid:
            errors.append(message)

    if errors:
        frappe.throw("<br>".join(errors), title=_("Insufficient Stock"))


def stock_entry_on_save(doc, method):
    """
    On Stock Entry save (draft): Create reservations for Material Issue/Transfer
    """
    if not is_enabled_for_doctype("Stock Entry"):
        return

    if doc.docstatus != 0:  # Only for draft
        return

    if not _is_stock_entry_type_enabled(doc.stock_entry_type):
        return

    # First cancel any existing reservations for this entry
    cancel_reservation("Stock Entry", doc.name)

    # Create new reservations
    for item in doc.items:
        if not item.item_code or not item.s_warehouse:
            continue

        # Skip non-stock items
        if not frappe.db.get_value("Item", item.item_code, "is_stock_item"):
            continue

        create_reservation(
            item_code=item.item_code,
            warehouse=item.s_warehouse,
            qty=flt(item.qty),
            voucher_type="Stock Entry",
            voucher_no=doc.name,
            voucher_detail_no=item.name,
            company=doc.company,
            posting_date=doc.posting_date or today(),
            remarks=f"Reserved for Stock Entry {doc.name} ({doc.stock_entry_type})"
        )


def stock_entry_on_submit(doc, method):
    """
    On Stock Entry submit: Mark reservations as delivered (stock is now actually moved)
    """
    if not is_reservation_enabled():
        return

    if not _is_stock_entry_type_enabled(doc.stock_entry_type):
        return

    # Mark reservations as delivered since stock is now moved
    for item in doc.items:
        if item.s_warehouse:
            mark_reservation_delivered(
                voucher_type="Stock Entry",
                voucher_no=doc.name,
                voucher_detail_no=item.name
            )


def stock_entry_on_cancel(doc, method):
    """
    On Stock Entry cancel: Cancel all reservations
    """
    if not is_reservation_enabled():
        return

    cancel_reservation("Stock Entry", doc.name)


def stock_entry_on_trash(doc, method):
    """
    On Stock Entry delete: Cancel all reservations
    """
    if not is_reservation_enabled():
        return

    cancel_reservation("Stock Entry", doc.name)


# ============================================
# UTILITY FUNCTIONS
# ============================================

@frappe.whitelist()
def get_item_available_qty(item_code, warehouse):
    """
    API to get available qty for an item in warehouse (considering reservations)
    """
    available_qty = get_available_qty(item_code, warehouse)
    actual_qty = flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))
    reserved_qty = get_reserved_qty(item_code, warehouse)

    return {
        "actual_qty": actual_qty,
        "reserved_qty": reserved_qty,
        "available_qty": available_qty
    }


@frappe.whitelist()
def get_warehouse_reserved_items(warehouse):
    """
    API to get all reserved items in a warehouse
    """
    return frappe.get_all(
        "Stock Reservation",
        filters={
            "warehouse": warehouse,
            "status": ["in", ["Reserved", "Partially Delivered"]]
        },
        fields=["item_code", "item_name", "reserved_qty", "delivered_qty", "pending_qty", "voucher_type", "voucher_no", "status"]
    )


@frappe.whitelist()
def check_reservation_enabled():
    """
    API to check if reservation system is enabled
    """
    return {
        "enabled": is_reservation_enabled(),
        "can_bypass": can_bypass_reservation()
    }


@frappe.whitelist()
def sync_delivered_reservations():
    """
    Utility to sync reservations with already delivered items.
    Marks reservations as delivered if a DN has already been submitted for them.
    """
    # Find all reservations that are still Reserved or Partially Delivered
    reservations = frappe.get_all(
        "Stock Reservation",
        filters={
            "voucher_type": "Sales Invoice",
            "status": ["in", ["Reserved", "Partially Delivered"]]
        },
        fields=["name", "voucher_no", "voucher_detail_no", "reserved_qty"]
    )

    updated_count = 0
    for res in reservations:
        # Check if a submitted DN exists for this SI detail
        dn_item = frappe.db.sql("""
            SELECT dni.name, dni.qty
            FROM `tabDelivery Note Item` dni
            INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
            WHERE dni.against_sales_invoice = %(invoice)s
            AND dni.si_detail = %(si_detail)s
            AND dn.docstatus = 1
        """, {
            "invoice": res.voucher_no,
            "si_detail": res.voucher_detail_no
        }, as_dict=1)

        if dn_item:
            # Mark as delivered
            doc = frappe.get_doc("Stock Reservation", res.name)
            doc.delivered_qty = doc.reserved_qty
            doc.status = "Delivered"
            doc.remarks = (doc.remarks or "") + "\nSynced - DN already submitted"
            doc.save(ignore_permissions=True)
            updated_count += 1

    frappe.db.commit()
    return {"updated": updated_count}


@frappe.whitelist()
def mark_single_reservation_delivered(reservation_name):
    """
    Manually mark a single reservation as delivered
    """
    doc = frappe.get_doc("Stock Reservation", reservation_name)
    doc.delivered_qty = doc.reserved_qty
    doc.status = "Delivered"
    doc.remarks = (doc.remarks or "") + "\nManually marked as delivered"
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": reservation_name}
