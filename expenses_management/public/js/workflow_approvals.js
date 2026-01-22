/**
 * Workflow Approvals Button for Frappe Navbar
 */
(function() {
    "use strict";

    if (window.__workflow_approvals_initialized) return;
    window.__workflow_approvals_initialized = true;

    let refreshTimer = null;

    $(document).on("startup", function() {
        setTimeout(initButton, 1000);
    });

    $(document).ready(function() {
        setTimeout(initButton, 1500);
    });

    function initButton() {
        if (document.getElementById("workflow-approvals-btn")) return;

        const searchForm = document.querySelector("header.navbar form.form-inline");
        if (!searchForm) {
            setTimeout(initButton, 500);
            return;
        }

        injectStyles();

        const btnWrapper = document.createElement("div");
        btnWrapper.id = "workflow-approvals-btn";
        btnWrapper.className = "wfa-wrapper";
        btnWrapper.innerHTML = `
            <button type="button" class="wfa-trigger" title="${__("Workflow Approvals")}">
                <svg class="wfa-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <span class="wfa-badge" id="wfa-badge"></span>
            </button>
        `;

        searchForm.appendChild(btnWrapper);

        btnWrapper.querySelector(".wfa-trigger").addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            showDialog();
        });

        loadCount();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(loadCount, 120000);
    }

    function injectStyles() {
        if (document.getElementById("wfa-styles")) return;

        const css = document.createElement("style");
        css.id = "wfa-styles";
        css.textContent = `
            .wfa-wrapper {
                display: flex;
                align-items: center;
                margin-left: 12px;
            }

            .wfa-trigger {
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

            .wfa-trigger:hover {
                background: var(--fg-color);
                color: var(--primary);
            }

            .wfa-icon {
                width: 18px;
                height: 18px;
            }

            .wfa-badge {
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
                background: #e53935;
                border-radius: 8px;
            }

            .wfa-badge.show {
                display: block;
            }

            /* Enhanced Dialog Styles */
            .wfa-dialog .modal-content {
                border-radius: 12px;
                overflow: hidden;
            }

            .wfa-dialog .modal-header {
                background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, #1a6fc9) 100%);
                color: #fff;
                padding: 20px 24px;
                border: none;
            }

            .wfa-dialog .modal-header .modal-title {
                color: #fff;
                font-weight: 600;
            }

            .wfa-dialog .btn-modal-close {
                color: rgba(255,255,255,0.8);
            }

            .wfa-dialog .btn-modal-close:hover {
                color: #fff;
            }

            .wfa-dialog .modal-body {
                padding: 0;
            }

            .wfa-container {
                max-height: 500px;
                overflow-y: auto;
            }

            .wfa-group {
                border-bottom: 1px solid var(--border-color);
            }

            .wfa-group:last-child {
                border-bottom: none;
            }

            .wfa-group-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 20px;
                background: var(--fg-color);
                cursor: pointer;
                user-select: none;
                transition: background 0.15s;
            }

            .wfa-group-header:hover {
                background: var(--bg-light-gray);
            }

            .wfa-group-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .wfa-group-arrow {
                width: 18px;
                height: 18px;
                color: var(--text-muted);
                transition: transform 0.25s ease;
            }

            .wfa-group.collapsed .wfa-group-arrow {
                transform: rotate(-90deg);
            }

            .wfa-group-title {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-color);
            }

            .wfa-group-count {
                background: var(--primary);
                color: #fff;
                padding: 3px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
            }

            .wfa-group-items {
                overflow: hidden;
                max-height: 0;
                transition: max-height 0.3s ease;
            }

            .wfa-group:not(.collapsed) .wfa-group-items {
                max-height: 2000px;
            }

            .wfa-item {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
                text-decoration: none;
                color: inherit;
                cursor: pointer;
                transition: background 0.15s;
            }

            .wfa-item:hover {
                background: var(--fg-color);
            }

            .wfa-item:last-child {
                border-bottom: none;
            }

            .wfa-item-icon {
                width: 40px;
                height: 40px;
                border-radius: 10px;
                background: var(--bg-blue);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .wfa-item-icon svg {
                width: 20px;
                height: 20px;
                color: var(--primary);
            }

            .wfa-item-content {
                flex: 1;
                min-width: 0;
            }

            .wfa-item-title {
                font-weight: 600;
                font-size: 14px;
                color: var(--text-color);
                margin-bottom: 4px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .wfa-item-meta {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 12px;
                color: var(--text-muted);
            }

            .wfa-item-id {
                font-family: var(--font-stack-monospace);
                font-size: 11px;
            }

            .wfa-item-right {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 6px;
                flex-shrink: 0;
            }

            .wfa-state {
                padding: 4px 12px;
                font-size: 11px;
                font-weight: 600;
                border-radius: 6px;
                white-space: nowrap;
            }

            .wfa-state.orange { background: #fff8e1; color: #f57c00; }
            .wfa-state.green { background: #e8f5e9; color: #388e3c; }
            .wfa-state.red { background: #ffebee; color: #d32f2f; }
            .wfa-state.blue { background: #e3f2fd; color: #1976d2; }
            .wfa-state.gray { background: #f5f5f5; color: #616161; }

            .wfa-time {
                font-size: 11px;
                color: var(--text-light);
            }

            .wfa-item-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-left: 12px;
            }

            .wfa-action-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                padding: 0;
            }

            .wfa-action-btn svg {
                width: 16px;
                height: 16px;
            }

            .wfa-action-btn.preview {
                background: var(--bg-light-gray);
                color: var(--text-muted);
            }

            .wfa-action-btn.preview:hover {
                background: var(--bg-blue);
                color: var(--primary);
            }

            /* Preview Modal Styles */
            .wfa-preview-modal .modal-content {
                border-radius: 12px;
                overflow: hidden;
            }

            .wfa-preview-modal .modal-header {
                background: var(--fg-color);
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
            }

            .wfa-preview-modal .modal-body {
                padding: 0;
            }

            .wfa-preview-content {
                padding: 20px;
            }

            .wfa-preview-header {
                display: flex;
                align-items: center;
                gap: 16px;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
            }

            .wfa-preview-icon {
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: var(--bg-blue);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .wfa-preview-icon svg {
                width: 24px;
                height: 24px;
                color: var(--primary);
            }

            .wfa-preview-title-section {
                flex: 1;
            }

            .wfa-preview-title {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-color);
                margin-bottom: 4px;
            }

            .wfa-preview-subtitle {
                font-size: 13px;
                color: var(--text-muted);
            }

            .wfa-preview-state {
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 600;
                border-radius: 8px;
            }

            .wfa-preview-fields {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 16px;
            }

            .wfa-preview-field {
                background: var(--fg-color);
                padding: 12px 16px;
                border-radius: 8px;
            }

            .wfa-preview-field-label {
                font-size: 11px;
                font-weight: 600;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }

            .wfa-preview-field-value {
                font-size: 14px;
                color: var(--text-color);
                font-weight: 500;
            }

            .wfa-preview-field-value.currency {
                font-family: var(--font-stack-monospace);
                color: var(--primary);
            }

            .wfa-preview-actions {
                display: flex;
                gap: 10px;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid var(--border-color);
            }

            .wfa-preview-action-btn {
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

            .wfa-preview-action-btn svg {
                width: 18px;
                height: 18px;
            }

            .wfa-preview-action-btn.approve {
                background: #388e3c;
                color: #fff;
            }

            .wfa-preview-action-btn.approve:hover {
                background: #2e7d32;
            }

            .wfa-preview-action-btn.reject {
                background: #d32f2f;
                color: #fff;
            }

            .wfa-preview-action-btn.reject:hover {
                background: #c62828;
            }

            .wfa-preview-action-btn.other {
                background: var(--primary);
                color: #fff;
            }

            .wfa-preview-action-btn.other:hover {
                background: var(--primary-dark, #1a6fc9);
            }

            .wfa-preview-action-btn.secondary {
                background: var(--fg-color);
                color: var(--text-color);
                border: 1px solid var(--border-color);
            }

            .wfa-preview-action-btn.secondary:hover {
                background: var(--bg-light-gray);
            }

            .wfa-preview-action-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .wfa-empty {
                text-align: center;
                padding: 60px 30px;
            }

            .wfa-empty-icon {
                width: 80px;
                height: 80px;
                margin: 0 auto 20px;
                background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .wfa-empty-icon svg {
                width: 40px;
                height: 40px;
                color: #43a047;
            }

            .wfa-empty h4 {
                margin: 0 0 8px;
                font-size: 18px;
                font-weight: 600;
                color: var(--text-color);
            }

            .wfa-empty p {
                margin: 0;
                font-size: 14px;
                color: var(--text-muted);
            }
        `;
        document.head.appendChild(css);
    }

    function loadCount() {
        frappe.call({
            method: "expenses_management.api.get_pending_workflow_actions",
            async: true,
            callback: function(r) {
                const count = (r.message || []).length;
                const badge = document.getElementById("wfa-badge");
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? "99+" : count;
                        badge.classList.add("show");
                    } else {
                        badge.classList.remove("show");
                    }
                }
            }
        });
    }

    function getStateColor(state) {
        const s = (state || "").toLowerCase();
        if (/pending|draft|open|waiting|new/.test(s)) return "orange";
        if (/approved|completed|accepted|done|success/.test(s)) return "green";
        if (/rejected|cancelled|denied|failed|error/.test(s)) return "red";
        if (/review|submitted|progress|processing/.test(s)) return "blue";
        return "gray";
    }

    function formatTime(dt) {
        if (!dt) return "";
        try {
            return frappe.datetime.prettyDate(dt);
        } catch(e) {
            return "";
        }
    }

    function showDialog() {
        frappe.call({
            method: "expenses_management.api.get_pending_workflow_actions",
            freeze: true,
            freeze_message: __("Loading..."),
            callback: function(r) {
                const data = r.message || [];

                // Update badge
                const badge = document.getElementById("wfa-badge");
                if (badge) {
                    if (data.length > 0) {
                        badge.textContent = data.length > 99 ? "99+" : data.length;
                        badge.classList.add("show");
                    } else {
                        badge.classList.remove("show");
                    }
                }

                // Group by doctype
                const groups = {};
                data.forEach(function(item) {
                    const dt = item.reference_doctype;
                    if (!groups[dt]) groups[dt] = [];
                    groups[dt].push(item);
                });

                // Build HTML
                let html = "";

                if (data.length === 0) {
                    html = `
                        <div class="wfa-empty">
                            <div class="wfa-empty-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                            </div>
                            <h4>${__("All Caught Up!")}</h4>
                            <p>${__("No pending workflow approvals")}</p>
                        </div>
                    `;
                } else {
                    html = '<div class="wfa-container">';

                    const doctypes = Object.keys(groups).sort();
                    doctypes.forEach(function(doctype) {
                        const items = groups[doctype];

                        // Collapsed by default
                        html += `
                            <div class="wfa-group collapsed">
                                <div class="wfa-group-header">
                                    <div class="wfa-group-left">
                                        <svg class="wfa-group-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="6 9 12 15 18 9"/>
                                        </svg>
                                        <span class="wfa-group-title">${__(doctype)}</span>
                                    </div>
                                    <span class="wfa-group-count">${items.length}</span>
                                </div>
                                <div class="wfa-group-items">
                        `;

                        items.forEach(function(item) {
                            const slug = frappe.router.slug(item.reference_doctype);
                            const url = "/app/" + slug + "/" + item.reference_name;
                            const title = frappe.utils.escape_html(item.doc_title || item.reference_name);
                            const stateColor = getStateColor(item.workflow_state);
                            const timeStr = formatTime(item.creation);
                            

                            html += `
                                <div class="wfa-item" data-doctype="${item.reference_doctype}" data-docname="${item.reference_name}" data-route="${url}">
                                    <div class="wfa-item-icon">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                        </svg>
                                    </div>
                                    <div class="wfa-item-content">
                                        <div class="wfa-item-title">${title}</div>
                                        <div class="wfa-item-meta">
                                            <span class="wfa-item-id">${item.reference_name}</span>
                                        </div>
                                    </div>
                                    <div class="wfa-item-right">
                                        <span class="wfa-state ${stateColor}">${__(item.workflow_state)}</span>
                                        <span class="wfa-time">${timeStr}</span>
                                    </div>
                                    <div class="wfa-item-actions">
                                        <button type="button" class="wfa-action-btn preview" title="${__("View Details")}" data-action="preview" data-doctype="${item.reference_doctype}" data-docname="${item.reference_name}">
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
                }

                // Create dialog
                const dlg = new frappe.ui.Dialog({
                    title: `<span style="display:flex;align-items:center;gap:8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                        ${__("Workflow Approvals")}
                        ${data.length > 0 ? '<span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:12px;font-size:12px;margin-left:4px;">' + data.length + '</span>' : ''}
                    </span>`,
                    size: "large",
                    fields: [{
                        fieldtype: "HTML",
                        fieldname: "content_area",
                        options: html
                    }]
                });

                // Add custom class for styling
                dlg.$wrapper.addClass("wfa-dialog");

                dlg.show();

                // Click handler for collapsible groups - use dlg.$wrapper to scope the lookup
                dlg.$wrapper.on("click", ".wfa-group-header", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const $header = $(this);
                    const $group = $header.closest(".wfa-group");
                    if ($group.length) {
                        $group.toggleClass("collapsed");
                    }
                });

                // Click handler for preview button (eye icon) - use event delegation
                dlg.$wrapper.on("click", ".wfa-action-btn.preview", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const doctype = $(this).data("doctype");
                    const docname = $(this).data("docname");
                    showDocumentPreview(doctype, docname, dlg);
                });

                // Cleanup when dialog is hidden
                dlg.$wrapper.on("hidden.bs.modal", function() {
                    dlg.$wrapper.off("click");
                });
            }
        });
    }

    function updateGroupCounts(dlg) {
        dlg.$wrapper.find(".wfa-group").each(function() {
            const $group = $(this);
            const count = $group.find(".wfa-item").length;
            $group.find(".wfa-group-count").text(count);
            if (count === 0) {
                $group.fadeOut(300, function() {
                    $(this).remove();
                    // Check if all groups are empty
                    if (dlg.$wrapper.find(".wfa-group").length === 0) {
                        dlg.$wrapper.find(".wfa-container").html(`
                            <div class="wfa-empty">
                                <div class="wfa-empty-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                        <polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                </div>
                                <h4>${__("All Caught Up!")}</h4>
                                <p>${__("No pending workflow approvals")}</p>
                            </div>
                        `);
                    }
                });
            }
        });
        // Update dialog title count
        const totalCount = dlg.$wrapper.find(".wfa-item").length;
        const $titleCount = dlg.$wrapper.find(".modal-title span span:last-child");
        if ($titleCount.length) {
            $titleCount.text(totalCount);
        }
    }

    function showDocumentPreview(doctype, docname, parentDlg) {
        frappe.call({
            method: "expenses_management.api.get_document_preview",
            args: { doctype: doctype, docname: docname },
            freeze: true,
            freeze_message: __("Loading..."),
            callback: function(r) {
                const data = r.message;
                if (!data) return;

                const stateColor = getStateColor(data.workflow_state);
                const slug = frappe.router.slug(doctype);
                const url = "/app/" + slug + "/" + docname;

                // Build fields HTML
                let fieldsHtml = "";
                (data.fields || []).forEach(function(field) {
                    let valueClass = "";
                    let displayValue = field.value;

                    if (field.fieldtype === "Currency") {
                        valueClass = "currency";
                        displayValue = format_currency(field.value);
                    } else if (field.fieldtype === "Float" || field.fieldtype === "Percent") {
                        displayValue = frappe.format(field.value, { fieldtype: field.fieldtype });
                    }

                    fieldsHtml += `
                        <div class="wfa-preview-field">
                            <div class="wfa-preview-field-label">${__(field.label)}</div>
                            <div class="wfa-preview-field-value ${valueClass}">${displayValue}</div>
                        </div>
                    `;
                });

                // Add owner and created info
                fieldsHtml += `
                    <div class="wfa-preview-field">
                        <div class="wfa-preview-field-label">${__("Created By")}</div>
                        <div class="wfa-preview-field-value">${data.owner_name}</div>
                    </div>
                    <div class="wfa-preview-field">
                        <div class="wfa-preview-field-label">${__("Created On")}</div>
                        <div class="wfa-preview-field-value">${frappe.datetime.prettyDate(data.creation)}</div>
                    </div>
                `;

                let html = `
                    <div class="wfa-preview-content">
                        <div class="wfa-preview-header">
                            <div class="wfa-preview-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                </svg>
                            </div>
                            <div class="wfa-preview-title-section">
                                <div class="wfa-preview-title">${data.title || docname}</div>
                                <div class="wfa-preview-subtitle">${__(doctype)} &bull; ${docname}</div>
                            </div>
                            <span class="wfa-preview-state wfa-state ${stateColor}">${__(data.workflow_state)}</span>
                        </div>
                        <div class="wfa-preview-fields">
                            ${fieldsHtml}
                        </div>
                        <div class="wfa-preview-actions" id="preview-actions-container">
                            <!-- Actions will be loaded dynamically -->
                            <button type="button" class="wfa-preview-action-btn secondary open-form-btn">
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
                    title: __("Document Preview"),
                    size: "large",
                    fields: [{
                        fieldtype: "HTML",
                        fieldname: "preview_content",
                        options: html
                    }]
                });

                previewDlg.$wrapper.addClass("wfa-preview-modal");
                previewDlg.show();

                // Open form button handler
                previewDlg.$wrapper.find(".open-form-btn").on("click", function() {
                    previewDlg.hide();
                    parentDlg.hide();
                    frappe.set_route(url);
                });

                // Load workflow actions for preview
                frappe.call({
                    method: "expenses_management.api.get_workflow_transitions",
                    args: { doctype: doctype, docname: docname },
                    async: true,
                    callback: function(r) {
                        const actions = r.message || [];
                        const $actionsContainer = previewDlg.$wrapper.find("#preview-actions-container");

                        let actionButtonsHtml = "";
                        actions.forEach(function(action) {
                            const actionLower = action.action.toLowerCase();
                            let btnClass = "other";
                            let icon = "";

                            if (/approve|accept|confirm/.test(actionLower)) {
                                btnClass = "approve";
                                icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>`;
                            } else if (/reject|cancel|deny|refuse/.test(actionLower)) {
                                btnClass = "reject";
                                icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>`;
                            } else {
                                icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>`;
                            }

                            actionButtonsHtml += `
                                <button type="button" class="wfa-preview-action-btn ${btnClass}" data-action="${action.action}">
                                    ${icon}
                                    ${__(action.action)}
                                </button>
                            `;
                        });

                        // Prepend action buttons before "Open Form" button
                        $actionsContainer.prepend(actionButtonsHtml);

                        // Attach click handlers
                        $actionsContainer.find(".wfa-preview-action-btn:not(.secondary)").on("click", function(e) {
                            e.preventDefault();
                            const action = $(this).data("action");

                            frappe.confirm(
                                __("Are you sure you want to {0} this {1}?", [action, __(doctype)]),
                                function() {
                                    frappe.call({
                                        method: "expenses_management.api.apply_workflow_action",
                                        args: {
                                            doctype: doctype,
                                            docname: docname,
                                            action: action
                                        },
                                        freeze: true,
                                        freeze_message: __("Applying {0}...", [action]),
                                        callback: function(r) {
                                            if (r.message && r.message.success) {
                                                frappe.show_alert({
                                                    message: r.message.message || __("Action applied successfully"),
                                                    indicator: "green"
                                                });
                                                previewDlg.hide();
                                                // Remove the item from the parent list using data attributes
                                                const $item = parentDlg.$wrapper.find(`.wfa-item[data-doctype="${doctype}"][data-docname="${docname}"]`);
                                                $item.fadeOut(300, function() {
                                                    $(this).remove();
                                                    updateGroupCounts(parentDlg);
                                                    loadCount();
                                                });
                                            }
                                        },
                                        error: function(r) {
                                            frappe.show_alert({
                                                message: __("Failed to apply action"),
                                                indicator: "red"
                                            });
                                        }
                                    });
                                }
                            );
                        });
                    }
                });
            }
        });
    }

})();
