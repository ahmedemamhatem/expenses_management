import frappe
from frappe import _


def block_attachment_on_submitted(doc, method):
	"""Block attaching files to submitted documents (docstatus=1)."""
	if not doc.attached_to_doctype or not doc.attached_to_name:
		return

	ref_meta = frappe.get_meta(doc.attached_to_doctype)
	if not ref_meta.is_submittable:
		return

	docstatus = frappe.db.get_value(
		doc.attached_to_doctype, doc.attached_to_name, "docstatus"
	)
	if docstatus == 1:
		frappe.throw(
			_("Cannot attach files to a submitted {0}.").format(
				_(doc.attached_to_doctype)
			),
			title=_("Action Not Allowed"),
		)


def block_remove_attachment_on_submitted(doc, method):
	"""Block removing files from submitted documents (docstatus=1)."""
	if not doc.attached_to_doctype or not doc.attached_to_name:
		return

	ref_meta = frappe.get_meta(doc.attached_to_doctype)
	if not ref_meta.is_submittable:
		return

	docstatus = frappe.db.get_value(
		doc.attached_to_doctype, doc.attached_to_name, "docstatus"
	)
	if docstatus == 1:
		frappe.throw(
			_("Cannot remove files from a submitted {0}.").format(
				_(doc.attached_to_doctype)
			),
			title=_("Action Not Allowed"),
		)
