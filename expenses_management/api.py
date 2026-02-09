import frappe
from frappe import _
from frappe.query_builder import DocType
from frappe.utils import getdate, cstr
from frappe.utils.html_utils import clean_html


@frappe.whitelist()
def get_workflow_transitions(doctype, docname):
    """
    Get available workflow transitions for a document.
    Returns list of actions that current user can perform.
    """
    from frappe.model.workflow import get_transitions, has_approval_access

    doc = frappe.get_doc(doctype, docname)
    transitions = get_transitions(doc)

    # Filter transitions based on approval access
    user = frappe.session.user
    available_actions = []
    for t in transitions:
        if has_approval_access(user, doc, t):
            available_actions.append({
                "action": t.get("action"),
                "next_state": t.get("next_state"),
            })

    return available_actions


@frappe.whitelist()
def apply_workflow_action(doctype, docname, action):
    """
    Apply a workflow action to a document.
    """
    from frappe.model.workflow import apply_workflow

    doc = frappe.get_doc(doctype, docname)
    result = apply_workflow(doc, action)
    return {
        "success": True,
        "new_state": result.get("workflow_state") if hasattr(result, "get") else getattr(result, "workflow_state", None),
        "message": _("Workflow action '{0}' applied successfully").format(action)
    }


@frappe.whitelist()
def get_document_preview(doctype, docname):
    """
    Get document preview data for quick view in popup.
    Returns key fields based on doctype.
    """
    doc = frappe.get_doc(doctype, docname)
    doc.check_permission("read")

    meta = frappe.get_meta(doctype)

    # Get important fields for preview
    preview_data = {
        "doctype": doctype,
        "name": docname,
        "owner": doc.owner,
        "creation": doc.creation,
        "modified": doc.modified,
        "workflow_state": doc.get("workflow_state"),
    }

    # Add title field if exists
    if meta.title_field:
        preview_data["title"] = doc.get(meta.title_field)

    # Get important fields (currency, link, data, select fields)
    important_fields = []
    for df in meta.fields:
        if df.fieldtype in ["Currency", "Float", "Int", "Percent"]:
            if df.fieldname not in ["docstatus"] and doc.get(df.fieldname):
                important_fields.append({
                    "label": df.label,
                    "value": doc.get(df.fieldname),
                    "fieldtype": df.fieldtype,
                    "fieldname": df.fieldname
                })
        elif df.fieldtype == "Link" and df.options not in ["User", "DocType"]:
            if doc.get(df.fieldname):
                important_fields.append({
                    "label": df.label,
                    "value": doc.get(df.fieldname),
                    "fieldtype": df.fieldtype,
                    "fieldname": df.fieldname,
                    "options": df.options
                })
        elif df.fieldtype in ["Data", "Select"] and df.in_list_view:
            if doc.get(df.fieldname):
                important_fields.append({
                    "label": df.label,
                    "value": doc.get(df.fieldname),
                    "fieldtype": df.fieldtype,
                    "fieldname": df.fieldname
                })

    # Limit to first 8 important fields
    preview_data["fields"] = important_fields[:8]

    # Get owner name
    preview_data["owner_name"] = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner

    return preview_data


@frappe.whitelist()
def get_pending_workflow_actions():
    """
    Return all pending workflow actions for current user or their roles.
    Only returns documents that have an active workflow configured.
    """
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # Get list of doctypes that have active workflows
    active_workflow_doctypes = frappe.get_all(
        "Workflow",
        filters={"is_active": 1},
        pluck="document_type"
    )

    if not active_workflow_doctypes:
        return []

    # Use Query Builder with JOIN to permitted_roles child table
    WorkflowAction = DocType("Workflow Action")
    WorkflowActionPermittedRole = DocType("Workflow Action Permitted Role")

    # Query workflow actions where user has permitted role OR is directly assigned
    query = (
        frappe.qb.from_(WorkflowAction)
        .left_join(WorkflowActionPermittedRole)
        .on(WorkflowAction.name == WorkflowActionPermittedRole.parent)
        .select(
            WorkflowAction.name,
            WorkflowAction.reference_doctype,
            WorkflowAction.reference_name,
            WorkflowAction.workflow_state,
            WorkflowAction.creation,
            WorkflowAction.user,
            WorkflowActionPermittedRole.role,
        )
        .where(WorkflowAction.status == "Open")
        .where(WorkflowAction.reference_doctype.isin(active_workflow_doctypes))
        .where(
            (WorkflowAction.user == user) | (WorkflowActionPermittedRole.role.isin(roles))
        )
        .orderby(WorkflowAction.creation, order=frappe.qb.desc)
        .distinct()
    )

    actions = query.run(as_dict=True)

    # States to exclude (completed/final states)
    excluded_states = {
        "approved", "cancelled", "rejected", "completed", "closed",
        "denied", "done", "finished", "paid", "submitted"
    }

    # Filter by permission and enrich with document title
    accessible_actions = []
    seen = set()  # Deduplicate by workflow action name

    for action in actions:
        if action.name in seen:
            continue
        seen.add(action.name)

        # Skip if workflow state is a final/completed state
        state_lower = (action.workflow_state or "").lower()
        if any(excl in state_lower for excl in excluded_states):
            continue

        try:
            # Skip if document doesn't exist (was deleted)
            if not frappe.db.exists(action.reference_doctype, action.reference_name):
                continue

            # Skip if document is cancelled (docstatus=2)
            # Note: docstatus=1 (Submitted) is valid for submittable doctypes
            # like Leave Application, Loan Application, etc.
            docstatus = frappe.db.get_value(
                action.reference_doctype,
                action.reference_name,
                "docstatus"
            )
            if docstatus == 2:
                continue

            if not frappe.has_permission(
                action.reference_doctype,
                "read",
                action.reference_name,
                user=user
            ):
                continue

            # Get document title if available
            doc_title = get_document_title(
                action.reference_doctype,
                action.reference_name
            )

            accessible_actions.append({
                "name": action.name,
                "reference_doctype": action.reference_doctype,
                "reference_name": action.reference_name,
                "workflow_state": action.workflow_state,
                "creation": action.creation,
                "user": action.user,
                "role": action.role,
                "doc_title": doc_title,
            })
        except Exception:
            # Skip if doctype doesn't exist or other permission error
            continue

    return accessible_actions


@frappe.whitelist()
def get_assignments_and_mentions_count():
    """Return counts of open assignments and unread mentions for current user."""
    user = frappe.session.user

    assignment_count = frappe.db.count("ToDo", {
        "allocated_to": user,
        "status": "Open",
    })

    mention_count = frappe.db.count("Notification Log", {
        "for_user": user,
        "type": "Mention",
        "read": 0,
    })

    return {
        "assignments": assignment_count,
        "mentions": mention_count,
        "total": assignment_count + mention_count,
    }


@frappe.whitelist()
def get_user_assignments():
    """Return all open ToDo assignments for the current user with enriched metadata."""
    user = frappe.session.user

    ToDo = DocType("ToDo")

    query = (
        frappe.qb.from_(ToDo)
        .select(
            ToDo.name,
            ToDo.reference_type,
            ToDo.reference_name,
            ToDo.description,
            ToDo.status,
            ToDo.priority,
            ToDo.date,
            ToDo.creation,
            ToDo.assigned_by,
            ToDo.assigned_by_full_name,
        )
        .where(ToDo.allocated_to == user)
        .where(ToDo.status == "Open")
        .orderby(ToDo.creation, order=frappe.qb.desc)
    )

    assignments = query.run(as_dict=True)

    today = getdate()
    results = []

    for a in assignments:
        # Skip if reference document no longer exists
        if a.reference_type and a.reference_name:
            if not frappe.db.exists(a.reference_type, a.reference_name):
                continue

        a["doc_title"] = get_document_title(
            a.reference_type, a.reference_name
        ) if a.reference_type and a.reference_name else (a.reference_name or "")

        a["is_overdue"] = bool(a.date and getdate(a.date) < today)

        # Clean description to plain text snippet
        if a.description:
            a["description_snippet"] = cstr(
                clean_html(a.description)
            ).strip()[:200]
        else:
            a["description_snippet"] = ""

        results.append(a)

    return results


@frappe.whitelist()
def get_user_mentions():
    """Return all unread @mentions for the current user from Notification Log."""
    user = frappe.session.user

    NL = DocType("Notification Log")
    User = DocType("User")

    query = (
        frappe.qb.from_(NL)
        .left_join(User).on(NL.from_user == User.name)
        .select(
            NL.name,
            NL.document_type,
            NL.document_name,
            NL.subject,
            NL.email_content,
            NL.from_user,
            NL.creation,
            User.full_name.as_("from_user_full_name"),
        )
        .where(NL.for_user == user)
        .where(NL.type == "Mention")
        .where(NL.read == 0)
        .orderby(NL.creation, order=frappe.qb.desc)
    )

    mentions = query.run(as_dict=True)

    results = []
    for m in mentions:
        # Skip if reference document no longer exists
        if m.document_type and m.document_name:
            if not frappe.db.exists(m.document_type, m.document_name):
                continue

        m["doc_title"] = get_document_title(
            m.document_type, m.document_name
        ) if m.document_type and m.document_name else (m.document_name or "")

        # Extract plain text snippet from email_content
        if m.email_content:
            m["content_snippet"] = cstr(
                clean_html(m.email_content)
            ).strip()[:200]
        else:
            m["content_snippet"] = ""

        results.append(m)

    return results


@frappe.whitelist()
def mark_assignment_complete(todo_name):
    """Mark a ToDo assignment as closed. Only the assigned user can do this."""
    doc = frappe.get_doc("ToDo", todo_name)

    if doc.allocated_to != frappe.session.user:
        frappe.throw(_("You can only complete assignments allocated to you"))

    doc.status = "Closed"
    doc.save(ignore_permissions=True)

    return {
        "success": True,
        "message": _("Assignment marked as complete"),
    }


@frappe.whitelist()
def close_assignment(todo_name):
    """Cancel/dismiss a ToDo assignment. Only the assigned user can do this."""
    doc = frappe.get_doc("ToDo", todo_name)

    if doc.allocated_to != frappe.session.user:
        frappe.throw(_("You can only close assignments allocated to you"))

    doc.status = "Cancelled"
    doc.save(ignore_permissions=True)

    return {
        "success": True,
        "message": _("Assignment dismissed"),
    }


@frappe.whitelist()
def mark_mention_read(notification_log_name):
    """Mark a Notification Log mention as read. Only the target user can do this."""
    doc = frappe.get_doc("Notification Log", notification_log_name)

    if doc.for_user != frappe.session.user:
        frappe.throw(_("You can only mark your own notifications as read"))

    doc.read = 1
    doc.save(ignore_permissions=True)

    return {
        "success": True,
        "message": _("Mention marked as read"),
    }


def get_document_title(doctype, docname):
    """
    Get document title based on doctype's title_field or standard naming.
    """
    try:
        meta = frappe.get_meta(doctype)
        title_field = meta.title_field

        if title_field:
            title = frappe.db.get_value(doctype, docname, title_field)
            if title and title != docname:
                return title

        # Fallback: try common title fields
        for field in ["title", "subject", "customer_name", "supplier_name", "employee_name", "full_name"]:
            if meta.has_field(field):
                value = frappe.db.get_value(doctype, docname, field)
                if value:
                    return value

        return docname
    except Exception:
        return docname
