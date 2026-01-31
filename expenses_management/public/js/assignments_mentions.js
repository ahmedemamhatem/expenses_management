/**
 * Assignments & Mentions Button for Frappe Navbar
 * Shows open assignments (ToDo) and unread @mentions for the current user.
 */
(function() {
    "use strict";

    if (window.__assignments_mentions_initialized) return;
    window.__assignments_mentions_initialized = true;

    let refreshTimer = null;
    let cachedAssignments = [];
    let cachedMentions = [];

    $(document).on("startup", function() {
        setTimeout(initButton, 1200);
    });

    $(document).ready(function() {
        setTimeout(initButton, 1800);
    });

    function initButton() {
        if (document.getElementById("assignments-mentions-btn")) return;

        const searchForm = document.querySelector("header.navbar form.form-inline");
        if (!searchForm) {
            setTimeout(initButton, 500);
            return;
        }

        injectStyles();

        const btnWrapper = document.createElement("div");
        btnWrapper.id = "assignments-mentions-btn";
        btnWrapper.className = "am-wrapper";
        btnWrapper.innerHTML = `
            <button type="button" class="am-trigger" title="${__("Assignments & Mentions")}">
                <svg class="am-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
                </svg>
                <span class="am-badge" id="am-badge"></span>
            </button>
        `;

        // Place after workflow approvals button if it exists
        const wfaBtn = document.getElementById("workflow-approvals-btn");
        if (wfaBtn && wfaBtn.parentNode) {
            wfaBtn.insertAdjacentElement("afterend", btnWrapper);
        } else {
            searchForm.appendChild(btnWrapper);
        }

        btnWrapper.querySelector(".am-trigger").addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            showDialog();
        });

        loadCount();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(loadCount, 120000);
    }

    /* ──────────── Badge Count ──────────── */

    function loadCount() {
        frappe.call({
            method: "expenses_management.api.get_assignments_and_mentions_count",
            async: true,
            callback: function(r) {
                const data = r.message || {};
                const total = data.total || 0;
                const badge = document.getElementById("am-badge");
                if (badge) {
                    if (total > 0) {
                        badge.textContent = total > 99 ? "99+" : total;
                        badge.classList.add("show");
                    } else {
                        badge.classList.remove("show");
                    }
                }
            }
        });
    }

    /* ──────────── Main Dialog ──────────── */

    function showDialog() {
        // Load both datasets in parallel
        let assignmentsLoaded = false;
        let mentionsLoaded = false;

        const tryRender = function(dlg) {
            if (!assignmentsLoaded || !mentionsLoaded) return;
            renderAnalytics(dlg);
            updateTabBadges(dlg);
            showAssignmentsTab(dlg);
        };

        const dlg = new frappe.ui.Dialog({
            title: `<span style="display:flex;align-items:center;gap:8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
                </svg>
                ${__("Assignments & Mentions")}
            </span>`,
            size: "large",
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "analytics_area",
                    options: '<div id="am-analytics"></div>'
                },
                {
                    fieldtype: "HTML",
                    fieldname: "tabs_area",
                    options: `
                        <div class="am-tabs">
                            <button class="am-tab active" data-tab="assignments">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 11l3 3L22 4"/>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                                ${__("Assignments")}
                                <span class="am-tab-count" id="am-tab-assignments-count">0</span>
                            </button>
                            <button class="am-tab" data-tab="mentions">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="4"/>
                                    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
                                </svg>
                                ${__("Mentions")}
                                <span class="am-tab-count" id="am-tab-mentions-count">0</span>
                            </button>
                        </div>
                    `
                },
                {
                    fieldtype: "HTML",
                    fieldname: "content_area",
                    options: '<div id="am-content"><div class="am-loading">' + __("Loading...") + '</div></div>'
                }
            ]
        });

        dlg.$wrapper.addClass("am-dialog");
        dlg.show();

        // Tab switching
        dlg.$wrapper.on("click", ".am-tab", function(e) {
            e.preventDefault();
            e.stopPropagation();
            dlg.$wrapper.find(".am-tab").removeClass("active");
            $(this).addClass("active");
            const tab = $(this).data("tab");
            if (tab === "assignments") {
                showAssignmentsTab(dlg);
            } else {
                showMentionsTab(dlg);
            }
        });

        // Collapsible groups
        dlg.$wrapper.on("click", ".am-group-header", function(e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).closest(".am-group").toggleClass("collapsed");
        });

        // Preview buttons
        dlg.$wrapper.on("click", ".am-action-btn.preview", function(e) {
            e.preventDefault();
            e.stopPropagation();
            const $btn = $(this);
            const type = $btn.data("type");
            const name = $btn.data("name");
            const doctype = $btn.data("doctype");
            const docname = $btn.data("docname");

            if (type === "assignment") {
                showAssignmentPreview(name, doctype, docname, dlg);
            } else {
                showMentionPreview(name, doctype, docname, dlg);
            }
        });

        // Complete assignment inline
        dlg.$wrapper.on("click", ".am-action-btn.complete", function(e) {
            e.preventDefault();
            e.stopPropagation();
            const todoName = $(this).data("name");
            completeAssignment(todoName, dlg);
        });

        // Mark mention read inline
        dlg.$wrapper.on("click", ".am-action-btn.mark-read", function(e) {
            e.preventDefault();
            e.stopPropagation();
            const nlName = $(this).data("name");
            markMentionRead(nlName, dlg);
        });

        // Navigate to document on item click — open in new browser tab
        dlg.$wrapper.on("click", ".am-item-content, .am-item-icon", function(e) {
            e.preventDefault();
            e.stopPropagation();
            const $item = $(this).closest(".am-item");
            const route = $item.data("route");
            if (route) {
                window.open(route, "_blank");
            }
        });

        // Close (dismiss) a ToDo — hides it without completing
        dlg.$wrapper.on("click", ".am-action-btn.close-todo", function(e) {
            e.preventDefault();
            e.stopPropagation();
            const todoName = $(this).data("name");
            closeTodo(todoName, dlg);
        });

        // Cleanup
        dlg.$wrapper.on("hidden.bs.modal", function() {
            dlg.$wrapper.off("click");
        });

        // Fetch data
        frappe.call({
            method: "expenses_management.api.get_user_assignments",
            async: true,
            callback: function(r) {
                cachedAssignments = r.message || [];
                assignmentsLoaded = true;
                tryRender(dlg);
            }
        });

        frappe.call({
            method: "expenses_management.api.get_user_mentions",
            async: true,
            callback: function(r) {
                cachedMentions = r.message || [];
                mentionsLoaded = true;
                tryRender(dlg);
            }
        });
    }

    /* ──────────── Analytics Bar ──────────── */

    function renderAnalytics(dlg) {
        const totalAssignments = cachedAssignments.length;
        const overdueCount = cachedAssignments.filter(function(a) { return a.is_overdue; }).length;
        const highCount = cachedAssignments.filter(function(a) { return a.priority === "High"; }).length;
        const totalMentions = cachedMentions.length;

        const html = `
            <div class="am-analytics">
                <div class="am-stat-card">
                    <div class="am-stat-value">${totalAssignments}</div>
                    <div class="am-stat-label">${__("Open Tasks")}</div>
                </div>
                <div class="am-stat-card ${overdueCount > 0 ? 'danger' : ''}">
                    <div class="am-stat-value">${overdueCount}</div>
                    <div class="am-stat-label">${__("Overdue")}</div>
                </div>
                <div class="am-stat-card ${highCount > 0 ? 'warning' : ''}">
                    <div class="am-stat-value">${highCount}</div>
                    <div class="am-stat-label">${__("High Priority")}</div>
                </div>
                <div class="am-stat-card info">
                    <div class="am-stat-value">${totalMentions}</div>
                    <div class="am-stat-label">${__("Unread Mentions")}</div>
                </div>
            </div>
        `;

        dlg.$wrapper.find("#am-analytics").html(html);
    }

    function updateTabBadges(dlg) {
        dlg.$wrapper.find("#am-tab-assignments-count").text(cachedAssignments.length);
        dlg.$wrapper.find("#am-tab-mentions-count").text(cachedMentions.length);
    }

    /* ──────────── Assignments Tab ──────────── */

    function showAssignmentsTab(dlg) {
        const data = cachedAssignments;

        if (data.length === 0) {
            dlg.$wrapper.find("#am-content").html(emptyState(
                "assignments",
                __("No Open Assignments"),
                __("You have no pending tasks assigned to you.")
            ));
            return;
        }

        // Group by reference_type
        const groups = {};
        data.forEach(function(item) {
            const dt = item.reference_type || __("General");
            if (!groups[dt]) groups[dt] = [];
            groups[dt].push(item);
        });

        let html = '<div class="am-container">';
        Object.keys(groups).sort().forEach(function(doctype) {
            const items = groups[doctype];
            html += `
                <div class="am-group collapsed">
                    <div class="am-group-header">
                        <div class="am-group-left">
                            <svg class="am-group-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                            <span class="am-group-title">${__(doctype)}</span>
                        </div>
                        <span class="am-group-count">${items.length}</span>
                    </div>
                    <div class="am-group-items">
            `;

            items.forEach(function(item) {
                const slug = item.reference_type ? frappe.router.slug(item.reference_type) : "";
                const url = slug ? ("/app/" + slug + "/" + item.reference_name) : "";
                const title = frappe.utils.escape_html(item.doc_title || item.reference_name || item.name);
                const priorityColor = getPriorityColor(item.priority);
                const isOverdue = item.is_overdue;
                const dueStr = item.date ? frappe.datetime.prettyDate(item.date) : __("No due date");
                const assignedBy = frappe.utils.escape_html(item.assigned_by_full_name || item.assigned_by || "");
                const descSnippet = frappe.utils.escape_html(item.description_snippet || "");

                html += `
                    <div class="am-item" data-type="assignment" data-name="${item.name}"
                         data-doctype="${item.reference_type || ""}" data-docname="${item.reference_name || ""}"
                         data-route="${url}">
                        <div class="am-item-icon priority-${priorityColor}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <path d="M9 11l3 3L22 4" opacity="0.5"/>
                            </svg>
                        </div>
                        <div class="am-item-content">
                            <div class="am-item-title">${title}</div>
                            <div class="am-item-meta">
                                ${item.reference_name ? '<span class="am-item-id">' + item.reference_name + '</span>' : ''}
                                ${assignedBy ? '<span class="am-meta-dot">&bull;</span><span>' + __("by {0}", [assignedBy]) + '</span>' : ''}
                            </div>
                            ${descSnippet ? '<div class="am-item-desc">' + descSnippet + '</div>' : ''}
                        </div>
                        <div class="am-item-right">
                            <span class="am-priority ${priorityColor}">${__(item.priority || "Medium")}</span>
                            <span class="am-due ${isOverdue ? 'overdue' : ''}">${dueStr}</span>
                        </div>
                        <div class="am-item-actions">
                            <button type="button" class="am-action-btn complete" title="${__("Mark Complete")}"
                                    data-name="${item.name}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </button>
                            <button type="button" class="am-action-btn close-todo" title="${__("Dismiss")}"
                                    data-name="${item.name}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                            <button type="button" class="am-action-btn preview" title="${__("Preview")}"
                                    data-type="assignment" data-name="${item.name}"
                                    data-doctype="${item.reference_type || ""}" data-docname="${item.reference_name || ""}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
        });

        html += '</div>';
        dlg.$wrapper.find("#am-content").html(html);
    }

    /* ──────────── Mentions Tab ──────────── */

    function showMentionsTab(dlg) {
        const data = cachedMentions;

        if (data.length === 0) {
            dlg.$wrapper.find("#am-content").html(emptyState(
                "mentions",
                __("No Unread Mentions"),
                __("You have no new mentions to review.")
            ));
            return;
        }

        // Group by document_type
        const groups = {};
        data.forEach(function(item) {
            const dt = item.document_type || __("Other");
            if (!groups[dt]) groups[dt] = [];
            groups[dt].push(item);
        });

        let html = '<div class="am-container">';
        Object.keys(groups).sort().forEach(function(doctype) {
            const items = groups[doctype];
            html += `
                <div class="am-group collapsed">
                    <div class="am-group-header">
                        <div class="am-group-left">
                            <svg class="am-group-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                            <span class="am-group-title">${__(doctype)}</span>
                        </div>
                        <span class="am-group-count">${items.length}</span>
                    </div>
                    <div class="am-group-items">
            `;

            items.forEach(function(item) {
                const slug = item.document_type ? frappe.router.slug(item.document_type) : "";
                const url = slug ? ("/app/" + slug + "/" + item.document_name) : "";
                const title = frappe.utils.escape_html(item.doc_title || item.document_name || "");
                const fromUser = frappe.utils.escape_html(item.from_user_full_name || item.from_user || "");
                const timeStr = formatTime(item.creation);
                const snippet = frappe.utils.escape_html(item.content_snippet || "");

                html += `
                    <div class="am-item" data-type="mention" data-name="${item.name}"
                         data-doctype="${item.document_type || ""}" data-docname="${item.document_name || ""}"
                         data-route="${url}">
                        <div class="am-item-icon mention-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="4"/>
                                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
                            </svg>
                        </div>
                        <div class="am-item-content">
                            <div class="am-item-title">${title}</div>
                            <div class="am-item-meta">
                                ${item.document_name ? '<span class="am-item-id">' + item.document_name + '</span>' : ''}
                                ${fromUser ? '<span class="am-meta-dot">&bull;</span><span>' + __("{0} mentioned you", [fromUser]) + '</span>' : ''}
                                ${timeStr ? '<span class="am-meta-dot">&bull;</span><span>' + timeStr + '</span>' : ''}
                            </div>
                            ${snippet ? '<div class="am-item-desc mention-quote">"' + snippet + '"</div>' : ''}
                        </div>
                        <div class="am-item-actions">
                            <button type="button" class="am-action-btn mark-read" title="${__("Mark as Read")}"
                                    data-name="${item.name}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                            </button>
                            <button type="button" class="am-action-btn preview" title="${__("Preview")}"
                                    data-type="mention" data-name="${item.name}"
                                    data-doctype="${item.document_type || ""}" data-docname="${item.document_name || ""}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += '</div></div>';
        });

        html += '</div>';
        dlg.$wrapper.find("#am-content").html(html);
    }

    /* ──────────── Inline Actions ──────────── */

    function completeAssignment(todoName, dlg) {
        frappe.confirm(
            __("Mark this assignment as complete?"),
            function() {
                frappe.call({
                    method: "expenses_management.api.mark_assignment_complete",
                    args: { todo_name: todoName },
                    freeze: true,
                    freeze_message: __("Completing..."),
                    callback: function(r) {
                        if (r.message && r.message.success) {
                            frappe.show_alert({ message: r.message.message, indicator: "green" });
                            // Remove from cached data
                            cachedAssignments = cachedAssignments.filter(function(a) { return a.name !== todoName; });
                            removeItemAndUpdate(dlg, todoName);
                            loadCount();
                        }
                    },
                    error: function() {
                        frappe.show_alert({ message: __("Failed to complete assignment"), indicator: "red" });
                    }
                });
            }
        );
    }

    function markMentionRead(nlName, dlg) {
        frappe.call({
            method: "expenses_management.api.mark_mention_read",
            args: { notification_log_name: nlName },
            callback: function(r) {
                if (r.message && r.message.success) {
                    frappe.show_alert({ message: r.message.message, indicator: "green" });
                    cachedMentions = cachedMentions.filter(function(m) { return m.name !== nlName; });
                    removeItemAndUpdate(dlg, nlName);
                    loadCount();
                }
            },
            error: function() {
                frappe.show_alert({ message: __("Failed to mark as read"), indicator: "red" });
            }
        });
    }

    function closeTodo(todoName, dlg) {
        frappe.confirm(
            __("Dismiss this assignment? It will be cancelled and hidden."),
            function() {
                frappe.call({
                    method: "expenses_management.api.close_assignment",
                    args: { todo_name: todoName },
                    freeze: true,
                    freeze_message: __("Closing..."),
                    callback: function(r) {
                        if (r.message && r.message.success) {
                            frappe.show_alert({ message: r.message.message, indicator: "blue" });
                            cachedAssignments = cachedAssignments.filter(function(a) { return a.name !== todoName; });
                            removeItemAndUpdate(dlg, todoName);
                            loadCount();
                        }
                    },
                    error: function() {
                        frappe.show_alert({ message: __("Failed to close assignment"), indicator: "red" });
                    }
                });
            }
        );
    }

    function removeItemAndUpdate(dlg, itemName) {
        const $item = dlg.$wrapper.find('.am-item[data-name="' + itemName + '"]');
        const $group = $item.closest(".am-group");

        $item.fadeOut(300, function() {
            $(this).remove();

            // Update group count
            if ($group.length) {
                const remaining = $group.find(".am-item").length;
                $group.find(".am-group-count").text(remaining);
                if (remaining === 0) {
                    $group.fadeOut(300, function() { $(this).remove(); });
                }
            }

            // Check if content is empty
            const totalItems = dlg.$wrapper.find(".am-item").length;
            if (totalItems === 0) {
                const activeTab = dlg.$wrapper.find(".am-tab.active").data("tab");
                if (activeTab === "assignments") {
                    dlg.$wrapper.find("#am-content").html(emptyState(
                        "assignments",
                        __("No Open Assignments"),
                        __("You have no pending tasks assigned to you.")
                    ));
                } else {
                    dlg.$wrapper.find("#am-content").html(emptyState(
                        "mentions",
                        __("No Unread Mentions"),
                        __("You have no new mentions to review.")
                    ));
                }
            }
        });

        // Update analytics and tab badges
        renderAnalytics(dlg);
        updateTabBadges(dlg);
    }

    /* ──────────── Assignment Preview ──────────── */

    function showAssignmentPreview(todoName, doctype, docname, parentDlg) {
        if (!doctype || !docname) {
            frappe.show_alert({ message: __("No linked document"), indicator: "orange" });
            return;
        }

        frappe.call({
            method: "expenses_management.api.get_document_preview",
            args: { doctype: doctype, docname: docname },
            freeze: true,
            freeze_message: __("Loading..."),
            callback: function(r) {
                const data = r.message;
                if (!data) return;

                // Find the todo data from cache
                const todo = cachedAssignments.filter(function(a) { return a.name === todoName; })[0] || {};
                const stateColor = data.workflow_state ? getStateColor(data.workflow_state) : "gray";
                const slug = frappe.router.slug(doctype);
                const url = "/app/" + slug + "/" + docname;

                // Build fields HTML
                let fieldsHtml = "";
                (data.fields || []).forEach(function(field) {
                    let displayValue = field.value;
                    let valueClass = "";
                    if (field.fieldtype === "Currency") {
                        valueClass = "currency";
                        displayValue = format_currency(field.value);
                    }
                    fieldsHtml += `
                        <div class="am-preview-field">
                            <div class="am-preview-field-label">${__(field.label)}</div>
                            <div class="am-preview-field-value ${valueClass}">${displayValue}</div>
                        </div>
                    `;
                });

                // Add assignment-specific fields
                fieldsHtml += `
                    <div class="am-preview-field">
                        <div class="am-preview-field-label">${__("Priority")}</div>
                        <div class="am-preview-field-value">
                            <span class="am-priority ${getPriorityColor(todo.priority)}">${__(todo.priority || "Medium")}</span>
                        </div>
                    </div>
                    <div class="am-preview-field">
                        <div class="am-preview-field-label">${__("Due Date")}</div>
                        <div class="am-preview-field-value ${todo.is_overdue ? 'overdue-text' : ''}">${todo.date ? frappe.datetime.str_to_user(todo.date) : __("No due date")}</div>
                    </div>
                    <div class="am-preview-field">
                        <div class="am-preview-field-label">${__("Assigned By")}</div>
                        <div class="am-preview-field-value">${frappe.utils.escape_html(todo.assigned_by_full_name || todo.assigned_by || "")}</div>
                    </div>
                    <div class="am-preview-field">
                        <div class="am-preview-field-label">${__("Created")}</div>
                        <div class="am-preview-field-value">${todo.creation ? frappe.datetime.prettyDate(todo.creation) : ""}</div>
                    </div>
                `;

                if (todo.description_snippet) {
                    fieldsHtml += `
                        <div class="am-preview-field" style="grid-column: 1 / -1;">
                            <div class="am-preview-field-label">${__("Description")}</div>
                            <div class="am-preview-field-value">${frappe.utils.escape_html(todo.description_snippet)}</div>
                        </div>
                    `;
                }

                const html = `
                    <div class="am-preview-content">
                        <div class="am-preview-header">
                            <div class="am-preview-icon priority-${getPriorityColor(todo.priority)}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <path d="M9 11l3 3L22 4" opacity="0.5"/>
                                </svg>
                            </div>
                            <div class="am-preview-title-section">
                                <div class="am-preview-title">${data.title || docname}</div>
                                <div class="am-preview-subtitle">${__(doctype)} &bull; ${docname}</div>
                            </div>
                            ${data.workflow_state ? '<span class="am-preview-state am-state ' + stateColor + '">' + __(data.workflow_state) + '</span>' : ''}
                        </div>
                        <div class="am-preview-fields">${fieldsHtml}</div>
                        <div class="am-preview-actions">
                            <button type="button" class="am-preview-btn complete-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                ${__("Mark Complete")}
                            </button>
                            <button type="button" class="am-preview-btn open-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                                ${__("Open Form")}
                            </button>
                        </div>
                    </div>
                `;

                const previewDlg = new frappe.ui.Dialog({
                    title: __("Assignment Details"),
                    size: "large",
                    fields: [{ fieldtype: "HTML", fieldname: "preview_content", options: html }]
                });
                previewDlg.$wrapper.addClass("am-preview-modal");
                previewDlg.show();

                previewDlg.$wrapper.find(".complete-btn").on("click", function() {
                    previewDlg.hide();
                    completeAssignment(todoName, parentDlg);
                });

                previewDlg.$wrapper.find(".open-btn").on("click", function() {
                    previewDlg.hide();
                    window.open(url, "_blank");
                });
            }
        });
    }

    /* ──────────── Mention Preview ──────────── */

    function showMentionPreview(nlName, doctype, docname, parentDlg) {
        // Find mention from cache
        const mention = cachedMentions.filter(function(m) { return m.name === nlName; })[0];
        if (!mention) return;

        const slug = doctype ? frappe.router.slug(doctype) : "";
        const url = slug ? ("/app/" + slug + "/" + docname) : "";
        const fromUser = frappe.utils.escape_html(mention.from_user_full_name || mention.from_user || "");
        const timeStr = mention.creation ? frappe.datetime.prettyDate(mention.creation) : "";
        const docTitle = frappe.utils.escape_html(mention.doc_title || docname || "");

        const html = `
            <div class="am-preview-content">
                <div class="am-preview-header">
                    <div class="am-preview-icon mention-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="4"/>
                            <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
                        </svg>
                    </div>
                    <div class="am-preview-title-section">
                        <div class="am-preview-title">${docTitle}</div>
                        <div class="am-preview-subtitle">${doctype ? __(doctype) + ' &bull; ' : ''}${docname || ''}</div>
                    </div>
                </div>
                <div class="am-mention-detail">
                    <div class="am-mention-from">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <strong>${fromUser}</strong>
                        <span class="am-mention-time">${timeStr}</span>
                    </div>
                    ${mention.subject ? '<div class="am-mention-subject">' + frappe.utils.escape_html(mention.subject) + '</div>' : ''}
                    ${mention.content_snippet ? '<div class="am-mention-body">' + frappe.utils.escape_html(mention.content_snippet) + '</div>' : ''}
                </div>
                <div class="am-preview-actions">
                    <button type="button" class="am-preview-btn mark-read-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        ${__("Mark as Read")}
                    </button>
                    ${url ? `
                        <button type="button" class="am-preview-btn open-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            ${__("Open Document")}
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        const previewDlg = new frappe.ui.Dialog({
            title: __("Mention Details"),
            size: "large",
            fields: [{ fieldtype: "HTML", fieldname: "preview_content", options: html }]
        });
        previewDlg.$wrapper.addClass("am-preview-modal");
        previewDlg.show();

        previewDlg.$wrapper.find(".mark-read-btn").on("click", function() {
            previewDlg.hide();
            markMentionRead(nlName, parentDlg);
        });

        previewDlg.$wrapper.find(".open-btn").on("click", function() {
            // Also mark as read
            frappe.call({
                method: "expenses_management.api.mark_mention_read",
                args: { notification_log_name: nlName },
                async: true
            });
            cachedMentions = cachedMentions.filter(function(m) { return m.name !== nlName; });
            previewDlg.hide();
            window.open(url, "_blank");
            loadCount();
        });
    }

    /* ──────────── Helpers ──────────── */

    function getPriorityColor(priority) {
        switch ((priority || "").toLowerCase()) {
            case "high": return "red";
            case "medium": return "orange";
            case "low": return "blue";
            default: return "gray";
        }
    }

    function getStateColor(state) {
        var s = (state || "").toLowerCase();
        if (/pending|draft|open|waiting|new/.test(s)) return "orange";
        if (/approved|completed|accepted|done|success/.test(s)) return "green";
        if (/rejected|cancelled|denied|failed|error/.test(s)) return "red";
        if (/review|submitted|progress|processing/.test(s)) return "blue";
        return "gray";
    }

    function formatTime(dt) {
        if (!dt) return "";
        try { return frappe.datetime.prettyDate(dt); } catch(e) { return ""; }
    }

    function emptyState(type, title, subtitle) {
        var icon = type === "assignments"
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>';

        return `
            <div class="am-empty">
                <div class="am-empty-icon">${icon}</div>
                <h4>${title}</h4>
                <p>${subtitle}</p>
            </div>
        `;
    }

    /* ──────────── Styles ──────────── */

    function injectStyles() {
        if (document.getElementById("am-styles")) return;

        var css = document.createElement("style");
        css.id = "am-styles";
        css.textContent = `
            /* ── Navbar Button ── */
            .am-wrapper {
                display: flex;
                align-items: center;
                margin-left: 8px;
            }

            .am-trigger {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 34px;
                height: 34px;
                padding: 0;
                border: none;
                border-radius: 8px;
                background: transparent;
                color: var(--text-muted);
                cursor: pointer;
                transition: all 0.2s;
            }

            .am-trigger:hover {
                background: var(--fg-color);
                color: var(--primary);
            }

            .am-icon {
                width: 18px;
                height: 18px;
            }

            .am-badge {
                display: none;
                position: absolute;
                top: -2px;
                right: -2px;
                min-width: 16px;
                height: 16px;
                padding: 0 4px;
                font-size: 9px;
                font-weight: 700;
                line-height: 16px;
                text-align: center;
                color: #fff;
                background: #7c3aed;
                border-radius: 8px;
            }

            .am-badge.show {
                display: block;
            }

            /* ── Dialog ── */
            .am-dialog .modal-content {
                border-radius: 12px;
                overflow: hidden;
            }

            .am-dialog .modal-header {
                background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
                color: #fff;
                padding: 20px 24px;
                border: none;
            }

            .am-dialog .modal-header .modal-title {
                color: #fff;
                font-weight: 600;
            }

            .am-dialog .btn-modal-close {
                color: rgba(255,255,255,0.8);
            }

            .am-dialog .btn-modal-close:hover {
                color: #fff;
            }

            .am-dialog .modal-body {
                padding: 0;
            }

            /* ── Analytics Bar ── */
            .am-analytics {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
                background: var(--fg-color);
            }

            .am-stat-card {
                text-align: center;
                padding: 12px 8px;
                border-radius: 10px;
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                transition: all 0.2s;
            }

            .am-stat-card.danger {
                background: #fff5f5;
                border-color: #fed7d7;
            }

            .am-stat-card.warning {
                background: #fffbeb;
                border-color: #fde68a;
            }

            .am-stat-card.info {
                background: #f5f3ff;
                border-color: #ddd6fe;
            }

            .am-stat-value {
                font-size: 22px;
                font-weight: 700;
                color: var(--text-color);
                line-height: 1.2;
            }

            .am-stat-card.danger .am-stat-value { color: #dc2626; }
            .am-stat-card.warning .am-stat-value { color: #d97706; }
            .am-stat-card.info .am-stat-value { color: #7c3aed; }

            .am-stat-label {
                font-size: 11px;
                font-weight: 600;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.3px;
                margin-top: 4px;
            }

            /* ── Tabs ── */
            .am-tabs {
                display: flex;
                border-bottom: 2px solid var(--border-color);
                background: var(--fg-color);
                padding: 0 20px;
            }

            .am-tab {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 12px 20px;
                border: none;
                background: none;
                font-size: 13px;
                font-weight: 600;
                color: var(--text-muted);
                cursor: pointer;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                transition: all 0.2s;
            }

            .am-tab:hover {
                color: var(--text-color);
            }

            .am-tab.active {
                color: #7c3aed;
                border-bottom-color: #7c3aed;
            }

            .am-tab-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 20px;
                height: 20px;
                padding: 0 6px;
                font-size: 11px;
                font-weight: 700;
                border-radius: 10px;
                background: var(--bg-light-gray);
                color: var(--text-muted);
            }

            .am-tab.active .am-tab-count {
                background: #7c3aed;
                color: #fff;
            }

            /* ── Container ── */
            .am-container {
                max-height: 400px;
                overflow-y: auto;
            }

            .am-loading {
                text-align: center;
                padding: 40px;
                color: var(--text-muted);
            }

            /* ── Groups ── */
            .am-group {
                border-bottom: 1px solid var(--border-color);
            }

            .am-group:last-child {
                border-bottom: none;
            }

            .am-group-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 20px;
                background: var(--fg-color);
                cursor: pointer;
                user-select: none;
                transition: background 0.15s;
            }

            .am-group-header:hover {
                background: var(--bg-light-gray);
            }

            .am-group-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .am-group-arrow {
                width: 18px;
                height: 18px;
                color: var(--text-muted);
                transition: transform 0.25s ease;
            }

            .am-group.collapsed .am-group-arrow {
                transform: rotate(-90deg);
            }

            .am-group-title {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-color);
            }

            .am-group-count {
                background: #7c3aed;
                color: #fff;
                padding: 3px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
            }

            .am-group-items {
                overflow: hidden;
                max-height: 0;
                transition: max-height 0.3s ease;
            }

            .am-group:not(.collapsed) .am-group-items {
                max-height: 2000px;
            }

            /* ── Items ── */
            .am-item {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 14px 20px;
                border-bottom: 1px solid var(--border-color);
                transition: background 0.15s;
            }

            .am-item:hover {
                background: var(--fg-color);
            }

            .am-item:last-child {
                border-bottom: none;
            }

            .am-item-icon {
                width: 38px;
                height: 38px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                cursor: pointer;
            }

            .am-item-icon svg {
                width: 18px;
                height: 18px;
            }

            .am-item-icon.priority-red { background: #fee2e2; color: #dc2626; }
            .am-item-icon.priority-orange { background: #fff7ed; color: #ea580c; }
            .am-item-icon.priority-blue { background: #eff6ff; color: #2563eb; }
            .am-item-icon.priority-gray { background: #f3f4f6; color: #6b7280; }
            .am-item-icon.mention-icon { background: #f5f3ff; color: #7c3aed; }

            .am-item-content {
                flex: 1;
                min-width: 0;
                cursor: pointer;
            }

            .am-item-title {
                font-weight: 600;
                font-size: 13px;
                color: var(--text-color);
                margin-bottom: 3px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .am-item-meta {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: var(--text-muted);
                flex-wrap: wrap;
            }

            .am-item-id {
                font-family: var(--font-stack-monospace);
                font-size: 11px;
            }

            .am-meta-dot {
                color: var(--text-light);
            }

            .am-item-desc {
                font-size: 12px;
                color: var(--text-muted);
                margin-top: 4px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 400px;
            }

            .am-item-desc.mention-quote {
                font-style: italic;
                color: var(--text-light);
            }

            .am-item-right {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 4px;
                flex-shrink: 0;
            }

            .am-priority {
                padding: 3px 10px;
                font-size: 10px;
                font-weight: 700;
                border-radius: 6px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }

            .am-priority.red { background: #fee2e2; color: #dc2626; }
            .am-priority.orange { background: #fff7ed; color: #ea580c; }
            .am-priority.blue { background: #eff6ff; color: #2563eb; }
            .am-priority.gray { background: #f3f4f6; color: #6b7280; }

            .am-due {
                font-size: 11px;
                color: var(--text-light);
            }

            .am-due.overdue {
                color: #dc2626;
                font-weight: 600;
            }

            .am-item-actions {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-shrink: 0;
            }

            .am-action-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 30px;
                height: 30px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                padding: 0;
            }

            .am-action-btn svg {
                width: 15px;
                height: 15px;
            }

            .am-action-btn.preview {
                background: var(--bg-light-gray);
                color: var(--text-muted);
            }

            .am-action-btn.preview:hover {
                background: #f5f3ff;
                color: #7c3aed;
            }

            .am-action-btn.complete {
                background: #ecfdf5;
                color: #059669;
            }

            .am-action-btn.complete:hover {
                background: #d1fae5;
                color: #047857;
            }

            .am-action-btn.close-todo {
                background: #fef2f2;
                color: #dc2626;
            }

            .am-action-btn.close-todo:hover {
                background: #fee2e2;
                color: #b91c1c;
            }

            .am-action-btn.mark-read {
                background: #f5f3ff;
                color: #7c3aed;
            }

            .am-action-btn.mark-read:hover {
                background: #ede9fe;
                color: #6d28d9;
            }

            /* ── Empty State ── */
            .am-empty {
                text-align: center;
                padding: 50px 30px;
            }

            .am-empty-icon {
                width: 70px;
                height: 70px;
                margin: 0 auto 16px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .am-empty-icon svg {
                width: 36px;
                height: 36px;
            }

            .am-empty h4 {
                margin: 0 0 6px;
                font-size: 16px;
                font-weight: 600;
                color: var(--text-color);
            }

            .am-empty p {
                margin: 0;
                font-size: 13px;
                color: var(--text-muted);
            }

            /* ── Preview Modal ── */
            .am-preview-modal .modal-content {
                border-radius: 12px;
                overflow: hidden;
            }

            .am-preview-modal .modal-header {
                background: var(--fg-color);
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
            }

            .am-preview-modal .modal-body {
                padding: 0;
            }

            .am-preview-content {
                padding: 20px;
            }

            .am-preview-header {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
            }

            .am-preview-icon {
                width: 48px;
                height: 48px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .am-preview-icon svg {
                width: 24px;
                height: 24px;
            }

            .am-preview-icon.priority-red { background: #fee2e2; color: #dc2626; }
            .am-preview-icon.priority-orange { background: #fff7ed; color: #ea580c; }
            .am-preview-icon.priority-blue { background: #eff6ff; color: #2563eb; }
            .am-preview-icon.priority-gray { background: #f3f4f6; color: #6b7280; }
            .am-preview-icon.mention-icon { background: #f5f3ff; color: #7c3aed; }

            .am-preview-title-section {
                flex: 1;
            }

            .am-preview-title {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-color);
                margin-bottom: 4px;
            }

            .am-preview-subtitle {
                font-size: 13px;
                color: var(--text-muted);
            }

            .am-preview-state {
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 600;
                border-radius: 8px;
            }

            .am-state.orange { background: #fff8e1; color: #f57c00; }
            .am-state.green { background: #e8f5e9; color: #388e3c; }
            .am-state.red { background: #ffebee; color: #d32f2f; }
            .am-state.blue { background: #e3f2fd; color: #1976d2; }
            .am-state.gray { background: #f5f5f5; color: #616161; }

            .am-preview-fields {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }

            .am-preview-field {
                background: var(--fg-color);
                padding: 12px 16px;
                border-radius: 8px;
            }

            .am-preview-field-label {
                font-size: 11px;
                font-weight: 600;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }

            .am-preview-field-value {
                font-size: 14px;
                color: var(--text-color);
                font-weight: 500;
            }

            .am-preview-field-value.currency {
                font-family: var(--font-stack-monospace);
                color: var(--primary);
            }

            .am-preview-field-value.overdue-text {
                color: #dc2626;
                font-weight: 600;
            }

            /* ── Mention Detail ── */
            .am-mention-detail {
                margin-bottom: 20px;
            }

            .am-mention-from {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
                font-size: 14px;
                color: var(--text-color);
            }

            .am-mention-time {
                font-size: 12px;
                color: var(--text-muted);
                margin-left: auto;
            }

            .am-mention-subject {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-color);
                margin-bottom: 8px;
            }

            .am-mention-body {
                font-size: 13px;
                color: var(--text-muted);
                line-height: 1.6;
                padding: 14px 18px;
                background: var(--fg-color);
                border-radius: 10px;
                border-left: 3px solid #7c3aed;
            }

            /* ── Preview Actions ── */
            .am-preview-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid var(--border-color);
            }

            .am-preview-btn {
                flex: 1;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            .am-preview-btn svg {
                width: 18px;
                height: 18px;
            }

            .am-preview-btn.complete-btn {
                background: #059669;
                color: #fff;
            }

            .am-preview-btn.complete-btn:hover {
                background: #047857;
            }

            .am-preview-btn.mark-read-btn {
                background: #7c3aed;
                color: #fff;
            }

            .am-preview-btn.mark-read-btn:hover {
                background: #6d28d9;
            }

            .am-preview-btn.open-btn {
                background: var(--fg-color);
                color: var(--text-color);
                border: 1px solid var(--border-color);
            }

            .am-preview-btn.open-btn:hover {
                background: var(--bg-light-gray);
            }
        `;
        document.head.appendChild(css);
    }

})();
