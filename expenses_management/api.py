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
    Uses two strategies:
    1. Query Workflow Action table (standard Frappe mechanism)
    2. Directly query documents in pending workflow states (fallback for
       when Workflow Action records are missing)
    """
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # Get active workflows with their details
    active_workflows = frappe.get_all(
        "Workflow",
        filters={"is_active": 1},
        fields=["name", "document_type"]
    )

    if not active_workflows:
        return []

    active_workflow_doctypes = [w.document_type for w in active_workflows]
    cutoff_date = "2026-01-01"

    # States to exclude (completed/final states)
    excluded_states = {
        "approved", "cancelled", "rejected", "completed", "closed",
        "denied", "done", "finished", "paid", "submitted"
    }

    accessible_actions = []
    # Track seen documents to avoid duplicates: (doctype, docname)
    seen_docs = set()

    # ── Strategy 1: Workflow Action table ──
    # Single query with JOIN to get workflow_state + docstatus from referenced docs
    WorkflowAction = DocType("Workflow Action")
    WorkflowActionPermittedRole = DocType("Workflow Action Permitted Role")

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
        .where(WorkflowAction.creation >= cutoff_date)
        .where(
            (WorkflowAction.user == user) | (WorkflowActionPermittedRole.role.isin(roles))
        )
        .orderby(WorkflowAction.creation, order=frappe.qb.desc)
        .distinct()
    )

    actions = query.run(as_dict=True)

    # Deduplicate and filter excluded states in Python (cheap)
    seen_wa = set()
    filtered_actions = []
    for action in actions:
        if action.name in seen_wa:
            continue
        seen_wa.add(action.name)

        state_lower = (action.workflow_state or "").lower()
        if any(excl in state_lower for excl in excluded_states):
            continue
        filtered_actions.append(action)

    # Batch: collect all (doctype, docname) pairs and verify existence + docstatus in bulk
    if filtered_actions:
        # Group by doctype for batch queries
        by_doctype = {}
        for action in filtered_actions:
            by_doctype.setdefault(action.reference_doctype, []).append(action)

        for dt, dt_actions in by_doctype.items():
            names = list(set(a.reference_name for a in dt_actions))
            try:
                # Single query per doctype: get name, docstatus, and title field
                meta = frappe.get_meta(dt)
                title_field = _get_title_field(meta)
                fields = ["name", "docstatus"]
                if title_field and title_field not in fields:
                    fields.append(title_field)

                existing_docs = frappe.get_all(
                    dt,
                    filters={"name": ["in", names]},
                    fields=fields,
                    limit_page_length=0,
                )
                # Build lookup: name -> {docstatus, title}
                doc_map = {}
                for d in existing_docs:
                    doc_map[d.name] = d
            except Exception:
                continue

            for action in dt_actions:
                doc_info = doc_map.get(action.reference_name)
                if not doc_info:
                    continue
                if doc_info.docstatus in (1, 2):
                    continue

                doc_key = (action.reference_doctype, action.reference_name)
                if doc_key in seen_docs:
                    continue

                # Permission check (unavoidable per-doc, but now after bulk filtering)
                try:
                    if not frappe.has_permission(
                        action.reference_doctype, "read", action.reference_name, user=user
                    ):
                        continue
                except Exception:
                    continue

                seen_docs.add(doc_key)
                doc_title = doc_info.get(title_field) if title_field else None
                if not doc_title or doc_title == action.reference_name:
                    doc_title = action.reference_name

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

    # ── Strategy 2: Direct document query for pending workflow states ──
    # This catches documents where Workflow Action records were never created
    for wf in active_workflows:
        doctype = wf.document_type
        wf_name = wf.name

        try:
            meta = frappe.get_meta(doctype)
            if not meta.has_field("workflow_state"):
                continue

            # Get non-final states from the workflow (cached by Frappe)
            wf_doc = frappe.get_doc("Workflow", wf_name)
            pending_states = []
            for state in wf_doc.states:
                s_lower = state.state.lower()
                if not any(excl in s_lower for excl in excluded_states):
                    pending_states.append(state.state)

            if not pending_states:
                continue

            # Get title field for this doctype
            title_field = _get_title_field(meta)
            fields = ["name", "workflow_state", "creation"]
            if title_field and title_field not in fields:
                fields.append(title_field)

            # Query documents in pending workflow states
            docs = frappe.get_all(
                doctype,
                filters={
                    "workflow_state": ["in", pending_states],
                    "docstatus": 0,
                    "creation": [">=", cutoff_date],
                },
                fields=fields,
                order_by="creation desc",
                limit_page_length=100,
            )

            for doc in docs:
                doc_key = (doctype, doc.name)
                if doc_key in seen_docs:
                    continue

                try:
                    if not frappe.has_permission(doctype, "read", doc.name, user=user):
                        continue
                except Exception:
                    continue

                seen_docs.add(doc_key)
                doc_title = doc.get(title_field) if title_field else None
                if not doc_title or doc_title == doc.name:
                    doc_title = doc.name

                accessible_actions.append({
                    "name": doc.name,
                    "reference_doctype": doctype,
                    "reference_name": doc.name,
                    "workflow_state": doc.workflow_state,
                    "creation": doc.creation,
                    "user": "",
                    "role": "",
                    "doc_title": doc_title,
                })
        except Exception:
            continue

    # Sort all results by creation descending
    accessible_actions.sort(key=lambda x: x.get("creation") or "", reverse=True)

    return accessible_actions


def _get_title_field(meta):
    """Get the best title field for a doctype meta, returns fieldname or None."""
    if meta.title_field:
        return meta.title_field
    for field in ["title", "subject", "customer_name", "supplier_name", "employee_name", "full_name"]:
        if meta.has_field(field):
            return field
    return None


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

    # Batch verify document existence: group by reference_type
    ref_groups = {}
    for a in assignments:
        if a.reference_type and a.reference_name:
            ref_groups.setdefault(a.reference_type, set()).add(a.reference_name)

    existing_refs = set()
    title_cache = {}
    for ref_type, ref_names in ref_groups.items():
        try:
            meta = frappe.get_meta(ref_type)
            title_field = _get_title_field(meta)
            fields = ["name"]
            if title_field:
                fields.append(title_field)
            docs = frappe.get_all(
                ref_type,
                filters={"name": ["in", list(ref_names)]},
                fields=fields,
                limit_page_length=0,
            )
            for d in docs:
                key = (ref_type, d.name)
                existing_refs.add(key)
                title_val = d.get(title_field) if title_field else None
                if title_val and title_val != d.name:
                    title_cache[key] = title_val
        except Exception:
            # If doctype doesn't exist, skip all
            pass

    for a in assignments:
        if a.reference_type and a.reference_name:
            if (a.reference_type, a.reference_name) not in existing_refs:
                continue

        key = (a.reference_type, a.reference_name) if a.reference_type else None
        a["doc_title"] = title_cache.get(key, a.reference_name or "") if key else (a.reference_name or "")

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

    # Batch verify document existence
    ref_groups = {}
    for m in mentions:
        if m.document_type and m.document_name:
            ref_groups.setdefault(m.document_type, set()).add(m.document_name)

    existing_refs = set()
    title_cache = {}
    for ref_type, ref_names in ref_groups.items():
        try:
            meta = frappe.get_meta(ref_type)
            title_field = _get_title_field(meta)
            fields = ["name"]
            if title_field:
                fields.append(title_field)
            docs = frappe.get_all(
                ref_type,
                filters={"name": ["in", list(ref_names)]},
                fields=fields,
                limit_page_length=0,
            )
            for d in docs:
                key = (ref_type, d.name)
                existing_refs.add(key)
                title_val = d.get(title_field) if title_field else None
                if title_val and title_val != d.name:
                    title_cache[key] = title_val
        except Exception:
            pass

    results = []
    for m in mentions:
        if m.document_type and m.document_name:
            if (m.document_type, m.document_name) not in existing_refs:
                continue

        key = (m.document_type, m.document_name) if m.document_type else None
        m["doc_title"] = title_cache.get(key, m.document_name or "") if key else (m.document_name or "")

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
        title_field = _get_title_field(meta)

        if title_field:
            title = frappe.db.get_value(doctype, docname, title_field)
            if title and title != docname:
                return title

        return docname
    except Exception:
        return docname
