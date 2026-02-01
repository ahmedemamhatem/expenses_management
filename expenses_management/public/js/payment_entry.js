frappe.ui.form.on("Payment Entry", {
    refresh: function(frm) {
        if (frm.doc.payment_type === "Receive"
            && frm.doc.party_type === "Customer"
            && frm.doc.party) {
            frm.add_custom_button(__('تحليل العميل'), function() {
                show_customer_analysis(frm);
            }).addClass('btn-info');
        }
    }
});

function show_customer_analysis(frm) {
    frappe.call({
        method: "expenses_management.expenses_management.api.payment_entry.get_customer_analysis",
        args: {
            customer: frm.doc.party,
            company: frm.doc.company
        },
        freeze: true,
        freeze_message: __("جاري تحميل بيانات العميل..."),
        callback: function(r) {
            if (!r.message) return;
            let data = r.message;
            let html = build_analysis_html(data);

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

function build_analysis_html(data) {
    let status_label, status_color, status_bg, status_icon;
    if (data.status === 'good') {
        status_label = 'جيد';
        status_color = '#27ae60';
        status_bg = '#eafaf1';
        status_icon = '&#10004;';
    } else if (data.status === 'warning') {
        status_label = 'تحذير';
        status_color = '#e67e22';
        status_bg = '#fef9e7';
        status_icon = '&#9888;';
    } else {
        status_label = 'متجاوز';
        status_color = '#e74c3c';
        status_bg = '#fdedec';
        status_icon = '&#10006;';
    }

    let html = `<div style="direction: rtl; text-align: right; font-family: inherit; padding: 5px;">`;

    // ── Status Badge ──
    html += `
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="
                display: inline-block;
                padding: 10px 32px;
                border-radius: 25px;
                background: ${status_bg};
                color: ${status_color};
                font-weight: bold;
                font-size: 18px;
                border: 2px solid ${status_color};
            ">
                ${status_icon} حالة العميل: ${status_label}
            </span>
        </div>
    `;

    // ── Main Summary Section ──
    html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">

            <!-- Right Column: Balances -->
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
                <h5 style="margin: 0 0 14px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; font-size: 15px;">
                    الأرصدة والمستحقات
                </h5>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">الرصيد الفعلي (من القيود)</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #2c3e50; text-align: left; white-space: nowrap;">
                            ${format_currency_val(data.total_balance)}
                        </td>
                    </tr>
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">
                            إجمالي الفواتير المستحقة
                            <span style="color: #999; font-size: 11px;">(${data.outstanding_invoice_count} فاتورة)</span>
                        </td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #e67e22; text-align: left; white-space: nowrap;">
                            ${format_currency_val(data.total_outstanding)}
                        </td>
                    </tr>`;

    if (data.unlinked_adjustment > 0) {
        html += `
                    <tr>
                        <td style="padding: 8px 4px; color: #888; font-size: 12px;">
                            تسويات غير مربوطة (قيود يومية)
                        </td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 14px; color: #27ae60; text-align: left; white-space: nowrap;">
                            ${format_currency_val(data.unlinked_adjustment)}
                        </td>
                    </tr>`;
    }

    html += `
                    <tr style="background: #fff5f5;">
                        <td style="padding: 8px 4px; color: #e74c3c; font-size: 13px; font-weight: bold;">
                            المبالغ المتأخرة
                            <span style="color: #999; font-size: 11px; font-weight: normal;">(${data.overdue_count} فاتورة)</span>
                        </td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #e74c3c; text-align: left; white-space: nowrap;">
                            ${format_currency_val(data.total_overdue)}
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Left Column: Credit Info -->
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
                <h5 style="margin: 0 0 14px 0; color: #2c3e50; border-bottom: 2px solid #9b59b6; padding-bottom: 8px; font-size: 15px;">
                    الحد الائتماني
                </h5>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">الحد الائتماني</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #9b59b6; text-align: left; white-space: nowrap;">
                            ${data.credit_limit > 0 ? format_currency_val(data.credit_limit) : '<span style="color:#999">غير محدد</span>'}
                        </td>
                    </tr>
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">المستخدم من الحد</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #2c3e50; text-align: left; white-space: nowrap;">
                            ${data.credit_limit > 0 ? format_currency_val(data.total_balance) + ' <span style="font-size:12px;color:#888">(' + data.credit_used_pct + '%)</span>' : '-'}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">المتبقي من الحد</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #27ae60; text-align: left; white-space: nowrap;">
                            ${data.credit_limit > 0 ? format_currency_val(data.credit_remaining) : '-'}
                        </td>
                    </tr>
                </table>`;

    // Credit usage bar
    if (data.credit_limit > 0) {
        let bar_color = data.credit_used_pct > 100 ? '#e74c3c' : (data.credit_used_pct > 80 ? '#e67e22' : '#27ae60');
        let bar_width = Math.min(data.credit_used_pct, 100);
        html += `
                <div style="margin-top: 14px;">
                    <div style="background: #ecf0f1; border-radius: 6px; height: 12px; overflow: hidden;">
                        <div style="background: ${bar_color}; height: 100%; width: ${bar_width}%; border-radius: 6px; transition: width 0.3s;"></div>
                    </div>
                    <div style="text-align: center; font-size: 11px; color: #888; margin-top: 4px;">
                        ${data.credit_used_pct}% مستخدم
                    </div>
                </div>`;
    }

    html += `
            </div>
        </div>
    `;

    // ── Outstanding Invoices Table ──
    if (data.all_outstanding_invoices && data.all_outstanding_invoices.length > 0) {
        html += `
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px; margin-bottom: 16px;">
                <h5 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #e67e22; padding-bottom: 8px; font-size: 15px;">
                    الفواتير المستحقة
                    <span style="font-size: 12px; color: #999; font-weight: normal;">(${data.outstanding_invoice_count} فاتورة)</span>
                </h5>
                <div style="max-height: 280px; overflow-y: auto;">
                <table class="table table-bordered table-sm" style="margin: 0; font-size: 13px;">
                    <thead style="background-color: #f8f9fa; position: sticky; top: 0;">
                        <tr>
                            <th style="text-align: center; padding: 8px;">رقم الفاتورة</th>
                            <th style="text-align: center; padding: 8px;">تاريخ الفاتورة</th>
                            <th style="text-align: center; padding: 8px;">تاريخ الاستحقاق</th>
                            <th style="text-align: center; padding: 8px;">المبلغ الإجمالي</th>
                            <th style="text-align: center; padding: 8px;">المبلغ المتبقي</th>
                            <th style="text-align: center; padding: 8px; width: 60px;">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.all_outstanding_invoices.forEach(function(inv) {
            let row_bg = inv.is_overdue ? '#fff5f5' : '#fff';
            let overdue_badge = inv.is_overdue
                ? '<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">متأخرة</span>'
                : '<span style="background:#27ae60;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">سارية</span>';

            html += `
                <tr style="background: ${row_bg};">
                    <td style="text-align: center; padding: 6px;">
                        <a href="/app/sales-invoice/${inv.name}" target="_blank" style="color: #3498db;">${inv.name}</a>
                    </td>
                    <td style="text-align: center; padding: 6px;">${inv.posting_date || ''}</td>
                    <td style="text-align: center; padding: 6px; ${inv.is_overdue ? 'color:#e74c3c;font-weight:bold;' : ''}">${inv.due_date || ''}</td>
                    <td style="text-align: center; padding: 6px;">${format_currency_val(inv.grand_total)}</td>
                    <td style="text-align: center; padding: 6px; font-weight: bold; ${inv.is_overdue ? 'color:#e74c3c;' : 'color:#e67e22;'}">${format_currency_val(inv.outstanding_amount)}</td>
                    <td style="text-align: center; padding: 6px;">${overdue_badge}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
                </div>
            </div>
        `;
    }

    // ── Recent Payments Table ──
    if (data.recent_payments && data.recent_payments.length > 0) {
        html += `
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
                <h5 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #27ae60; padding-bottom: 8px; font-size: 15px;">
                    آخر المدفوعات
                </h5>
                <table class="table table-bordered table-sm" style="margin: 0; font-size: 13px;">
                    <thead style="background-color: #f8f9fa;">
                        <tr>
                            <th style="text-align: center; padding: 8px;">رقم السند</th>
                            <th style="text-align: center; padding: 8px;">التاريخ</th>
                            <th style="text-align: center; padding: 8px;">المبلغ</th>
                            <th style="text-align: center; padding: 8px;">طريقة الدفع</th>
                            <th style="text-align: center; padding: 8px;">المرجع</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.recent_payments.forEach(function(pay) {
            html += `
                <tr>
                    <td style="text-align: center; padding: 6px;">
                        <a href="/app/payment-entry/${pay.name}" target="_blank" style="color: #3498db;">${pay.name}</a>
                    </td>
                    <td style="text-align: center; padding: 6px;">${pay.posting_date || ''}</td>
                    <td style="text-align: center; padding: 6px; font-weight: bold; color: #27ae60;">${format_currency_val(pay.paid_amount)}</td>
                    <td style="text-align: center; padding: 6px;">${pay.mode_of_payment || ''}</td>
                    <td style="text-align: center; padding: 6px;">${pay.reference_no || ''}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function format_currency_val(value) {
    if (value === undefined || value === null) return '0.00';
    return frappe.format(value, {fieldtype: 'Currency'});
}
