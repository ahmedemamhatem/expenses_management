import frappe
from frappe import _


def validate_branch_before_submit(doc, method=None):
    """Ensure the Branch field is set before submitting a Delivery Note."""
    if not doc.get("branch"):
        frappe.throw(
            _("Branch is mandatory before submitting a Delivery Note."),
            title=_("Missing Branch"),
        )
