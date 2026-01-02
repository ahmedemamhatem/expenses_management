frappe.ui.form.on("Customer", {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('كشف حساب العميل'), function() {
                // Show dialog to select date range
                let dialog = new frappe.ui.Dialog({
                    title: __('طباعة كشف حساب العميل'),
                    fields: [
                        {
                            fieldtype: 'Link',
                            fieldname: 'customer',
                            label: __('العميل'),
                            options: 'Customer',
                            default: frm.doc.name,
                            read_only: 1
                        },
                        {
                            fieldtype: 'Link',
                            fieldname: 'company',
                            label: __('الشركة'),
                            options: 'Company',
                            default: frappe.defaults.get_user_default('Company'),
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
