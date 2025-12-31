frappe.pages['customer-analysis-report'].on_page_load = function(wrapper) {
	new CustomerAnalysisReport(wrapper);
}

class CustomerAnalysisReport {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});

		this.filters = {
			company: frappe.defaults.get_user_default('Company'),
			branch: '',
			from_date: this.get_last_month_start(),
			to_date: this.get_last_month_end(),
			customer: '',
			pos_profile: ''
		};

		this.setup_page();
		this.render_content();
	}

	get_last_month_start() {
		let date = frappe.datetime.add_months(frappe.datetime.get_today(), -1);
		return frappe.datetime.month_start(date);
	}

	get_last_month_end() {
		let date = frappe.datetime.add_months(frappe.datetime.get_today(), -1);
		return frappe.datetime.month_end(date);
	}

	setup_page() {
		this.page.clear_actions();
		this.page.wrapper.find('.page-head').hide();

		if (!$('#floating-gear-btn').length) {
			$('body').append(`
				<button class="floating-gear-btn" id="floating-gear-btn" title="إعدادات التقرير">
					<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3"></circle>
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
					</svg>
				</button>
			`);
		}

		$('#floating-gear-btn').off('click').on('click', () => this.show_settings_dialog());
	}

	show_settings_dialog() {
		let me = this;

		if (this.settings_dialog) {
			this.settings_dialog.set_values(this.filters);
			this.settings_dialog.show();
			return;
		}

		this.settings_dialog = new frappe.ui.Dialog({
			title: 'إعدادات التقرير',
			fields: [
				{
					label: __('الشركة'),
					fieldname: 'company',
					fieldtype: 'Link',
					options: 'Company',
					default: me.filters.company,
					reqd: 1,
					change: function() {
						me.settings_dialog.set_value('branch', '');
						me.settings_dialog.set_value('pos_profile', '');
					}
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: __('الفرع'),
					fieldname: 'branch',
					fieldtype: 'Link',
					options: 'Branch',
					default: me.filters.branch
				},
				{
					fieldtype: 'Section Break'
				},
				{
					label: __('من تاريخ'),
					fieldname: 'from_date',
					fieldtype: 'Date',
					default: me.filters.from_date,
					reqd: 1
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: __('إلى تاريخ'),
					fieldname: 'to_date',
					fieldtype: 'Date',
					default: me.filters.to_date,
					reqd: 1
				},
				{
					fieldtype: 'Section Break'
				},
				{
					label: __('العميل'),
					fieldname: 'customer',
					fieldtype: 'Link',
					options: 'Customer',
					default: me.filters.customer
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: __('نقطة البيع'),
					fieldname: 'pos_profile',
					fieldtype: 'Link',
					options: 'POS Profile',
					default: me.filters.pos_profile,
					get_query: function() {
						let company = me.settings_dialog.get_value('company');
						return {
							filters: company ? { 'company': company } : {}
						};
					}
				}
			],
			size: 'large',
			primary_action_label: 'عرض التقرير',
			primary_action: function(values) {
				me.filters = values;
				me.settings_dialog.hide();
				me.generate_report();
			}
		});

		// Style the primary button to be larger
		this.settings_dialog.$wrapper.find('.btn-primary').css({
			'font-size': '18px',
			'padding': '14px 50px',
			'font-weight': '700',
			'border-radius': '10px',
			'background': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
			'border': 'none',
			'box-shadow': '0 4px 15px rgba(99, 102, 241, 0.4)'
		});

		this.settings_dialog.show();
	}

	get_preset_dates(preset) {
		const today = frappe.datetime.get_today();
		let from_date, to_date;

		switch(preset) {
			case 'today':
				from_date = to_date = today;
				break;
			case 'yesterday':
				from_date = to_date = frappe.datetime.add_days(today, -1);
				break;
			case 'this_week':
				from_date = frappe.datetime.week_start(today);
				to_date = frappe.datetime.week_end(today);
				break;
			case 'last_week':
				const last_week = frappe.datetime.add_days(today, -7);
				from_date = frappe.datetime.week_start(last_week);
				to_date = frappe.datetime.week_end(last_week);
				break;
			case 'this_month':
				from_date = frappe.datetime.month_start(today);
				to_date = frappe.datetime.month_end(today);
				break;
			case 'last_month':
				const last_month = frappe.datetime.add_months(today, -1);
				from_date = frappe.datetime.month_start(last_month);
				to_date = frappe.datetime.month_end(last_month);
				break;
			case 'this_quarter':
				from_date = frappe.datetime.quarter_start(today);
				to_date = frappe.datetime.quarter_end(today);
				break;
			case 'this_year':
				from_date = frappe.datetime.year_start(today);
				to_date = frappe.datetime.year_end(today);
				break;
			default:
				from_date = to_date = today;
		}

		return { from_date, to_date };
	}

	get_filters() {
		return this.filters;
	}

	render_content() {
		this.page.main.html(`
			<style>
				/* ===== FLOATING GEAR BUTTON ===== */
				.floating-gear-btn {
					position: fixed;
					bottom: 24px;
					right: 24px;
					z-index: 9999;
					width: 52px;
					height: 52px;
					border-radius: 14px;
					border: none;
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
					transition: all 0.3s ease;
				}

				.floating-gear-btn:hover {
					transform: rotate(90deg) scale(1.05);
					box-shadow: 0 6px 28px rgba(99, 102, 241, 0.5);
				}


				/* ===== MAIN REPORT ===== */
				.customer-analysis-report {
					direction: rtl;
					font-family: 'Segoe UI', Tahoma, sans-serif;
					min-height: 100vh;
					padding: 16px;
				}

				#report-content {
					width: 100%;
				}

				/* ===== CUSTOMER CARD ===== */
				.customer-card {
					background: #fff;
					border-radius: 16px;
					margin-bottom: 24px;
					box-shadow: 0 4px 20px rgba(0,0,0,0.08);
					overflow: hidden;
					border: none;
				}

				.customer-card-header {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					padding: 20px 24px;
					display: flex;
					justify-content: space-between;
					align-items: center;
					color: #fff;
				}

				.customer-main-info {
					display: flex;
					align-items: center;
					gap: 16px;
				}

				.customer-code {
					font-size: 12px;
					background: rgba(255,255,255,0.25);
					padding: 6px 14px;
					border-radius: 20px;
					font-weight: 700;
					letter-spacing: 0.5px;
				}

				.customer-name {
					font-size: 20px;
					font-weight: 800;
					text-shadow: 0 2px 4px rgba(0,0,0,0.1);
				}

				.customer-stats {
					display: flex;
					gap: 12px;
				}

				.stat-box {
					text-align: center;
					background: rgba(255,255,255,0.2);
					padding: 10px 20px;
					border-radius: 12px;
					backdrop-filter: blur(10px);
				}

				.stat-val {
					font-size: 22px;
					font-weight: 900;
				}

				.stat-lbl {
					font-size: 11px;
					opacity: 0.95;
					font-weight: 600;
				}

				/* ===== METRICS ROW ===== */
				.metrics-row {
					display: grid;
					grid-template-columns: repeat(6, 1fr);
					gap: 12px;
					padding: 16px 20px;
					background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
				}

				.metric-box {
					background: #fff;
					border-radius: 12px;
					padding: 16px 12px;
					text-align: center;
					box-shadow: 0 2px 8px rgba(0,0,0,0.04);
					border: 2px solid transparent;
					transition: all 0.2s ease;
				}

				.metric-box:nth-child(1) { border-color: #e0e7ff; background: linear-gradient(135deg, #eef2ff 0%, #fff 100%); }
				.metric-box:nth-child(2) { border-color: #dbeafe; background: linear-gradient(135deg, #eff6ff 0%, #fff 100%); }
				.metric-box:nth-child(3) { border-color: #d1fae5; background: linear-gradient(135deg, #ecfdf5 0%, #fff 100%); }
				.metric-box:nth-child(4) { border-color: #fee2e2; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%); }
				.metric-box:nth-child(5) { border-color: #d1fae5; background: linear-gradient(135deg, #ecfdf5 0%, #fff 100%); }
				.metric-box:nth-child(6) { border-color: #fef3c7; background: linear-gradient(135deg, #fffbeb 0%, #fff 100%); }

				.metric-box:hover {
					transform: translateY(-2px);
					box-shadow: 0 4px 12px rgba(0,0,0,0.08);
				}

				.metric-lbl {
					font-size: 13px;
					font-weight: 800;
					margin-bottom: 8px;
				}

				.metric-box:nth-child(1) .metric-lbl { color: #4f46e5; }
				.metric-box:nth-child(2) .metric-lbl { color: #2563eb; }
				.metric-box:nth-child(3) .metric-lbl { color: #059669; }
				.metric-box:nth-child(4) .metric-lbl { color: #dc2626; }
				.metric-box:nth-child(5) .metric-lbl { color: #047857; }
				.metric-box:nth-child(6) .metric-lbl { color: #b45309; }

				.metric-val {
					font-size: 18px;
					font-weight: 900;
				}

				.metric-box:nth-child(1) .metric-val { color: #4f46e5; }
				.metric-box:nth-child(2) .metric-val { color: #2563eb; }
				.metric-box:nth-child(3) .metric-val { color: #059669; }
				.metric-box:nth-child(4) .metric-val { color: #dc2626; }
				.metric-box:nth-child(5) .metric-val { color: #047857; }
				.metric-box:nth-child(6) .metric-val { color: #b45309; }

				.metric-val.pos { color: #059669 !important; }
				.metric-val.neg { color: #dc2626 !important; }

				/* ===== ITEMS TABLE ===== */
				.items-wrapper {
					border-top: 3px solid #e5e7eb;
					margin-top: 4px;
				}

				.items-toggle {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 14px 24px;
					cursor: pointer;
					background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
					transition: all 0.3s ease;
				}

				.items-toggle:hover {
					background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
				}

				.items-toggle.open {
					background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
					color: #fff;
				}

				.items-toggle.open .toggle-icon {
					transform: rotate(180deg);
				}

				.items-toggle.open .items-badge {
					background: #10b981;
				}

				.items-title {
					font-size: 15px;
					font-weight: 800;
					display: flex;
					align-items: center;
					gap: 12px;
				}

				.items-badge {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					padding: 5px 16px;
					border-radius: 20px;
					font-size: 14px;
					font-weight: 800;
				}

				.toggle-icon {
					transition: transform 0.3s ease;
					font-size: 16px;
					font-weight: bold;
				}

				.items-panel {
					display: none;
					background: #fff;
				}

				.items-panel.show {
					display: block;
				}

				.items-scroll {
					max-height: 400px;
					overflow-y: auto;
					overflow-x: auto;
				}

				.items-scroll::-webkit-scrollbar {
					width: 8px;
					height: 8px;
				}

				.items-scroll::-webkit-scrollbar-track {
					background: #f1f5f9;
					border-radius: 4px;
				}

				.items-scroll::-webkit-scrollbar-thumb {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					border-radius: 4px;
				}

				.items-scroll::-webkit-scrollbar-thumb:hover {
					background: linear-gradient(135deg, #4f46e5, #7c3aed);
				}

				.items-tbl {
					width: 100%;
					border-collapse: collapse;
					font-size: 13px;
				}

				.items-tbl th {
					background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
					color: #fff;
					font-weight: 800;
					padding: 16px 12px;
					text-align: center;
					font-size: 13px;
					text-transform: uppercase;
					letter-spacing: 1px;
					position: sticky;
					top: 0;
					z-index: 10;
					border-bottom: 3px solid #6366f1;
				}

				.items-tbl td {
					padding: 14px 10px;
					text-align: center;
					border-bottom: 1px solid #e5e7eb;
					font-weight: 700;
					color: #1e293b;
					font-size: 13px;
				}

				.items-tbl tbody tr {
					transition: all 0.2s ease;
				}

				.items-tbl tbody tr:nth-child(even) {
					background: #f8fafc;
				}

				.items-tbl tbody tr:hover {
					background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%);
				}

				.inv-link {
					color: #fff;
					font-weight: 800;
					text-decoration: none;
					font-size: 12px;
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					padding: 6px 14px;
					border-radius: 6px;
					display: inline-block;
					transition: all 0.2s ease;
				}

				.inv-link:hover {
					transform: scale(1.05);
					box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
				}

				.item-code {
					color: #4f46e5;
					font-weight: 900;
					font-size: 13px;
				}

				.item-name {
					color: #1e293b;
					font-size: 12px;
					font-weight: 700;
					margin-top: 2px;
				}

				.qty-cell {
					display: flex;
					flex-direction: column;
					gap: 2px;
				}

				.qty-main {
					font-weight: 900;
					color: #1e293b;
					font-size: 14px;
				}

				.qty-uom {
					font-size: 11px;
					color: #64748b;
					font-weight: 600;
				}

				.rate-cell {
					display: flex;
					flex-direction: column;
					gap: 4px;
					align-items: center;
				}

				.rate-invoice {
					background: linear-gradient(135deg, #dbeafe, #bfdbfe);
					color: #1e40af;
					padding: 5px 12px;
					border-radius: 6px;
					font-weight: 900;
					font-size: 12px;
				}

				.rate-ton {
					background: linear-gradient(135deg, #fef3c7, #fde68a);
					color: #b45309;
					padding: 5px 12px;
					border-radius: 6px;
					font-weight: 900;
					font-size: 12px;
				}

				.weight-cell {
					font-weight: 900;
					color: #7c3aed;
					font-size: 13px;
				}

				.amount-cell {
					font-weight: 900;
					color: #1e293b;
					font-size: 14px;
				}

				.cost-cell {
					font-weight: 900;
					color: #dc2626;
					font-size: 14px;
				}

				.stock-cell {
					display: flex;
					align-items: center;
					justify-content: center;
					gap: 8px;
				}

				.stock-dot {
					width: 12px;
					height: 12px;
					border-radius: 50%;
					box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				}

				.stock-dot.hi { background: linear-gradient(135deg, #10b981, #059669); }
				.stock-dot.md { background: linear-gradient(135deg, #f59e0b, #d97706); }
				.stock-dot.lo { background: linear-gradient(135deg, #ef4444, #dc2626); }

				.stock-val {
					font-weight: 900;
					color: #1e293b;
					font-size: 13px;
				}

				.val-pos { color: #059669 !important; font-weight: 900; }
				.val-neg { color: #dc2626 !important; font-weight: 900; }

				/* ===== EMPTY & LOADING ===== */
				.empty-box {
					text-align: center;
					padding: 80px 20px;
				}

				.empty-box h4 {
					font-size: 22px;
					font-weight: 700;
					color: #6366f1;
					margin-bottom: 8px;
				}

				.empty-box p {
					color: #9ca3af;
					font-size: 14px;
				}

				.loading-box {
					display: flex;
					align-items: center;
					justify-content: center;
					padding: 100px;
					flex-direction: column;
					gap: 20px;
				}

				.spinner {
					width: 40px;
					height: 40px;
					border: 3px solid #e0e7ff;
					border-top: 3px solid #6366f1;
					border-radius: 50%;
					animation: spin 0.7s linear infinite;
				}

				@keyframes spin {
					to { transform: rotate(360deg); }
				}

				.loading-txt {
					color: #6b7280;
					font-size: 14px;
					font-weight: 600;
				}

				/* ===== RESPONSIVE ===== */
				@media (max-width: 1200px) {
					.metrics-row { grid-template-columns: repeat(3, 1fr); }
				}

				@media (max-width: 768px) {
					.metrics-row { grid-template-columns: repeat(2, 1fr); }
					.customer-card-header { flex-direction: column; gap: 10px; }
					.customer-stats { flex-wrap: wrap; justify-content: center; }
				}

				@media (max-width: 480px) {
					.metrics-row { grid-template-columns: 1fr 1fr; }
				}

				/* ===== PRINT ===== */
				@media print {
					.floating-gear-btn { display: none !important; }
					.items-panel { display: block !important; }
				}
			</style>
			<div class="customer-analysis-report">
				<div id="report-content">
					<div class="empty-box">
						<h4>تقرير تحليل العملاء</h4>
						<p>اضغط على زر الإعدادات لتحديد معايير البحث</p>
					</div>
				</div>
			</div>
		`);
	}

	generate_report() {
		const filters = this.get_filters();

		if (!filters.company) {
			frappe.msgprint({ title: __('خطأ'), indicator: 'red', message: __('الرجاء اختيار الشركة') });
			this.show_settings_dialog();
			return;
		}

		if (!filters.from_date || !filters.to_date) {
			frappe.msgprint({ title: __('خطأ'), indicator: 'red', message: __('الرجاء تحديد الفترة الزمنية') });
			this.show_settings_dialog();
			return;
		}

		$('#report-content').html(`
			<div class="loading-box">
				<div class="spinner"></div>
				<div class="loading-txt">جاري تحميل البيانات...</div>
			</div>
		`);

		frappe.call({
			method: 'expenses_management.expenses_management.page.customer_analysis_report.customer_analysis_report.get_report_data',
			args: filters,
			callback: (r) => {
				if (r.message && r.message.customers && r.message.customers.length > 0) {
					this.render_report(r.message);
				} else {
					$('#report-content').html(`
						<div class="empty-box">
							<h4>لا توجد بيانات</h4>
							<p>لا يوجد عملاء للفلاتر المحددة</p>
						</div>
					`);
				}
			},
			error: () => {
				$('#report-content').html(`
					<div class="empty-box">
						<h4>خطأ في تحميل البيانات</h4>
						<p>يرجى المحاولة مرة أخرى</p>
					</div>
				`);
			}
		});
	}

	render_report(data) {
		// Sort customers by purchase amount in period (descending)
		let sortedCustomers = data.customers.sort((a, b) => {
			return (b.total_purchase_period || 0) - (a.total_purchase_period || 0);
		});

		let html = '';
		sortedCustomers.forEach((c) => {
			html += this.render_customer_card(c);
		});

		$('#report-content').html(html);

		$('.items-toggle').off('click').on('click', function() {
			$(this).toggleClass('open');
			$(this).next('.items-panel').toggleClass('show');
		});
	}

	render_customer_card(c) {
		return `
			<div class="customer-card">
				<div class="customer-card-header">
					<div class="customer-main-info">
						<span class="customer-code">${c.customer || ''}</span>
						<span class="customer-name">${c.customer_name || ''}</span>
					</div>
					<div class="customer-stats">
						<div class="stat-box">
							<div class="stat-val">${c.invoice_count_all_time || 0}</div>
							<div class="stat-lbl">فواتير كلي</div>
						</div>
						<div class="stat-box">
							<div class="stat-val">${c.invoice_count_period || 0}</div>
							<div class="stat-lbl">فواتير الفترة</div>
						</div>
					</div>
				</div>

				<div class="metrics-row">
					<div class="metric-box">
						<div class="metric-lbl">إجمالي المشتريات</div>
						<div class="metric-val">${this.fmt(c.total_purchase_all_time)}</div>
					</div>
					<div class="metric-box">
						<div class="metric-lbl">مشتريات الفترة</div>
						<div class="metric-val">${this.fmt(c.total_purchase_period)}</div>
					</div>
					<div class="metric-box">
						<div class="metric-lbl">الرصيد</div>
						<div class="metric-val">${this.fmt(c.total_balance)}</div>
					</div>
					<div class="metric-box">
						<div class="metric-lbl">المستحق</div>
						<div class="metric-val ${(c.total_due || 0) > 0 ? 'neg' : ''}">${this.fmt(c.total_due)}</div>
					</div>
					<div class="metric-box">
						<div class="metric-lbl">أرباح كلي</div>
						<div class="metric-val ${(c.revenue_all_time || 0) >= 0 ? 'pos' : 'neg'}">${this.fmt(c.revenue_all_time)}</div>
					</div>
					<div class="metric-box">
						<div class="metric-lbl">أرباح الفترة</div>
						<div class="metric-val ${(c.revenue_period || 0) >= 0 ? 'pos' : 'neg'}">${this.fmt(c.revenue_period)}</div>
					</div>
				</div>

				<div class="items-wrapper">
					<div class="items-toggle">
						<div class="items-title">
							الأصناف المباعة
							<span class="items-badge">${(c.items || []).length}</span>
						</div>
						<i class="fa fa-chevron-down toggle-icon"></i>
					</div>
					<div class="items-panel">
						${this.render_items_table(c.items)}
					</div>
				</div>
			</div>
		`;
	}

	render_items_table(items) {
		if (!items || items.length === 0) {
			return `<div class="empty-box" style="padding:30px;"><p>لا توجد أصناف</p></div>`;
		}

		let rows = items.map(i => {
			const stk = (i.current_stock || 0) > 100 ? 'hi' : ((i.current_stock || 0) > 20 ? 'md' : 'lo');
			const revCls = (i.revenue || 0) >= 0 ? 'val-pos' : 'val-neg';
			const invoiceRate = i.total_amount && i.qty ? (i.total_amount / i.qty) : 0;

			return `
				<tr>
					<td><a href="/app/sales-invoice/${i.invoice_id}" class="inv-link" target="_blank">${i.invoice_id || ''}</a></td>
					<td>
						<div class="item-code">${i.item_code || ''}</div>
						<div class="item-name">${i.item_name || ''}</div>
					</td>
					<td>
						<div class="qty-cell">
							<span class="qty-main">${this.num(i.qty, 2)}</span>
							<span class="qty-uom">${i.invoice_uom || ''}</span>
						</div>
					</td>
					<td class="weight-cell">${this.num(i.weight_in_tons, 3)} طن</td>
					<td>
						<div class="rate-cell">
							<span class="rate-invoice">${this.fmt(invoiceRate)}/${i.invoice_uom || ''}</span>
							<span class="rate-ton">${this.fmt(i.rate_per_ton)}/طن</span>
						</div>
					</td>
					<td class="amount-cell">${this.fmt(i.total_amount)}</td>
					<td class="cost-cell">${this.fmt(i.cost_of_goods)}</td>
					<td class="${revCls}">${this.fmt(i.revenue)}</td>
					<td>
						<div class="stock-cell">
							<span class="stock-dot ${stk}"></span>
							<span class="stock-val">${this.num(i.current_stock, 0)}</span>
						</div>
					</td>
				</tr>
			`;
		}).join('');

		return `
			<div class="items-scroll">
				<table class="items-tbl">
					<thead>
						<tr>
							<th>الفاتورة</th>
							<th>الصنف</th>
							<th>الكمية</th>
							<th>الوزن</th>
							<th>السعر</th>
							<th>المبلغ</th>
							<th>التكلفة</th>
							<th>الربح</th>
							<th>المخزون</th>
						</tr>
					</thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
		`;
	}

	print_report() {
		window.print();
	}

	export_report() {
		frappe.msgprint({ title: __('تصدير'), indicator: 'blue', message: __('جاري تصدير التقرير...') });
	}

	fmt(v) {
		if (v === null || v === undefined) v = 0;
		return parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	num(v, p) {
		if (v === null || v === undefined) v = 0;
		return parseFloat(v).toFixed(p || 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}
}
