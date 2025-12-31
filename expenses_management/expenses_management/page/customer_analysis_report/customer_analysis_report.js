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
			pos_profile: '',
			customer_group: '',
			territory: '',
			sales_person: '',
			sort_by: 'total_purchase_period',
			sort_order: 'desc'
		};

		this.report_data = null;

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
			title: '<i class="fa fa-filter"></i> إعدادات التقرير',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'date_presets_html',
					options: `
						<div class="filter-presets">
							<div class="preset-label"><i class="fa fa-clock-o"></i> اختيار سريع للتاريخ:</div>
							<div class="preset-buttons">
								<button type="button" class="preset-btn" data-preset="today">اليوم</button>
								<button type="button" class="preset-btn" data-preset="yesterday">أمس</button>
								<button type="button" class="preset-btn" data-preset="this_week">هذا الأسبوع</button>
								<button type="button" class="preset-btn" data-preset="last_week">الأسبوع الماضي</button>
								<button type="button" class="preset-btn" data-preset="this_month">هذا الشهر</button>
								<button type="button" class="preset-btn" data-preset="last_month">الشهر الماضي</button>
								<button type="button" class="preset-btn" data-preset="this_quarter">هذا الربع</button>
								<button type="button" class="preset-btn" data-preset="this_year">هذه السنة</button>
							</div>
						</div>
					`
				},
				{
					fieldtype: 'Section Break',
					label: '<i class="fa fa-building"></i> بيانات الشركة'
				},
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
					fieldtype: 'Section Break',
					label: '<i class="fa fa-calendar"></i> الفترة الزمنية'
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
					fieldtype: 'Section Break',
					label: '<i class="fa fa-filter"></i> فلاتر إضافية'
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
				},
				{
					fieldtype: 'Section Break',
					label: '<i class="fa fa-users"></i> فلاتر متقدمة'
				},
				{
					label: __('مجموعة العملاء'),
					fieldname: 'customer_group',
					fieldtype: 'Link',
					options: 'Customer Group',
					default: me.filters.customer_group
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: __('المنطقة'),
					fieldname: 'territory',
					fieldtype: 'Link',
					options: 'Territory',
					default: me.filters.territory
				},
				{
					fieldtype: 'Section Break'
				},
				{
					label: __('مندوب المبيعات'),
					fieldname: 'sales_person',
					fieldtype: 'Link',
					options: 'Sales Person',
					default: me.filters.sales_person
				},
				{
					fieldtype: 'Column Break'
				},
				{
					label: __('ترتيب حسب'),
					fieldname: 'sort_by',
					fieldtype: 'Select',
					options: [
						{ value: 'total_purchase_period', label: 'المشتريات في الفترة' },
						{ value: 'total_purchase_all_time', label: 'إجمالي المشتريات' },
						{ value: 'revenue_period', label: 'أرباح الفترة' },
						{ value: 'total_balance', label: 'الرصيد' },
						{ value: 'total_due', label: 'المستحق' },
						{ value: 'invoice_count_period', label: 'عدد الفواتير' },
						{ value: 'customer_name', label: 'اسم العميل' }
					],
					default: me.filters.sort_by
				}
			],
			size: 'large',
			primary_action_label: '<i class="fa fa-search"></i> عرض التقرير',
			primary_action: function(values) {
				me.filters = values;
				me.settings_dialog.hide();
				me.generate_report();
			}
		});

		// Add custom styles for the dialog
		this.settings_dialog.$wrapper.find('.modal-content').css({
			'border-radius': '16px',
			'overflow': 'hidden',
			'box-shadow': '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
		});

		this.settings_dialog.$wrapper.find('.modal-header').css({
			'background': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
			'color': '#fff',
			'border-bottom': 'none',
			'padding': '20px 24px'
		});

		this.settings_dialog.$wrapper.find('.modal-title').css({
			'font-size': '20px',
			'font-weight': '800'
		});

		this.settings_dialog.$wrapper.find('.btn-modal-close').css({
			'color': '#fff',
			'opacity': '0.8'
		});

		this.settings_dialog.$wrapper.find('.modal-body').css({
			'padding': '24px',
			'background': '#f8fafc'
		});

		this.settings_dialog.$wrapper.find('.section-head').css({
			'font-size': '14px',
			'font-weight': '700',
			'color': '#4f46e5',
			'margin-bottom': '16px',
			'padding-bottom': '8px',
			'border-bottom': '2px solid #e0e7ff'
		});

		this.settings_dialog.$wrapper.find('.frappe-control').css({
			'margin-bottom': '12px'
		});

		this.settings_dialog.$wrapper.find('.form-control').css({
			'border-radius': '8px',
			'border': '2px solid #e2e8f0',
			'padding': '10px 14px',
			'font-size': '14px',
			'transition': 'all 0.2s ease'
		});

		// Style the primary button
		this.settings_dialog.$wrapper.find('.btn-primary').css({
			'font-size': '18px',
			'padding': '14px 50px',
			'font-weight': '700',
			'border-radius': '10px',
			'background': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
			'border': 'none',
			'box-shadow': '0 4px 15px rgba(99, 102, 241, 0.4)'
		});

		// Add preset button styles
		const presetStyles = `
			<style>
				.filter-presets {
					background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%);
					border-radius: 12px;
					padding: 16px;
					margin-bottom: 8px;
					border: 2px solid #e0e7ff;
				}
				.preset-label {
					font-size: 13px;
					font-weight: 700;
					color: #4f46e5;
					margin-bottom: 12px;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				.preset-buttons {
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
				}
				.preset-btn {
					background: #fff;
					border: 2px solid #c7d2fe;
					color: #4f46e5;
					padding: 8px 16px;
					border-radius: 8px;
					font-size: 13px;
					font-weight: 600;
					cursor: pointer;
					transition: all 0.2s ease;
				}
				.preset-btn:hover {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					border-color: #6366f1;
					transform: translateY(-2px);
					box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
				}
				.preset-btn.active {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					border-color: #6366f1;
				}
			</style>
		`;
		this.settings_dialog.$wrapper.find('.modal-content').prepend(presetStyles);

		// Add click handlers for preset buttons
		this.settings_dialog.$wrapper.find('.preset-btn').on('click', (e) => {
			const preset = $(e.target).data('preset');
			const dates = this.get_preset_dates(preset);
			if (dates) {
				this.settings_dialog.set_value('from_date', dates.from_date);
				this.settings_dialog.set_value('to_date', dates.to_date);
				// Highlight active button
				this.settings_dialog.$wrapper.find('.preset-btn').removeClass('active');
				$(e.target).addClass('active');
			}
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

				/* ===== EXPORT BUTTONS ===== */
				.export-buttons {
					position: fixed;
					bottom: 90px;
					right: 24px;
					z-index: 9998;
					display: flex;
					flex-direction: column;
					gap: 10px;
				}

				.export-btn {
					width: 44px;
					height: 44px;
					border-radius: 12px;
					border: none;
					color: #fff;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
					transition: all 0.3s ease;
					font-size: 18px;
				}

				.export-btn:hover {
					transform: scale(1.1);
				}

				.export-btn.excel { background: linear-gradient(135deg, #059669, #10b981); }
				.export-btn.pdf { background: linear-gradient(135deg, #dc2626, #ef4444); }
				.export-btn.print { background: linear-gradient(135deg, #2563eb, #3b82f6); }

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

				/* ===== CEO DASHBOARD HEADER ===== */
				.ceo-dashboard-header {
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					border-radius: 20px;
					padding: 24px;
					margin-bottom: 24px;
					color: #fff;
					box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
				}

				.dashboard-title-row {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 24px;
					padding-bottom: 16px;
					border-bottom: 2px solid rgba(255, 255, 255, 0.1);
				}

				.dashboard-title {
					font-size: 28px;
					font-weight: 900;
					display: flex;
					align-items: center;
					gap: 12px;
				}

				.dashboard-title i {
					color: #fbbf24;
					font-size: 32px;
				}

				.dashboard-period {
					background: rgba(99, 102, 241, 0.3);
					padding: 12px 24px;
					border-radius: 12px;
					font-size: 14px;
					font-weight: 600;
					display: flex;
					align-items: center;
					gap: 10px;
				}

				.dashboard-period i {
					color: #a5b4fc;
				}

				/* ===== KPI CARDS ===== */
				.kpi-cards {
					display: grid;
					grid-template-columns: repeat(6, 1fr);
					gap: 16px;
					margin-bottom: 24px;
				}

				.kpi-card {
					background: rgba(255, 255, 255, 0.08);
					border-radius: 16px;
					padding: 20px;
					text-align: center;
					border: 2px solid rgba(255, 255, 255, 0.1);
					transition: all 0.3s ease;
					position: relative;
					overflow: hidden;
				}

				.kpi-card::before {
					content: '';
					position: absolute;
					top: 0;
					left: 0;
					right: 0;
					height: 4px;
				}

				.kpi-card.customers::before { background: linear-gradient(90deg, #6366f1, #8b5cf6); }
				.kpi-card.invoices::before { background: linear-gradient(90deg, #2563eb, #3b82f6); }
				.kpi-card.sales::before { background: linear-gradient(90deg, #059669, #10b981); }
				.kpi-card.profit::before { background: linear-gradient(90deg, #16a34a, #22c55e); }
				.kpi-card.avg::before { background: linear-gradient(90deg, #d97706, #f59e0b); }
				.kpi-card.margin::before { background: linear-gradient(90deg, #dc2626, #ef4444); }

				.kpi-card:hover {
					transform: translateY(-4px);
					background: rgba(255, 255, 255, 0.12);
				}

				.kpi-icon {
					font-size: 28px;
					margin-bottom: 12px;
					opacity: 0.9;
				}

				.kpi-card.customers .kpi-icon { color: #a5b4fc; }
				.kpi-card.invoices .kpi-icon { color: #93c5fd; }
				.kpi-card.sales .kpi-icon { color: #6ee7b7; }
				.kpi-card.profit .kpi-icon { color: #86efac; }
				.kpi-card.avg .kpi-icon { color: #fcd34d; }
				.kpi-card.margin .kpi-icon { color: #fca5a5; }

				.kpi-value {
					font-size: 26px;
					font-weight: 900;
					margin-bottom: 6px;
				}

				.kpi-label {
					font-size: 12px;
					color: #94a3b8;
					font-weight: 600;
					margin-bottom: 10px;
				}

				.kpi-growth {
					display: inline-flex;
					align-items: center;
					gap: 4px;
					padding: 4px 10px;
					border-radius: 20px;
					font-size: 11px;
					font-weight: 700;
				}

				.kpi-growth.positive {
					background: rgba(16, 185, 129, 0.2);
					color: #10b981;
				}

				.kpi-growth.negative {
					background: rgba(239, 68, 68, 0.2);
					color: #ef4444;
				}

				/* ===== CHARTS SECTION ===== */
				.charts-section {
					display: grid;
					grid-template-columns: 2fr 1fr;
					gap: 20px;
					margin-bottom: 24px;
				}

				.chart-card {
					background: #fff;
					border-radius: 16px;
					padding: 20px;
					box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
				}

				.chart-title {
					font-size: 16px;
					font-weight: 800;
					color: #1e293b;
					margin-bottom: 16px;
					display: flex;
					align-items: center;
					gap: 10px;
				}

				.chart-title i {
					color: #6366f1;
				}

				.chart-container {
					height: 280px;
				}

				/* ===== ALERTS SECTION ===== */
				.alerts-section {
					background: #fff;
					border-radius: 16px;
					padding: 20px;
					margin-bottom: 24px;
					box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
				}

				.alerts-title {
					font-size: 18px;
					font-weight: 800;
					color: #1e293b;
					margin-bottom: 16px;
					display: flex;
					align-items: center;
					gap: 10px;
				}

				.alerts-title i {
					color: #f59e0b;
				}

				.alerts-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
					gap: 16px;
				}

				.alert-card {
					padding: 16px;
					border-radius: 12px;
					border-right: 5px solid;
					display: flex;
					gap: 14px;
					align-items: flex-start;
				}

				.alert-card.warning {
					background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
					border-color: #f59e0b;
				}

				.alert-card.danger {
					background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
					border-color: #ef4444;
				}

				.alert-card.success {
					background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
					border-color: #10b981;
				}

				.alert-card.info {
					background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
					border-color: #3b82f6;
				}

				.alert-card.primary {
					background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
					border-color: #6366f1;
				}

				.alert-icon {
					width: 40px;
					height: 40px;
					border-radius: 10px;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 18px;
					flex-shrink: 0;
				}

				.alert-card.warning .alert-icon { background: #f59e0b; color: #fff; }
				.alert-card.danger .alert-icon { background: #ef4444; color: #fff; }
				.alert-card.success .alert-icon { background: #10b981; color: #fff; }
				.alert-card.info .alert-icon { background: #3b82f6; color: #fff; }
				.alert-card.primary .alert-icon { background: #6366f1; color: #fff; }

				.alert-content {
					flex: 1;
				}

				.alert-card-title {
					font-size: 14px;
					font-weight: 800;
					margin-bottom: 4px;
				}

				.alert-card.warning .alert-card-title { color: #b45309; }
				.alert-card.danger .alert-card-title { color: #dc2626; }
				.alert-card.success .alert-card-title { color: #059669; }
				.alert-card.info .alert-card-title { color: #2563eb; }
				.alert-card.primary .alert-card-title { color: #4f46e5; }

				.alert-message {
					font-size: 13px;
					color: #64748b;
					line-height: 1.5;
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

				/* ===== CUSTOMER CATEGORY TAG ===== */
				.customer-category {
					background: linear-gradient(135deg, #fbbf24, #f59e0b);
					color: #78350f;
					padding: 6px 14px;
					border-radius: 20px;
					font-size: 12px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 6px;
					box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
				}

				.customer-category i {
					font-size: 11px;
				}

				/* ===== CUSTOMER INFO BAR ===== */
				.customer-info-bar {
					display: flex;
					flex-wrap: wrap;
					gap: 20px;
					padding: 14px 24px;
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					border-bottom: 3px solid #6366f1;
				}

				.info-item {
					display: flex;
					align-items: center;
					gap: 8px;
					color: #94a3b8;
					font-size: 13px;
				}

				.info-item i {
					color: #6366f1;
					font-size: 14px;
				}

				.info-item .info-label {
					font-weight: 600;
				}

				.info-item .info-value {
					color: #fff;
					font-weight: 800;
				}

				.info-item .info-amount {
					color: #10b981;
					font-weight: 800;
					font-size: 12px;
				}

				.info-item.highlight {
					background: rgba(99, 102, 241, 0.2);
					padding: 8px 16px;
					border-radius: 8px;
					border: 1px solid rgba(99, 102, 241, 0.3);
				}

				.info-item.highlight i {
					color: #fbbf24;
				}

				.info-item.highlight .info-value {
					color: #fbbf24;
				}

				/* Last Invoice Styling */
				.info-item.last-inv {
					background: rgba(16, 185, 129, 0.15);
					padding: 8px 16px;
					border-radius: 8px;
					border: 1px solid rgba(16, 185, 129, 0.3);
				}

				.info-item.last-inv i {
					color: #10b981;
				}

				.info-item.last-inv .info-value {
					color: #10b981;
					font-size: 15px;
				}

				.info-profit {
					display: flex;
					align-items: center;
					gap: 4px;
					padding: 4px 10px;
					border-radius: 6px;
					font-size: 12px;
					font-weight: 800;
				}

				.info-profit.profit-pos {
					background: rgba(16, 185, 129, 0.3);
					color: #10b981;
				}

				.info-profit.profit-neg {
					background: rgba(239, 68, 68, 0.3);
					color: #ef4444;
				}

				.info-profit i {
					font-size: 10px;
				}

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
				@media (max-width: 1400px) {
					.kpi-cards { grid-template-columns: repeat(3, 1fr); }
					.charts-section { grid-template-columns: 1fr; }
				}

				@media (max-width: 1200px) {
					.metrics-row { grid-template-columns: repeat(3, 1fr); }
					.customer-info-bar { justify-content: center; }
				}

				@media (max-width: 768px) {
					.kpi-cards { grid-template-columns: repeat(2, 1fr); }
					.metrics-row { grid-template-columns: repeat(2, 1fr); }
					.customer-card-header { flex-direction: column; gap: 10px; }
					.customer-stats { flex-wrap: wrap; justify-content: center; }
					.customer-main-info { flex-direction: column; text-align: center; }
					.customer-info-bar { flex-direction: column; gap: 12px; align-items: flex-start; }
					.dashboard-title-row { flex-direction: column; gap: 16px; }
				}

				@media (max-width: 480px) {
					.kpi-cards { grid-template-columns: 1fr; }
					.metrics-row { grid-template-columns: 1fr 1fr; }
					.info-item { font-size: 12px; }
				}

				/* ===== PRINT ===== */
				@media print {
					.floating-gear-btn, .export-buttons { display: none !important; }
					.items-panel { display: block !important; }
					.customer-info-bar { background: #f8fafc !important; color: #1e293b !important; }
					.info-item, .info-item .info-label { color: #1e293b !important; }
					.ceo-dashboard-header { background: #f1f5f9 !important; color: #1e293b !important; }
					.kpi-card { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; }
					.chart-card { page-break-inside: avoid; }
					.customer-card { page-break-inside: avoid; }
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
					this.report_data = r.message;
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
		// Sort customers based on selected sort option
		let sortedCustomers = this.sort_customers(data.customers);

		let html = '';

		// Add CEO Dashboard Header
		html += this.render_ceo_dashboard(data);

		// Add Charts Section
		html += this.render_charts_section(data);

		// Add Alerts Section
		html += this.render_alerts_section(data.alerts || []);

		// Add Export Buttons
		html += this.render_export_buttons();

		// Add Customer Cards
		sortedCustomers.forEach((c) => {
			html += this.render_customer_card(c);
		});

		$('#report-content').html(html);

		// Initialize event handlers
		this.init_event_handlers();

		// Render charts after DOM is ready
		setTimeout(() => {
			this.render_sales_trend_chart(data.daily_sales_trend || []);
			this.render_item_groups_chart(data.top_item_groups || []);
		}, 100);
	}

	sort_customers(customers) {
		const sort_by = this.filters.sort_by || 'total_purchase_period';
		const sort_order = this.filters.sort_order || 'desc';

		return customers.sort((a, b) => {
			let valA = a[sort_by] || 0;
			let valB = b[sort_by] || 0;

			if (sort_by === 'customer_name') {
				valA = a.customer_name || '';
				valB = b.customer_name || '';
				return sort_order === 'desc' ? valB.localeCompare(valA, 'ar') : valA.localeCompare(valB, 'ar');
			}

			return sort_order === 'desc' ? valB - valA : valA - valB;
		});
	}

	render_ceo_dashboard(data) {
		const summary = data.summary || {};
		const growth = data.growth || {};
		const filters = data.filters || {};

		return `
			<div class="ceo-dashboard-header">
				<div class="dashboard-title-row">
					<div class="dashboard-title">
						<i class="fa fa-dashboard"></i>
						لوحة تحكم المدير التنفيذي
					</div>
					<div class="dashboard-period">
						<i class="fa fa-calendar"></i>
						${filters.from_date || ''} - ${filters.to_date || ''}
					</div>
				</div>

				<div class="kpi-cards">
					<div class="kpi-card customers">
						<div class="kpi-icon"><i class="fa fa-users"></i></div>
						<div class="kpi-value">${summary.total_customers || 0}</div>
						<div class="kpi-label">إجمالي العملاء</div>
						${this.render_growth_badge(growth.total_customers)}
					</div>

					<div class="kpi-card invoices">
						<div class="kpi-icon"><i class="fa fa-file-text"></i></div>
						<div class="kpi-value">${summary.total_invoices || 0}</div>
						<div class="kpi-label">عدد الفواتير</div>
						${this.render_growth_badge(growth.total_invoices)}
					</div>

					<div class="kpi-card sales">
						<div class="kpi-icon"><i class="fa fa-money"></i></div>
						<div class="kpi-value">${this.fmt(summary.total_sales)}</div>
						<div class="kpi-label">إجمالي المبيعات</div>
						${this.render_growth_badge(growth.total_sales)}
					</div>

					<div class="kpi-card profit">
						<div class="kpi-icon"><i class="fa fa-line-chart"></i></div>
						<div class="kpi-value">${this.fmt(summary.total_profit)}</div>
						<div class="kpi-label">صافي الربح</div>
						${this.render_growth_badge(growth.total_profit)}
					</div>

					<div class="kpi-card avg">
						<div class="kpi-icon"><i class="fa fa-shopping-cart"></i></div>
						<div class="kpi-value">${this.fmt(summary.avg_order_value)}</div>
						<div class="kpi-label">متوسط قيمة الطلب</div>
						${this.render_growth_badge(growth.avg_order_value)}
					</div>

					<div class="kpi-card margin">
						<div class="kpi-icon"><i class="fa fa-percent"></i></div>
						<div class="kpi-value">${this.num(summary.profit_margin, 1)}%</div>
						<div class="kpi-label">هامش الربح</div>
					</div>
				</div>
			</div>
		`;
	}

	render_growth_badge(growth) {
		if (growth === undefined || growth === null) return '';

		const isPositive = growth >= 0;
		const icon = isPositive ? 'fa-arrow-up' : 'fa-arrow-down';
		const cls = isPositive ? 'positive' : 'negative';

		return `
			<div class="kpi-growth ${cls}">
				<i class="fa ${icon}"></i>
				${Math.abs(growth).toFixed(1)}%
			</div>
		`;
	}

	render_charts_section(data) {
		return `
			<div class="charts-section">
				<div class="chart-card">
					<div class="chart-title">
						<i class="fa fa-area-chart"></i>
						اتجاه المبيعات اليومي
					</div>
					<div class="chart-container" id="sales-trend-chart"></div>
				</div>

				<div class="chart-card">
					<div class="chart-title">
						<i class="fa fa-pie-chart"></i>
						توزيع مجموعات الأصناف
					</div>
					<div class="chart-container" id="item-groups-chart"></div>
				</div>
			</div>
		`;
	}

	render_sales_trend_chart(trend_data) {
		if (!trend_data || trend_data.length === 0) {
			$('#sales-trend-chart').html('<div class="empty-box" style="padding:40px;"><p>لا توجد بيانات للعرض</p></div>');
			return;
		}

		const labels = trend_data.map(d => d.date);
		const sales_values = trend_data.map(d => d.sales || 0);
		const returns_values = trend_data.map(d => d.returns || 0);

		const chart = new frappe.Chart('#sales-trend-chart', {
			data: {
				labels: labels,
				datasets: [
					{
						name: 'المبيعات',
						type: 'line',
						values: sales_values
					},
					{
						name: 'المرتجعات',
						type: 'bar',
						values: returns_values
					}
				]
			},
			type: 'axis-mixed',
			height: 250,
			colors: ['#10b981', '#ef4444'],
			axisOptions: {
				xAxisMode: 'tick',
				xIsSeries: true
			},
			lineOptions: {
				regionFill: 1,
				dotSize: 4
			},
			barOptions: {
				spaceRatio: 0.5
			}
		});
	}

	render_item_groups_chart(groups_data) {
		if (!groups_data || groups_data.length === 0) {
			$('#item-groups-chart').html('<div class="empty-box" style="padding:40px;"><p>لا توجد بيانات للعرض</p></div>');
			return;
		}

		const labels = groups_data.map(d => d.item_group || 'غير محدد');
		const values = groups_data.map(d => d.total_amount || 0);

		const chart = new frappe.Chart('#item-groups-chart', {
			data: {
				labels: labels,
				datasets: [
					{
						name: 'المبلغ',
						values: values
					}
				]
			},
			type: 'donut',
			height: 250,
			colors: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6']
		});
	}

	render_alerts_section(alerts) {
		if (!alerts || alerts.length === 0) return '';

		const alertCards = alerts.map(alert => `
			<div class="alert-card ${alert.type}">
				<div class="alert-icon">
					<i class="fa ${alert.icon}"></i>
				</div>
				<div class="alert-content">
					<div class="alert-card-title">${alert.title}</div>
					<div class="alert-message">${alert.message}</div>
				</div>
			</div>
		`).join('');

		return `
			<div class="alerts-section">
				<div class="alerts-title">
					<i class="fa fa-lightbulb-o"></i>
					التنبيهات والرؤى
				</div>
				<div class="alerts-grid">
					${alertCards}
				</div>
			</div>
		`;
	}

	render_export_buttons() {
		return `
			<div class="export-buttons">
				<button class="export-btn excel" id="export-excel-btn" title="تصدير Excel">
					<i class="fa fa-file-excel-o"></i>
				</button>
				<button class="export-btn pdf" id="export-pdf-btn" title="تصدير PDF">
					<i class="fa fa-file-pdf-o"></i>
				</button>
				<button class="export-btn print" id="export-print-btn" title="طباعة">
					<i class="fa fa-print"></i>
				</button>
			</div>
		`;
	}

	init_event_handlers() {
		// Items toggle
		$('.items-toggle').off('click').on('click', function() {
			$(this).toggleClass('open');
			$(this).next('.items-panel').toggleClass('show');
		});

		// Export handlers
		$('#export-excel-btn').off('click').on('click', () => this.export_to_excel());
		$('#export-pdf-btn').off('click').on('click', () => this.export_to_pdf());
		$('#export-print-btn').off('click').on('click', () => this.print_report());
	}

	render_customer_card(c) {
		return `
			<div class="customer-card">
				<div class="customer-card-header">
					<div class="customer-main-info">
						<span class="customer-code">${c.customer || ''}</span>
						<span class="customer-name">${c.customer_name || ''}</span>
						${c.top_item_group ? `<span class="customer-category"><i class="fa fa-tag"></i> ${c.top_item_group}</span>` : ''}
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
						<div class="stat-box">
							<div class="stat-val">${this.num(c.total_weight_tons, 2)}</div>
							<div class="stat-lbl">طن</div>
						</div>
						<div class="stat-box">
							<div class="stat-val">${c.unique_items_count || 0}</div>
							<div class="stat-lbl">صنف</div>
						</div>
					</div>
				</div>

				<div class="customer-info-bar">
					<div class="info-item">
						<i class="fa fa-calendar-check-o"></i>
						<span class="info-label">أول فاتورة:</span>
						<span class="info-value">${c.first_invoice_date || '-'}</span>
					</div>
					<div class="info-item">
						<i class="fa fa-calendar"></i>
						<span class="info-label">آخر فاتورة:</span>
						<span class="info-value">${c.last_invoice_date || '-'}</span>
					</div>
					<div class="info-item last-inv">
						<i class="fa fa-file-text-o"></i>
						<span class="info-label">آخر فاتورة:</span>
						<span class="info-value">${this.fmt(c.last_invoice_amount)}</span>
						<span class="info-profit ${(c.last_invoice_profit || 0) >= 0 ? 'profit-pos' : 'profit-neg'}">
							<i class="fa ${(c.last_invoice_profit || 0) >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
							${this.fmt(Math.abs(c.last_invoice_profit))}
						</span>
					</div>
					<div class="info-item highlight">
						<i class="fa fa-star"></i>
						<span class="info-label">المجموعة الأكثر:</span>
						<span class="info-value">${c.top_item_group || '-'}</span>
						<span class="info-amount">(${this.fmt(c.top_group_amount)})</span>
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

	export_to_excel() {
		if (!this.report_data || !this.report_data.customers) {
			frappe.msgprint({ title: __('تنبيه'), indicator: 'orange', message: __('لا توجد بيانات للتصدير') });
			return;
		}

		frappe.msgprint({ title: __('تصدير'), indicator: 'blue', message: __('جاري تصدير التقرير إلى Excel...') });

		// Prepare data for export
		const customers = this.report_data.customers;
		const summary = this.report_data.summary || {};

		let csv_data = [];

		// Add summary header
		csv_data.push(['تقرير تحليل العملاء']);
		csv_data.push(['الفترة', `${this.filters.from_date} - ${this.filters.to_date}`]);
		csv_data.push([]);
		csv_data.push(['ملخص التقرير']);
		csv_data.push(['إجمالي العملاء', summary.total_customers || 0]);
		csv_data.push(['إجمالي الفواتير', summary.total_invoices || 0]);
		csv_data.push(['إجمالي المبيعات', summary.total_sales || 0]);
		csv_data.push(['صافي الربح', summary.total_profit || 0]);
		csv_data.push([]);

		// Add customer data header
		csv_data.push([
			'كود العميل', 'اسم العميل', 'إجمالي المشتريات', 'مشتريات الفترة',
			'الرصيد', 'المستحق', 'أرباح كلي', 'أرباح الفترة',
			'عدد الفواتير كلي', 'عدد الفواتير في الفترة'
		]);

		// Add customer rows
		customers.forEach(c => {
			csv_data.push([
				c.customer || '',
				c.customer_name || '',
				c.total_purchase_all_time || 0,
				c.total_purchase_period || 0,
				c.total_balance || 0,
				c.total_due || 0,
				c.revenue_all_time || 0,
				c.revenue_period || 0,
				c.invoice_count_all_time || 0,
				c.invoice_count_period || 0
			]);
		});

		// Convert to CSV
		const csv_content = csv_data.map(row => row.join(',')).join('\n');
		const BOM = '\uFEFF';
		const blob = new Blob([BOM + csv_content], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);

		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', `customer_analysis_report_${frappe.datetime.nowdate()}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		frappe.show_alert({ message: __('تم تصدير التقرير بنجاح'), indicator: 'green' });
	}

	export_to_pdf() {
		frappe.msgprint({
			title: __('تصدير PDF'),
			indicator: 'blue',
			message: __('جاري إعداد التقرير للطباعة. يرجى استخدام خيار "طباعة إلى PDF" من نافذة الطباعة.')
		});

		setTimeout(() => {
			window.print();
		}, 500);
	}

	print_report() {
		window.print();
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
