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

        // Add customer ledger button for draft and submitted invoices (not cancelled)
        if (frm.doc.docstatus === 0 || frm.doc.docstatus === 1) {
            frm.add_custom_button(__('كشف حساب العميل'), function() {
                // Check if customer is selected
                if (!frm.doc.customer) {
                    frappe.msgprint(__('يرجى تحديد العميل أولاً'));
                    return;
                }

                // Show dialog to select date range
                let dialog = new frappe.ui.Dialog({
                    title: __('طباعة كشف حساب العميل'),
                    fields: [
                        {
                            fieldtype: 'Link',
                            fieldname: 'customer',
                            label: __('العميل'),
                            options: 'Customer',
                            default: frm.doc.customer,
                            read_only: 1
                        },
                        {
                            fieldtype: 'Link',
                            fieldname: 'company',
                            label: __('الشركة'),
                            options: 'Company',
                            default: frm.doc.company,
                            reqd: 1
                        },
                        {
                            fieldtype: 'Column Break'
                        },
                        {
                            fieldtype: 'Date',
                            fieldname: 'from_date',
                            label: __('من تاريخ'),
                            default: frappe.datetime.add_months(frappe.datetime.get_today(), -12),
                            reqd: 1
                        },
                        {
                            fieldtype: 'Date',
                            fieldname: 'to_date',
                            label: __('إلى تاريخ'),
                            default: frappe.datetime.get_today(),
                            reqd: 1
                        }
                    ],
                    primary_action_label: __('طباعة'),
                    primary_action: function(values) {
                        dialog.hide();
                        frappe.call({
                            method: 'expenses_management.expenses_management.api.customer_ledger.get_customer_ledger_html',
                            args: {
                                customer: values.customer,
                                company: values.company,
                                from_date: values.from_date,
                                to_date: values.to_date
                            },
                            freeze: true,
                            freeze_message: __('جاري تحميل كشف الحساب...'),
                            callback: function(r) {
                                if (r.message) {
                                    let printWindow = window.open('', '_blank', 'width=1200,height=800');
                                    printWindow.document.write(r.message);
                                    printWindow.document.close();
                                    printWindow.onload = function() {
                                        setTimeout(function() {
                                            printWindow.print();
                                        }, 500);
                                    };
                                }
                            }
                        });
                    }
                });
                dialog.show();
            }).addClass('btn-primary');
        }
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
