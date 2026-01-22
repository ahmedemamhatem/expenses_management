import frappe
from frappe import _
from frappe.query_builder import DocType


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

            # Skip if document is submitted (docstatus=1) or cancelled (docstatus=2)
            docstatus = frappe.db.get_value(
                action.reference_doctype,
                action.reference_name,
                "docstatus"
            )
            if docstatus in (1, 2):
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
