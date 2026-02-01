import os

import frappe
from frappe import _

IGNORED_DOCTYPES = ["Sales Invoice"]
EXEMPT_EXTENSIONS = [".xsl", ".xml", ".png"]


def _has_exempt_extension(doc):
	filename = doc.file_name or doc.file_url or ""
	ext = os.path.splitext(filename)[1].lower()
	return ext in EXEMPT_EXTENSIONS


def _is_submitted_and_locked(doc):
	if not doc.attached_to_doctype or not doc.attached_to_name:
		return False

	if doc.attached_to_doctype in IGNORED_DOCTYPES:
		return False

	ref_meta = frappe.get_meta(doc.attached_to_doctype)
	if not ref_meta.is_submittable:
		return False

	docstatus = frappe.db.get_value(
		doc.attached_to_doctype, doc.attached_to_name, "docstatus"
	)
	return docstatus == 1


def block_attachment_on_submitted(doc, method):
	"""Block attaching files to submitted documents (docstatus=1)."""
	if not _is_submitted_and_locked(doc):
		return

	if _has_exempt_extension(doc):
		return

	frappe.throw(
		_("Cannot attach files to a submitted {0}.").format(
			_(doc.attached_to_doctype)
		),
		title=_("Action Not Allowed"),
	)


def block_remove_attachment_on_submitted(doc, method):
	"""Block removing files from submitted documents (docstatus=1)."""
	if not _is_submitted_and_locked(doc):
		return

	if _has_exempt_extension(doc):
		return

	frappe.throw(
		_("Cannot remove files from a submitted {0}.").format(
			_(doc.attached_to_doctype)
		),
		title=_("Action Not Allowed"),
	)
