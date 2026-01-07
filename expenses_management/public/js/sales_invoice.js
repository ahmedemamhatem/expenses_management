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

        if (frm.doc.docstatus === 0 || frm.doc.docstatus === 1) {
            frm.add_custom_button(__('الفواتير المتأخرة'), function() {
                if (!frm.doc.customer) {
                    frappe.msgprint(__('يرجى تحديد العميل أولاً'));
                    return;
                }

                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Sales Invoice',
                        filters: {
                            customer: frm.doc.customer,
                            docstatus: 1,
                            outstanding_amount: ['>', 0],
                            due_date: ['<', frappe.datetime.get_today()],
                            is_return: 0,
                            status: ['!=', 'Credit Note Issued']
                        },
                        fields: ['name', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount'],
                        order_by: 'due_date asc'
                    },
                    freeze: true,
                    freeze_message: __('جاري تحميل الفواتير المتأخرة...'),
                    callback: function(r) {
                        if (r.message && r.message.length > 0) {
                            let invoices = r.message;
                            let total_outstanding = 0;
                            let rows = '';

                            invoices.forEach(function(inv) {
                                total_outstanding += inv.outstanding_amount;
                                rows += `<tr>
                                    <td><a href="/app/sales-invoice/${inv.name}" target="_blank">${inv.name}</a></td>
                                    <td>${inv.posting_date}</td>
                                    <td>${inv.due_date}</td>
                                    <td>${frappe.format(inv.grand_total, {fieldtype: 'Currency'})}</td>
                                    <td>${frappe.format(inv.outstanding_amount, {fieldtype: 'Currency'})}</td>
                                </tr>`;
                            });

                            let html = `
                                <div style="direction: rtl; text-align: right;">
                                    <h4>الفواتير المتأخرة للعميل: ${frm.doc.customer_name || frm.doc.customer}</h4>
                                    <table class="table table-bordered table-sm">
                                        <thead style="background-color: #f8d7da;">
                                            <tr>
                                                <th>رقم الفاتورة</th>
                                                <th>تاريخ الفاتورة</th>
                                                <th>تاريخ الاستحقاق</th>
                                                <th>إجمالي الفاتورة</th>
                                                <th>المبلغ المتبقي</th>
                                            </tr>
                                        </thead>
                                        <tbody>${rows}</tbody>
                                        <tfoot style="background-color: #fff3cd; font-weight: bold;">
                                            <tr>
                                                <td colspan="4">إجمالي المبالغ المتأخرة</td>
                                                <td>${frappe.format(total_outstanding, {fieldtype: 'Currency'})}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                    <p><strong>عدد الفواتير المتأخرة:</strong> ${invoices.length}</p>
                                </div>
                            `;

                            frappe.msgprint({
                                title: __('الفواتير المتأخرة'),
                                message: html,
                                wide: true
                            });
                        } else {
                            frappe.msgprint(__('لا توجد فواتير متأخرة لهذا العميل'));
                        }
                    }
                });
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

        // Clear ton_rate when item changes
        if (row.item_code) {
            frappe.model.set_value(cdt, cdn, "custom_ton_rate", 0);
        }
    },

    // When ton_rate is set, calculate the item rate based on weight
    custom_ton_rate: function(frm, cdt, cdn) {
        if (frm.doc.docstatus !== 0) return;

        let row = locals[cdt][cdn];
        if (!row.item_code || !row.custom_ton_rate) return;

        // Prevent recursive updates
        if (row._updating_from_rate) {
            row._updating_from_rate = false;
            return;
        }

        frappe.call({
            method: "expenses_management.expenses_management.sales_invoice.sales_invoice.get_item_weight",
            args: {
                item_code: row.item_code
            },
            callback: function(r) {
                if (r.message && r.message.weight_per_unit > 0) {
                    let weight_kg = r.message.weight_in_kg;
                    // Formula: rate = (ton_rate / 1000) * weight_per_unit_in_kg
                    let rate_per_kg = flt(row.custom_ton_rate) / 1000;
                    let new_rate = flt(rate_per_kg * weight_kg, precision("rate", row));

                    row._updating_from_ton_rate = true;
                    frappe.model.set_value(cdt, cdn, "rate", new_rate);
                }
            }
        });
    },

    // When rate is set manually, calculate the ton_rate based on weight
    rate: function(frm, cdt, cdn) {
        if (frm.doc.docstatus !== 0) return;

        let row = locals[cdt][cdn];
        if (!row.item_code || !row.rate) return;

        // Prevent recursive updates
        if (row._updating_from_ton_rate) {
            row._updating_from_ton_rate = false;
            return;
        }

        frappe.call({
            method: "expenses_management.expenses_management.sales_invoice.sales_invoice.get_item_weight",
            args: {
                item_code: row.item_code
            },
            callback: function(r) {
                if (r.message && r.message.weight_per_unit > 0) {
                    let weight_kg = r.message.weight_in_kg;
                    // Formula: ton_rate = (rate / weight_per_unit_in_kg) * 1000
                    let ton_rate = flt((row.rate / weight_kg) * 1000, 2);

                    row._updating_from_rate = true;
                    frappe.model.set_value(cdt, cdn, "custom_ton_rate", ton_rate);
                }
            }
        });
    }
});
