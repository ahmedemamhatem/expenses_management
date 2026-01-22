# Copyright (c) 2025, Administrator and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class StockReservationSettings(Document):
    pass


def get_settings():
    """Get Stock Reservation Settings as dict"""
    return frappe.get_single("Stock Reservation Settings").as_dict()


def is_reservation_enabled():
    """Check if stock reservation is enabled globally"""
    return frappe.db.get_single_value("Stock Reservation Settings", "enabled")


def is_enabled_for_doctype(doctype):
    """Check if reservation is enabled for a specific doctype"""
    if not is_reservation_enabled():
        return False

    settings = get_settings()

    if doctype == "Sales Invoice":
        return settings.get("enable_for_sales_invoice", True)
    elif doctype == "Delivery Note":
        return settings.get("enable_for_delivery_note", True)
    elif doctype == "Stock Entry":
        return settings.get("enable_for_stock_entry", True)

    return False


def get_stock_entry_types():
    """Get list of stock entry types that should create reservations"""
    types_str = frappe.db.get_single_value("Stock Reservation Settings", "stock_entry_types") or ""
    return [t.strip() for t in types_str.split("\n") if t.strip()]


def can_bypass_reservation():
    """Check if current user can bypass reservation validation"""
    bypass_role = frappe.db.get_single_value("Stock Reservation Settings", "bypass_role")

    if not bypass_role:
        return False

    user_roles = frappe.get_roles()
    return bypass_role in user_roles


def should_validate_on_save():
    """Check if validation should happen on save"""
    if not is_reservation_enabled():
        return False
    return frappe.db.get_single_value("Stock Reservation Settings", "validate_on_save")
