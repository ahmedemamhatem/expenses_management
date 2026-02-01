frappe.ui.form.on("Loan Application", {
    refresh: function(frm) {
        if (frm.doc.applicant_type === "Employee" && frm.doc.applicant) {
            frm.add_custom_button(__('تحليل القروض'), function() {
                show_loans_analysis(frm);
            }).addClass('btn-info');
        }
    }
});

function show_loans_analysis(frm) {
    frappe.call({
        method: "expenses_management.expenses_management.api.loan_application.get_employee_loans_analysis",
        args: {
            employee: frm.doc.applicant,
            company: frm.doc.company
        },
        freeze: true,
        freeze_message: __("جاري تحميل بيانات القروض..."),
        callback: function(r) {
            if (!r.message) return;
            let data = r.message;
            let html = build_loans_html(data);

            let dlg = new frappe.ui.Dialog({
                title: data.employee_name + ' - تحليل القروض',
                size: 'extra-large',
                fields: [
                    {
                        fieldtype: 'HTML',
                        fieldname: 'loans_html',
                        options: html
                    }
                ]
            });

            dlg.show();
            dlg.$wrapper.find('.modal-dialog').css('max-width', '1000px');
        }
    });
}

function build_loans_html(data) {
    let salary = data.salary || {};

    let html = `<div style="direction: rtl; text-align: right; font-family: inherit; padding: 5px;">`;

    // ── Salary & Ratio Top Section ──
    let ratio_color, ratio_bg, ratio_label;
    if (data.ratio_status === 'good') {
        ratio_color = '#27ae60'; ratio_bg = '#eafaf1'; ratio_label = 'جيد';
    } else if (data.ratio_status === 'warning') {
        ratio_color = '#e67e22'; ratio_bg = '#fef9e7'; ratio_label = 'تحذير';
    } else {
        ratio_color = '#e74c3c'; ratio_bg = '#fdedec'; ratio_label = 'مرتفع';
    }

    html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">

            <!-- Salary Card -->
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
                <h5 style="margin: 0 0 14px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; font-size: 15px;">
                    بيانات الراتب
                </h5>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">الراتب الأساسي</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #2c3e50; text-align: left; white-space: nowrap;">
                            ${salary.base_salary > 0 ? fmt_cur(salary.base_salary) : '<span style="color:#999">غير متوفر</span>'}
                        </td>
                    </tr>
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">إجمالي الراتب</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #3498db; text-align: left; white-space: nowrap;">
                            ${salary.gross_pay > 0 ? fmt_cur(salary.gross_pay) : '<span style="color:#999">غير متوفر</span>'}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 4px; color: #555; font-size: 13px;">صافي الراتب</td>
                        <td style="padding: 8px 4px; font-weight: bold; font-size: 16px; color: #27ae60; text-align: left; white-space: nowrap;">
                            ${salary.net_pay > 0 ? fmt_cur(salary.net_pay) : '<span style="color:#999">غير متوفر</span>'}
                        </td>
                    </tr>
                </table>
                ${salary.salary_slip_date ? '<div style="color:#999; font-size:11px; margin-top:8px;">آخر مسير رواتب: ' + salary.salary_slip_date + '</div>' : ''}
            </div>

            <!-- Loan-to-Salary Ratio Card -->
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px;">
                <h5 style="margin: 0 0 14px 0; color: #2c3e50; border-bottom: 2px solid ${ratio_color}; padding-bottom: 8px; font-size: 15px;">
                    نسبة القروض للراتب
                </h5>

                <div style="text-align: center; margin: 16px 0;">
                    <span style="
                        display: inline-block;
                        padding: 10px 28px;
                        border-radius: 25px;
                        background: ${ratio_bg};
                        color: ${ratio_color};
                        font-weight: bold;
                        font-size: 22px;
                        border: 2px solid ${ratio_color};
                    ">
                        ${data.loan_salary_pct}%
                    </span>
                    <div style="color: ${ratio_color}; font-weight: bold; margin-top: 6px; font-size: 13px;">${ratio_label}</div>
                </div>

                <!-- Progress bar -->
                <div style="margin-top: 10px;">
                    <div style="background: #ecf0f1; border-radius: 6px; height: 14px; overflow: hidden;">
                        <div style="background: ${ratio_color}; height: 100%; width: ${Math.min(data.loan_salary_pct, 100)}%; border-radius: 6px;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-top: 4px;">
                        <span>0%</span>
                        <span style="color: #27ae60;">30%</span>
                        <span style="color: #e67e22;">50%</span>
                        <span style="color: #e74c3c;">100%</span>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 14px;">
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 6px 4px; color: #555; font-size: 12px;">إجمالي الأقساط الشهرية</td>
                        <td style="padding: 6px 4px; font-weight: bold; font-size: 14px; color: #e67e22; text-align: left;">${fmt_cur(data.total_monthly_emi)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 4px; color: #555; font-size: 12px;">إجمالي المتبقي</td>
                        <td style="padding: 6px 4px; font-weight: bold; font-size: 14px; color: #e74c3c; text-align: left;">${fmt_cur(data.total_outstanding)}</td>
                    </tr>
                </table>
            </div>
        </div>
    `;

    // ── Summary Cards Row ──
    html += `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
            <div style="background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; border-right: 4px solid #3498db;">
                <div style="color: #7f8c8d; font-size: 11px; margin-bottom: 4px;">إجمالي القروض</div>
                <div style="font-size: 16px; font-weight: bold; color: #2c3e50;">${fmt_cur(data.total_loan_amount)}</div>
            </div>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; border-right: 4px solid #27ae60;">
                <div style="color: #7f8c8d; font-size: 11px; margin-bottom: 4px;">القروض النشطة</div>
                <div style="font-size: 16px; font-weight: bold; color: #27ae60;">${data.active_loans ? data.active_loans.length : 0}</div>
            </div>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; border-right: 4px solid #9b59b6;">
                <div style="color: #7f8c8d; font-size: 11px; margin-bottom: 4px;">القروض المنتهية</div>
                <div style="font-size: 16px; font-weight: bold; color: #9b59b6;">${data.closed_count}</div>
            </div>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; border-right: 4px solid #e74c3c;">
                <div style="color: #7f8c8d; font-size: 11px; margin-bottom: 4px;">المتبقي</div>
                <div style="font-size: 16px; font-weight: bold; color: #e74c3c;">${fmt_cur(data.total_outstanding)}</div>
            </div>
        </div>
    `;

    // ── Active Loans Table ──
    if (data.active_loans && data.active_loans.length > 0) {
        html += `
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 18px; margin-bottom: 16px;">
                <h5 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #e67e22; padding-bottom: 8px; font-size: 15px;">
                    القروض النشطة
                </h5>
                <div style="overflow-x: auto;">
                <table class="table table-bordered table-sm" style="margin: 0; font-size: 12px; white-space: nowrap;">
                    <thead style="background-color: #f8f9fa;">
                        <tr>
                            <th style="text-align: center; padding: 8px;">رقم القرض</th>
                            <th style="text-align: center; padding: 8px;">نوع القرض</th>
                            <th style="text-align: center; padding: 8px;">مبلغ القرض</th>
                            <th style="text-align: center; padding: 8px;">المدفوع</th>
                            <th style="text-align: center; padding: 8px;">المتبقي</th>
                            <th style="text-align: center; padding: 8px;">القسط الشهري</th>
                            <th style="text-align: center; padding: 8px;">الأقساط</th>
                            <th style="text-align: center; padding: 8px;">القسط التالي</th>
                            <th style="text-align: center; padding: 8px;">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.active_loans.forEach(function(loan) {
            let status_badge = get_loan_status_badge(loan.status, loan.days_past_due);
            let installment_text = loan.installments_total > 0
                ? loan.installments_paid + '/' + loan.installments_total
                : '-';
            let overdue_text = loan.installments_overdue > 0
                ? ' <span style="color:#e74c3c;font-size:10px;">(' + loan.installments_overdue + ' متأخر)</span>'
                : '';

            html += `
                <tr>
                    <td style="text-align: center; padding: 6px;">
                        <a href="/app/loan/${loan.name}" target="_blank" style="color: #3498db;">${loan.name}</a>
                    </td>
                    <td style="text-align: center; padding: 6px;">${loan.loan_product || ''}</td>
                    <td style="text-align: center; padding: 6px;">${fmt_cur(loan.loan_amount)}</td>
                    <td style="text-align: center; padding: 6px; color: #27ae60;">${fmt_cur(loan.total_amount_paid)}</td>
                    <td style="text-align: center; padding: 6px; font-weight: bold; color: #e74c3c;">${fmt_cur(loan.outstanding)}</td>
                    <td style="text-align: center; padding: 6px; color: #e67e22; font-weight: bold;">${fmt_cur(loan.monthly_repayment_amount)}</td>
                    <td style="text-align: center; padding: 6px;">${installment_text}${overdue_text}</td>
                    <td style="text-align: center; padding: 6px; font-size: 11px;">
                        ${loan.next_emi_date ? loan.next_emi_date + '<br><span style="color:#e67e22;">' + fmt_cur(loan.next_emi_amount) + '</span>' : '-'}
                    </td>
                    <td style="text-align: center; padding: 6px;">${status_badge}</td>
                </tr>
            `;
        });

        // Totals row
        html += `
                <tr style="background: #f0f0f0; font-weight: bold;">
                    <td colspan="2" style="text-align: center; padding: 8px;">الإجمالي</td>
                    <td style="text-align: center; padding: 8px;">${fmt_cur(data.total_loan_amount)}</td>
                    <td style="text-align: center; padding: 8px; color: #27ae60;">-</td>
                    <td style="text-align: center; padding: 8px; color: #e74c3c;">${fmt_cur(data.total_outstanding)}</td>
                    <td style="text-align: center; padding: 8px; color: #e67e22;">${fmt_cur(data.total_monthly_emi)}</td>
                    <td colspan="3" style="text-align: center; padding: 8px;"></td>
                </tr>
        `;

        html += `
                    </tbody>
                </table>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="background: #eafaf1; border: 1px solid #27ae60; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 16px;">
                <span style="color: #27ae60; font-size: 16px; font-weight: bold;">لا توجد قروض نشطة لهذا الموظف</span>
            </div>
        `;
    }

    // ── Closed Loans Summary ──
    if (data.closed_count > 0) {
        html += `
            <div style="background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 10px; padding: 14px; text-align: center;">
                <span style="color: #7f8c8d; font-size: 13px;">
                    القروض المنتهية: <strong>${data.closed_count}</strong> قرض
                    بإجمالي <strong style="color: #9b59b6;">${fmt_cur(data.closed_total)}</strong>
                </span>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function get_loan_status_badge(status, days_past_due) {
    let color, bg, label;
    let dpd = days_past_due || 0;

    if (dpd > 0) {
        color = '#e74c3c'; bg = '#fdedec';
        label = 'متأخر ' + dpd + ' يوم';
    } else if (status === 'Active' || status === 'Disbursed') {
        color = '#27ae60'; bg = '#eafaf1';
        label = 'نشط';
    } else if (status === 'Sanctioned') {
        color = '#3498db'; bg = '#ebf5fb';
        label = 'معتمد';
    } else if (status === 'Partially Disbursed') {
        color = '#e67e22'; bg = '#fef9e7';
        label = 'صرف جزئي';
    } else {
        color = '#7f8c8d'; bg = '#f2f3f4';
        label = status;
    }

    return `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:bold;border:1px solid ${color};">${label}</span>`;
}

function fmt_cur(value) {
    if (value === undefined || value === null) return '0.00';
    return frappe.format(value, {fieldtype: 'Currency'});
}
