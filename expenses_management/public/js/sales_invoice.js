frappe.ui.form.on("Sales Invoice", {
    customer: function(frm) {
        // Only fetch fresh data for draft invoices
        if (frm.doc.docstatus !== 0) return;

        if (frm.doc.customer) {
            // Fetch customer balance
            frappe.call({
                method: "expenses_management.expenses_management.sales_invoice.sales_invoice.get_customer_balance",
                args: {
                    customer: frm.doc.customer
                },
                callback: function(r) {
                    if (r.message !== undefined) {
                        frm.set_value("custom_customer_balance", r.message);
                    }
                }
            });

            // Fetch customer overdue amount
            frappe.call({
                method: "expenses_management.expenses_management.sales_invoice.sales_invoice.get_customer_overdue_amount",
                args: {
                    customer: frm.doc.customer
                },
                callback: function(r) {
                    if (r.message !== undefined) {
                        frm.set_value("custom_customer_overdue_amount", r.message);
                    }
                }
            });
        } else {
            frm.set_value("custom_customer_balance", 0);
            frm.set_value("custom_customer_overdue_amount", 0);
        }
    },

    refresh: function(frm) {
        // On load, use existing DB values - don't fetch fresh data
        // Fresh data is only fetched when customer field changes (for drafts only)
    }
});

frappe.ui.form.on("Sales Invoice Item", {
    custom_expected_delivery_warehouse: function(frm, cdt, cdn) {
        // Only fetch for draft invoices
        if (frm.doc.docstatus !== 0) return;

        let row = locals[cdt][cdn];
        if (row.item_code && row.custom_expected_delivery_warehouse) {
            frappe.call({
                method: "expenses_management.expenses_management.sales_invoice.sales_invoice.get_available_qty",
                args: {
                    item_code: row.item_code,
                    warehouse: row.custom_expected_delivery_warehouse
                },
                callback: function(r) {
                    if (r.message !== undefined) {
                        frappe.model.set_value(cdt, cdn, "custom_available_qty", r.message);
                    }
                }
            });
        } else {
            frappe.model.set_value(cdt, cdn, "custom_available_qty", 0);
        }
    },

    item_code: function(frm, cdt, cdn) {
        // Only fetch for draft invoices
        if (frm.doc.docstatus !== 0) return;

        let row = locals[cdt][cdn];
        if (row.item_code && row.custom_expected_delivery_warehouse) {
            frappe.call({
                method: "expenses_management.expenses_management.sales_invoice.sales_invoice.get_available_qty",
                args: {
                    item_code: row.item_code,
                    warehouse: row.custom_expected_delivery_warehouse
                },
                callback: function(r) {
                    if (r.message !== undefined) {
                        frappe.model.set_value(cdt, cdn, "custom_available_qty", r.message);
                    }
                }
            });
        }
    }
});
