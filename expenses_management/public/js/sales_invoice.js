frappe.ui.form.on("Sales Invoice", {
    customer: function(frm) {
        if (frm.doc.customer) {
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
        } else {
            frm.set_value("custom_customer_balance", 0);
        }
    },

    refresh: function(frm) {
        // On load, use existing DB values - don't fetch fresh data
        // Fresh data is only fetched when customer field changes
    }
});

frappe.ui.form.on("Sales Invoice Item", {
    custom_expected_delivery_warehouse: function(frm, cdt, cdn) {
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
