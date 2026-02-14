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

        if (frm.doc.customer && (frm.doc.docstatus === 0 || frm.doc.docstatus === 1)) {
            frm.add_custom_button(__('تحليل العميل'), function() {
                si_show_customer_analysis(frm);
            }).addClass('btn-info');
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

function si_show_customer_analysis(frm) {
    frappe.call({
        method: "expenses_management.expenses_management.api.payment_entry.get_customer_analysis",
        args: {
            customer: frm.doc.customer,
            company: frm.doc.company
        },
        freeze: true,
        freeze_message: __("جاري تحميل بيانات العميل..."),
        callback: function(r) {
            if (!r.message) return;
            let data = r.message;
            let html = si_build_analysis_html(data);

            let dlg = new frappe.ui.Dialog({
                title: data.customer_name + ' - تحليل العميل',
                size: 'extra-large',
                fields: [
                    {
                        fieldtype: 'HTML',
                        fieldname: 'analysis_html',
                        options: html
                    }
                ]
            });

            dlg.show();
            dlg.$wrapper.find('.modal-dialog').css('max-width', '950px');
        }
    });
}

function si_build_analysis_html(data) {
    let status_label, status_color, status_bg, status_icon;
    if (data.status === 'good') {
        status_label = 'جيد'; status_color = '#27ae60'; status_bg = '#eafaf1'; status_icon = '&#10004;';
    } else if (data.status === 'warning') {
        status_label = 'تحذير'; status_color = '#e67e22'; status_bg = '#fef9e7'; status_icon = '&#9888;';
    } else {
        status_label = 'متجاوز'; status_color = '#e74c3c'; status_bg = '#fdedec'; status_icon = '&#10006;';
    }

    let html = `<div style="direction: rtl; text-align: right; font-family: inherit; padding: 5px;">`;

    html += `<div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; padding: 10px 32px; border-radius: 25px; background: ${status_bg}; color: ${status_color}; font-weight: bold; font-size: 18px; border: 2px solid ${status_color};">
            ${status_icon} حالة العميل: ${status_label}
        </span>
    </div>`;

    html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
            <h5 style="margin: 0 0 14px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; font-size: 15px;">الأرصدة والمستحقات</h5>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 4px; color: #555; font-size: 13px;">الرصيد الفعلي</td>
                    <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #2c3e50; text-align: left; white-space: nowrap;">${si_fmt(data.total_balance)}</td></tr>
                <tr style="background: #f9f9f9;"><td style="padding: 8px 4px; color: #555; font-size: 13px;">إجمالي الفواتير المستحقة <span style="color: #999; font-size: 11px;">(${data.outstanding_invoice_count} فاتورة)</span></td>
                    <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #e67e22; text-align: left; white-space: nowrap;">${si_fmt(data.total_outstanding)}</td></tr>`;

    if (data.unlinked_adjustment > 0) {
        html += `<tr><td style="padding: 8px 4px; color: #888; font-size: 12px;">تسويات غير مربوطة</td>
                    <td style="padding: 8px 4px; font-weight: bold; font-size: 14px; color: #27ae60; text-align: left; white-space: nowrap;">${si_fmt(data.unlinked_adjustment)}</td></tr>`;
    }

    html += `<tr style="background: #fff5f5;"><td style="padding: 8px 4px; color: #e74c3c; font-size: 13px; font-weight: bold;">المبالغ المتأخرة <span style="color: #999; font-size: 11px; font-weight: normal;">(${data.overdue_count} فاتورة)</span></td>
                <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #e74c3c; text-align: left; white-space: nowrap;">${si_fmt(data.total_overdue)}</td></tr>
            </table></div>`;

    html += `<div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
            <h5 style="margin: 0 0 14px 0; color: #2c3e50; border-bottom: 2px solid #9b59b6; padding-bottom: 8px; font-size: 15px;">الحد الائتماني</h5>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 4px; color: #555; font-size: 13px;">الحد الائتماني</td>
                    <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #9b59b6; text-align: left; white-space: nowrap;">${data.credit_limit > 0 ? si_fmt(data.credit_limit) : '<span style="color:#999">غير محدد</span>'}</td></tr>
                <tr style="background: #f9f9f9;"><td style="padding: 8px 4px; color: #555; font-size: 13px;">المستخدم من الحد</td>
                    <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #2c3e50; text-align: left; white-space: nowrap;">${data.credit_limit > 0 ? si_fmt(data.total_balance) + ' <span style="font-size:12px;color:#888">(' + data.credit_used_pct + '%)</span>' : '-'}</td></tr>
                <tr><td style="padding: 8px 4px; color: #555; font-size: 13px;">المتبقي من الحد</td>
                    <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #27ae60; text-align: left; white-space: nowrap;">${data.credit_limit > 0 ? si_fmt(data.credit_remaining) : '-'}</td></tr>
            </table>`;

    if (data.credit_limit > 0) {
        let bar_color = data.credit_used_pct > 100 ? '#e74c3c' : (data.credit_used_pct > 80 ? '#e67e22' : '#27ae60');
        let bar_width = Math.min(data.credit_used_pct, 100);
        html += `<div style="margin-top: 14px;"><div style="background: #ecf0f1; border-radius: 6px; height: 12px; overflow: hidden;">
                    <div style="background: ${bar_color}; height: 100%; width: ${bar_width}%; border-radius: 6px;"></div>
                </div><div style="text-align: center; font-size: 11px; color: #888; margin-top: 4px;">${data.credit_used_pct}% مستخدم</div></div>`;
    }

    html += `</div></div>`;

    if (data.all_outstanding_invoices && data.all_outstanding_invoices.length > 0) {
        html += `<div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px; margin-bottom: 16px;">
            <h5 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #e67e22; padding-bottom: 8px; font-size: 15px;">الفواتير المستحقة <span style="font-size: 12px; color: #999; font-weight: normal;">(${data.outstanding_invoice_count} فاتورة)</span></h5>
            <div style="max-height: 280px; overflow-y: auto;">
            <table class="table table-bordered table-sm" style="margin: 0; font-size: 13px;">
                <thead style="background-color: #f8f9fa; position: sticky; top: 0;"><tr>
                    <th style="text-align: center; padding: 8px;">رقم الفاتورة</th>
                    <th style="text-align: center; padding: 8px;">تاريخ الفاتورة</th>
                    <th style="text-align: center; padding: 8px;">تاريخ الاستحقاق</th>
                    <th style="text-align: center; padding: 8px;">المبلغ الإجمالي</th>
                    <th style="text-align: center; padding: 8px;">المبلغ المتبقي</th>
                    <th style="text-align: center; padding: 8px; width: 60px;">الحالة</th>
                </tr></thead><tbody>`;

        data.all_outstanding_invoices.forEach(function(inv) {
            let row_bg = inv.is_overdue ? '#fff5f5' : '#fff';
            let badge = inv.is_overdue
                ? '<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">متأخرة</span>'
                : '<span style="background:#27ae60;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">سارية</span>';
            html += `<tr style="background: ${row_bg};">
                <td style="text-align: center; padding: 6px;"><a href="/app/sales-invoice/${inv.name}" target="_blank" style="color: #3498db;">${inv.name}</a></td>
                <td style="text-align: center; padding: 6px;">${inv.posting_date || ''}</td>
                <td style="text-align: center; padding: 6px; ${inv.is_overdue ? 'color:#e74c3c;font-weight:bold;' : ''}">${inv.due_date || ''}</td>
                <td style="text-align: center; padding: 6px;">${si_fmt(inv.grand_total)}</td>
                <td style="text-align: center; padding: 6px; font-weight: bold; ${inv.is_overdue ? 'color:#e74c3c;' : 'color:#e67e22;'}">${si_fmt(inv.outstanding_amount)}</td>
                <td style="text-align: center; padding: 6px;">${badge}</td>
            </tr>`;
        });

        html += `</tbody></table></div></div>`;
    }

    if (data.recent_payments && data.recent_payments.length > 0) {
        html += `<div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
            <h5 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #27ae60; padding-bottom: 8px; font-size: 15px;">آخر المدفوعات</h5>
            <table class="table table-bordered table-sm" style="margin: 0; font-size: 13px;">
                <thead style="background-color: #f8f9fa;"><tr>
                    <th style="text-align: center; padding: 8px;">رقم السند</th>
                    <th style="text-align: center; padding: 8px;">التاريخ</th>
                    <th style="text-align: center; padding: 8px;">المبلغ</th>
                    <th style="text-align: center; padding: 8px;">طريقة الدفع</th>
                    <th style="text-align: center; padding: 8px;">المرجع</th>
                </tr></thead><tbody>`;

        data.recent_payments.forEach(function(pay) {
            html += `<tr>
                <td style="text-align: center; padding: 6px;"><a href="/app/payment-entry/${pay.name}" target="_blank" style="color: #3498db;">${pay.name}</a></td>
                <td style="text-align: center; padding: 6px;">${pay.posting_date || ''}</td>
                <td style="text-align: center; padding: 6px; font-weight: bold; color: #27ae60;">${si_fmt(pay.paid_amount)}</td>
                <td style="text-align: center; padding: 6px;">${pay.mode_of_payment || ''}</td>
                <td style="text-align: center; padding: 6px;">${pay.reference_no || ''}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
    }

    html += `</div>`;
    return html;
}

function si_fmt(value) {
    if (value === undefined || value === null) return '0.00';
    return frappe.format(value, {fieldtype: 'Currency'});
}
