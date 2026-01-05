frappe.ui.form.on("Customer", {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('الفواتير المتأخرة'), function() {
                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Sales Invoice',
                        filters: {
                            customer: frm.doc.name,
                            docstatus: 1,
                            outstanding_amount: ['>', 0],
                            due_date: ['<', frappe.datetime.get_today()]
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
                                    <h4>الفواتير المتأخرة للعميل: ${frm.doc.customer_name || frm.doc.name}</h4>
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
