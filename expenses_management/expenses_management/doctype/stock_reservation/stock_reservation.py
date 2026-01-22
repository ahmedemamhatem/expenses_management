# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, today, getdate


class StockReservation(Document):
    def validate(self):
        self.validate_manual_creation()
        self.calculate_pending_qty()
        self.update_status()

    def validate_manual_creation(self):
        """Prevent manual creation - only allow programmatic creation"""
        if self.is_new() and not self.flags.ignore_permissions:
            frappe.throw(
                _("Stock Reservation cannot be created manually. It is automatically created from Sales Invoice, Stock Entry, etc."),
                title=_("Not Allowed")
            )

    def calculate_pending_qty(self):
        self.pending_qty = flt(self.reserved_qty) - flt(self.delivered_qty)

    def update_status(self):
        if flt(self.delivered_qty) >= flt(self.reserved_qty):
            self.status = "Delivered"
        elif flt(self.delivered_qty) > 0:
            self.status = "Partially Delivered"
        elif self.status != "Cancelled":
            self.status = "Reserved"


def get_reserved_qty(item_code, warehouse, exclude_voucher_type=None, exclude_voucher_no=None):
    """Get total reserved qty for an item in a warehouse (excluding cancelled and delivered)"""
    filters = {
        "item_code": item_code,
        "warehouse": warehouse,
        "status": ["in", ["Reserved", "Partially Delivered"]]
    }

    reservations = frappe.get_all(
        "Stock Reservation",
        filters=filters,
        fields=["voucher_type", "voucher_no", "pending_qty"]
    )

    total_reserved = 0
    for r in reservations:
        # Exclude the current voucher if specified
        if exclude_voucher_type and exclude_voucher_no:
            if r.voucher_type == exclude_voucher_type and r.voucher_no == exclude_voucher_no:
                continue
        total_reserved += flt(r.pending_qty)

    return total_reserved


def get_available_qty(item_code, warehouse, exclude_voucher_type=None, exclude_voucher_no=None):
    """Get available qty (actual qty - reserved qty) for an item in a warehouse"""
    # Get actual qty from Bin
    actual_qty = flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))

    # Get reserved qty
    reserved_qty = get_reserved_qty(item_code, warehouse, exclude_voucher_type, exclude_voucher_no)

    return actual_qty - reserved_qty


def create_reservation(item_code, warehouse, qty, voucher_type, voucher_no, voucher_detail_no=None, company=None, posting_date=None, remarks=None):
    """Create a stock reservation entry"""
    if flt(qty) <= 0:
        return None

    # Check if reservation already exists for this voucher detail
    existing = frappe.db.exists("Stock Reservation", {
        "voucher_type": voucher_type,
        "voucher_no": voucher_no,
        "voucher_detail_no": voucher_detail_no or "",
        "item_code": item_code,
        "warehouse": warehouse,
        "status": ["!=", "Cancelled"]
    })

    if existing:
        return existing

    reservation = frappe.new_doc("Stock Reservation")
    reservation.item_code = item_code
    reservation.warehouse = warehouse
    reservation.reserved_qty = flt(qty)
    reservation.delivered_qty = 0
    reservation.voucher_type = voucher_type
    reservation.voucher_no = voucher_no
    reservation.voucher_detail_no = voucher_detail_no or ""
    reservation.company = company or frappe.defaults.get_user_default("Company")
    reservation.posting_date = posting_date or today()
    reservation.status = "Reserved"
    reservation.remarks = remarks
    reservation.insert(ignore_permissions=True)

    return reservation.name


def cancel_reservation(voucher_type, voucher_no, voucher_detail_no=None):
    """Cancel reservations for a voucher"""
    filters = {
        "voucher_type": voucher_type,
        "voucher_no": voucher_no,
        "status": ["!=", "Cancelled"]
    }

    if voucher_detail_no:
        filters["voucher_detail_no"] = voucher_detail_no

    reservations = frappe.get_all("Stock Reservation", filters=filters, pluck="name")

    for res_name in reservations:
        res = frappe.get_doc("Stock Reservation", res_name)
        res.status = "Cancelled"
        res.remarks = (res.remarks or "") + f"\nCancelled due to {voucher_type} {voucher_no} cancellation"
        res.save(ignore_permissions=True)


def update_delivered_qty(voucher_type, voucher_no, voucher_detail_no, delivered_qty):
    """Update delivered qty for a reservation"""
    filters = {
        "voucher_type": voucher_type,
        "voucher_no": voucher_no,
        "status": ["!=", "Cancelled"]
    }

    if voucher_detail_no:
        filters["voucher_detail_no"] = voucher_detail_no

    reservations = frappe.get_all("Stock Reservation", filters=filters, pluck="name")

    for res_name in reservations:
        res = frappe.get_doc("Stock Reservation", res_name)
        res.delivered_qty = flt(delivered_qty)
        res.save(ignore_permissions=True)


def mark_reservation_delivered(voucher_type, voucher_no, voucher_detail_no=None):
    """Mark reservations as fully delivered"""
    filters = {
        "voucher_type": voucher_type,
        "voucher_no": voucher_no,
        "status": ["!=", "Cancelled"]
    }

    if voucher_detail_no:
        filters["voucher_detail_no"] = voucher_detail_no

    reservations = frappe.get_all("Stock Reservation", filters=filters, fields=["name", "reserved_qty"])

    for res in reservations:
        doc = frappe.get_doc("Stock Reservation", res.name)
        doc.delivered_qty = doc.reserved_qty
        doc.save(ignore_permissions=True)


def validate_stock_availability(item_code, warehouse, required_qty, voucher_type=None, voucher_no=None):
    """
    Validate if enough stock is available after considering reservations.
    Returns (is_valid, available_qty, message)
    """
    # Get actual qty from Bin
    actual_qty = flt(frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"))

    # Get reserved qty
    reserved_qty = get_reserved_qty(item_code, warehouse, voucher_type, voucher_no)

    # Calculate available qty
    available_qty = actual_qty - reserved_qty

    if flt(required_qty) > flt(available_qty):
        item_name = frappe.db.get_value("Item", item_code, "item_name") or item_code
        warehouse_name = frappe.db.get_value("Warehouse", warehouse, "warehouse_name") or warehouse

        # Build detailed message
        message = _("""<div style="text-align: right; direction: rtl;">
<h4 style="color: #e74c3c; margin-bottom: 10px;">لا يوجد مخزون كافي</h4>
<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
    <tr style="background: #f8f9fa;">
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>الصنف:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6;">{item_name} ({item_code})</td>
    </tr>
    <tr>
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>المستودع:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6;">{warehouse_name}</td>
    </tr>
    <tr style="background: #f8f9fa;">
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>الكمية المطلوبة:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6; color: #e74c3c;"><strong>{required_qty}</strong></td>
    </tr>
    <tr>
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>المخزون الفعلي:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6;">{actual_qty}</td>
    </tr>
    <tr style="background: #fff3cd;">
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>الكمية المحجوزة:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6; color: #856404;">{reserved_qty}</td>
    </tr>
    <tr style="background: #d4edda;">
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>المتاح للبيع:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6; color: #155724;"><strong>{available_qty}</strong></td>
    </tr>
    <tr style="background: #f8d7da;">
        <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>العجز:</strong></td>
        <td style="padding: 8px; border: 1px solid #dee2e6; color: #721c24;"><strong>{shortage}</strong></td>
    </tr>
</table>
</div>""").format(
            item_name=item_name,
            item_code=item_code,
            warehouse_name=warehouse_name,
            required_qty=flt(required_qty, 3),
            actual_qty=flt(actual_qty, 3),
            reserved_qty=flt(reserved_qty, 3),
            available_qty=flt(available_qty, 3),
            shortage=flt(required_qty - available_qty, 3)
        )

        return (False, available_qty, message)

    return (True, available_qty, "")
