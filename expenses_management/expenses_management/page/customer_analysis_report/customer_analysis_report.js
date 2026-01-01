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
				// Date presets row
				{
					fieldtype: 'HTML',
					fieldname: 'date_presets_html',
					options: `
						<div class="filter-presets-section">
							<div class="preset-label">اختيار سريع للفترة</div>
							<div class="preset-buttons-row">
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
				// Row 1: Company & Branch
				{
					fieldtype: 'Section Break',
					label: 'الشركة والفرع'
				},
				{
					label: __('الشركة'),
					fieldname: 'company',
					fieldtype: 'Link',
					options: 'Company',
					default: me.filters.company,
					reqd: 1
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
				// Row 2: Date Range
				{
					fieldtype: 'Section Break',
					label: 'الفترة الزمنية'
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
				// Row 3: Customer & POS
				{
					fieldtype: 'Section Break',
					label: 'العميل ونقطة البيع'
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
					default: me.filters.pos_profile
				},
				// Row 4: Customer Group & Territory
				{
					fieldtype: 'Section Break',
					label: 'التصنيف والمنطقة'
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
				// Row 5: Sales Person & Sort
				{
					fieldtype: 'Section Break',
					label: 'المندوب والترتيب'
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
			primary_action_label: 'عرض التقرير',
			primary_action: function(values) {
				me.filters = values;
				me.settings_dialog.hide();
				me.generate_report();
			}
		});

		// Enhanced compact centered dialog - NO SCROLL
		this.settings_dialog.$wrapper.find('.modal-dialog').css({
			'max-width': '950px',
			'margin': '20px auto'
		});

		this.settings_dialog.$wrapper.find('.modal-content').css({
			'border-radius': '16px',
			'box-shadow': '0 25px 80px rgba(0, 0, 0, 0.35)',
			'border': 'none',
			'overflow': 'visible'
		});

		this.settings_dialog.$wrapper.find('.modal-header').css({
			'background': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
			'color': '#fff',
			'border-bottom': '3px solid #6366f1',
			'padding': '10px 20px'
		});

		this.settings_dialog.$wrapper.find('.modal-title').css({
			'font-size': '16px',
			'font-weight': '800'
		});

		this.settings_dialog.$wrapper.find('.btn-modal-close').css({
			'color': '#94a3b8',
			'font-size': '18px'
		});

		this.settings_dialog.$wrapper.find('.modal-body').css({
			'padding': '12px 20px',
			'background': '#f8fafc',
			'max-height': 'none',
			'overflow': 'visible'
		});

		this.settings_dialog.$wrapper.find('.modal-footer').css({
			'padding': '12px 20px',
			'background': '#f8fafc',
			'border-top': '2px solid #e2e8f0',
			'display': 'flex',
			'justify-content': 'center'
		});

		this.settings_dialog.$wrapper.find('.btn-primary').css({
			'font-size': '14px',
			'padding': '8px 35px',
			'font-weight': '700',
			'border-radius': '8px',
			'background': 'linear-gradient(135deg, #6366f1, #8b5cf6)',
			'border': 'none',
			'box-shadow': '0 4px 15px rgba(99, 102, 241, 0.4)'
		});

		// Add enhanced preset button styles - COMPACT NO SCROLL
		const presetStyles = `
			<style>
				/* Filter Presets Section */
				.filter-presets-section {
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					border-radius: 10px;
					padding: 10px 16px;
					margin-bottom: 6px;
				}
				.preset-label {
					color: #94a3b8;
					font-size: 11px;
					font-weight: 700;
					text-align: center;
					margin-bottom: 8px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				.preset-buttons-row {
					display: flex;
					flex-wrap: wrap;
					gap: 6px;
					justify-content: center;
				}
				.preset-btn {
					background: rgba(99, 102, 241, 0.2);
					border: 1px solid rgba(99, 102, 241, 0.4);
					color: #a5b4fc;
					padding: 5px 12px;
					border-radius: 6px;
					font-size: 12px;
					font-weight: 700;
					cursor: pointer;
					transition: all 0.2s ease;
				}
				.preset-btn:hover {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					border-color: #6366f1;
				}
				.preset-btn.active {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					border-color: #6366f1;
				}

				/* Section Headers - Compact */
				.modal-body .section-head {
					background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
					padding: 6px 12px !important;
					margin: 8px -20px 8px -20px !important;
					border-right: 3px solid #6366f1;
					font-size: 11px !important;
					font-weight: 800 !important;
					color: #4338ca !important;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				.modal-body .form-section:first-child .section-head {
					margin-top: 4px !important;
				}
				.modal-body .section-body {
					padding: 0 !important;
				}

				/* Form Controls - Compact */
				.modal-body .form-column {
					padding: 0 8px !important;
				}
				.modal-body .frappe-control {
					margin-bottom: 0 !important;
				}
				.modal-body .form-group {
					margin-bottom: 0 !important;
				}
				.modal-body .control-label {
					font-size: 11px !important;
					font-weight: 700 !important;
					color: #374151 !important;
					margin-bottom: 3px !important;
				}
				.modal-body .form-control {
					height: 34px !important;
					font-size: 13px !important;
					font-weight: 600 !important;
					border: 2px solid #e2e8f0 !important;
					border-radius: 8px !important;
					padding: 4px 10px !important;
					background: #fff !important;
				}
				.modal-body .form-control:focus {
					border-color: #6366f1 !important;
					box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
				}
				.modal-body .link-btn {
					top: 22px !important;
				}
				.modal-body .form-section {
					margin-bottom: 0 !important;
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

				/* ===== SUMMARY HEADER ===== */
				.summary-header {
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					border-radius: 20px;
					padding: 24px;
					margin-bottom: 24px;
					color: #fff;
					box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
				}

				.summary-title-row {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 20px;
					padding-bottom: 16px;
					border-bottom: 2px solid rgba(255, 255, 255, 0.1);
				}

				.summary-title {
					font-size: 24px;
					font-weight: 900;
					display: flex;
					align-items: center;
					gap: 12px;
				}

				.summary-title i {
					color: #6366f1;
					font-size: 28px;
				}

				.summary-filters {
					display: flex;
					flex-wrap: wrap;
					gap: 10px;
				}

				.filter-tag {
					background: rgba(99, 102, 241, 0.3);
					padding: 8px 16px;
					border-radius: 20px;
					font-size: 13px;
					font-weight: 600;
					display: flex;
					align-items: center;
					gap: 8px;
					border: 1px solid rgba(99, 102, 241, 0.4);
				}

				.filter-tag i {
					color: #a5b4fc;
					font-size: 12px;
				}

				.filter-tag .filter-label {
					color: #94a3b8;
				}

				.filter-tag .filter-value {
					color: #fff;
					font-weight: 700;
				}

				.summary-metrics {
					display: grid;
					grid-template-columns: repeat(10, 1fr);
					gap: 10px;
				}

				.summary-metric-box {
					background: linear-gradient(145deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%);
					border-radius: 12px;
					padding: 12px 8px;
					text-align: center;
					border: 2px solid transparent;
					transition: all 0.25s ease;
					backdrop-filter: blur(10px);
				}

				.summary-metric-box:hover {
					background: linear-gradient(145deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 100%);
					transform: translateY(-3px);
					box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
				}

				/* Individual box colors with icons */
				.summary-metric-box:nth-child(1) { border-color: rgba(99, 102, 241, 0.5); background: linear-gradient(145deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%); }
				.summary-metric-box:nth-child(2) { border-color: rgba(37, 99, 235, 0.5); background: linear-gradient(145deg, rgba(37, 99, 235, 0.15) 0%, rgba(37, 99, 235, 0.05) 100%); }
				.summary-metric-box:nth-child(3) { border-color: rgba(16, 185, 129, 0.5); background: linear-gradient(145deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%); }
				.summary-metric-box:nth-child(4) { border-color: rgba(245, 158, 11, 0.5); background: linear-gradient(145deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%); }
				.summary-metric-box:nth-child(5) { border-color: rgba(139, 92, 246, 0.5); background: linear-gradient(145deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%); }
				.summary-metric-box:nth-child(6) { border-color: rgba(236, 72, 153, 0.5); background: linear-gradient(145deg, rgba(236, 72, 153, 0.15) 0%, rgba(236, 72, 153, 0.05) 100%); }
				.summary-metric-box:nth-child(7) { border-color: rgba(34, 211, 238, 0.5); background: linear-gradient(145deg, rgba(34, 211, 238, 0.15) 0%, rgba(34, 211, 238, 0.05) 100%); }
				.summary-metric-box:nth-child(8) { border-color: rgba(220, 38, 38, 0.5); background: linear-gradient(145deg, rgba(220, 38, 38, 0.15) 0%, rgba(220, 38, 38, 0.05) 100%); }
				.summary-metric-box:nth-child(9) { border-color: rgba(5, 150, 105, 0.5); background: linear-gradient(145deg, rgba(5, 150, 105, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%); }
				.summary-metric-box:nth-child(10) { border-color: rgba(251, 191, 36, 0.5); background: linear-gradient(145deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%); }

				.summary-metric-lbl {
					font-size: 9px;
					color: #cbd5e1;
					font-weight: 700;
					margin-bottom: 6px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}

				.summary-metric-val {
					font-size: 15px;
					font-weight: 900;
				}

				.summary-metric-box:nth-child(1) .summary-metric-val { color: #a5b4fc; }
				.summary-metric-box:nth-child(2) .summary-metric-val { color: #93c5fd; }
				.summary-metric-box:nth-child(3) .summary-metric-val { color: #6ee7b7; }
				.summary-metric-box:nth-child(4) .summary-metric-val { color: #fcd34d; }
				.summary-metric-box:nth-child(5) .summary-metric-val { color: #c4b5fd; }
				.summary-metric-box:nth-child(6) .summary-metric-val { color: #f9a8d4; }
				.summary-metric-box:nth-child(7) .summary-metric-val { color: #67e8f9; }
				.summary-metric-box:nth-child(8) .summary-metric-val { color: #fca5a5; }
				.summary-metric-box:nth-child(9) .summary-metric-val { color: #6ee7b7; }
				.summary-metric-box:nth-child(10) .summary-metric-val { color: #fcd34d; }

				.summary-metric-val.pos { color: #6ee7b7 !important; }
				.summary-metric-val.neg { color: #fca5a5 !important; }

				@media (max-width: 1400px) {
					.summary-metrics { grid-template-columns: repeat(5, 1fr); }
				}

				/* ===== CUSTOMER CARD ===== */
				.customer-card {
					background: #fff;
					border-radius: 20px;
					margin-bottom: 20px;
					box-shadow: 0 8px 30px rgba(0,0,0,0.1);
					overflow: hidden;
					border: none;
					transition: all 0.3s ease;
				}

				.customer-card:hover {
					box-shadow: 0 12px 40px rgba(0,0,0,0.15);
					transform: translateY(-2px);
				}

				.customer-card-header {
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					padding: 18px 24px;
					display: flex;
					justify-content: space-between;
					align-items: center;
					color: #fff;
					border-bottom: 3px solid #6366f1;
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
					gap: 10px;
				}

				.stat-box {
					text-align: center;
					background: linear-gradient(145deg, rgba(99, 102, 241, 0.3) 0%, rgba(99, 102, 241, 0.15) 100%);
					padding: 10px 18px;
					border-radius: 10px;
					backdrop-filter: blur(10px);
					border: 1px solid rgba(99, 102, 241, 0.3);
					transition: all 0.2s ease;
				}

				.stat-box:hover {
					background: linear-gradient(145deg, rgba(99, 102, 241, 0.4) 0%, rgba(99, 102, 241, 0.2) 100%);
					transform: scale(1.05);
				}

				.stat-val {
					font-size: 20px;
					font-weight: 900;
					color: #a5b4fc;
				}

				.stat-lbl {
					font-size: 10px;
					color: #cbd5e1;
					font-weight: 700;
					text-transform: uppercase;
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
				@media (max-width: 1200px) {
					.metrics-row { grid-template-columns: repeat(3, 1fr); }
					.customer-info-bar { justify-content: center; }
				}

				@media (max-width: 992px) {
					.summary-metrics { grid-template-columns: repeat(5, 1fr); }
				}

				@media (max-width: 768px) {
					.metrics-row { grid-template-columns: repeat(2, 1fr); }
					.summary-metrics { grid-template-columns: repeat(3, 1fr); }
					.summary-title-row { flex-direction: column; gap: 12px; align-items: flex-start; }
					.customer-card-header { flex-direction: column; gap: 10px; }
					.customer-stats { flex-wrap: wrap; justify-content: center; }
					.customer-main-info { flex-direction: column; text-align: center; }
					.customer-info-bar { flex-direction: column; gap: 12px; align-items: flex-start; }
					.summary-metric-box { padding: 10px 8px; }
					.summary-metric-val { font-size: 13px; }
					.summary-metric-lbl { font-size: 8px; }
				}

				@media (max-width: 480px) {
					.metrics-row { grid-template-columns: 1fr 1fr; }
					.summary-metrics { grid-template-columns: repeat(2, 1fr); }
					.info-item { font-size: 12px; }
				}

				/* ===== PRINT ===== */
				@media print {
					.floating-gear-btn { display: none !important; }
					.items-panel { display: block !important; }
					.customer-info-bar { background: #f8fafc !important; color: #1e293b !important; }
					.info-item, .info-item .info-label { color: #1e293b !important; }
					.summary-header { background: #f1f5f9 !important; color: #1e293b !important; }
					.summary-metric-box { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; }
					.summary-metric-lbl, .filter-tag .filter-label { color: #64748b !important; }
					.summary-metric-val, .filter-tag .filter-value { color: #1e293b !important; }
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
		// Sort customers based on selected sort option
		let sortedCustomers = this.sort_customers(data.customers);

		let html = '';

		// Add Summary Header
		html += this.render_summary_header(data);

		// Add Customer Cards
		sortedCustomers.forEach((c) => {
			html += this.render_customer_card(c);
		});

		$('#report-content').html(html);

		// Initialize event handlers
		$('.items-toggle').off('click').on('click', function() {
			$(this).toggleClass('open');
			$(this).next('.items-panel').toggleClass('show');
		});
	}

	render_summary_header(data) {
		const totals = data.totals || {};
		const filters = data.filters || {};

		// Build filter tags
		let filterTags = '';

		filterTags += `
			<div class="filter-tag">
				<i class="fa fa-calendar"></i>
				<span class="filter-label">الفترة:</span>
				<span class="filter-value">${filters.from_date || ''} - ${filters.to_date || ''}</span>
			</div>
		`;

		if (filters.company) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-building"></i>
					<span class="filter-label">الشركة:</span>
					<span class="filter-value">${filters.company}</span>
				</div>
			`;
		}

		if (filters.branch) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-code-fork"></i>
					<span class="filter-label">الفرع:</span>
					<span class="filter-value">${filters.branch}</span>
				</div>
			`;
		}

		if (filters.customer) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-user"></i>
					<span class="filter-label">العميل:</span>
					<span class="filter-value">${filters.customer}</span>
				</div>
			`;
		}

		if (filters.customer_group) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-users"></i>
					<span class="filter-label">مجموعة العملاء:</span>
					<span class="filter-value">${filters.customer_group}</span>
				</div>
			`;
		}

		if (filters.territory) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-map-marker"></i>
					<span class="filter-label">المنطقة:</span>
					<span class="filter-value">${filters.territory}</span>
				</div>
			`;
		}

		if (filters.sales_person) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-id-badge"></i>
					<span class="filter-label">المندوب:</span>
					<span class="filter-value">${filters.sales_person}</span>
				</div>
			`;
		}

		if (filters.pos_profile) {
			filterTags += `
				<div class="filter-tag">
					<i class="fa fa-desktop"></i>
					<span class="filter-label">نقطة البيع:</span>
					<span class="filter-value">${filters.pos_profile}</span>
				</div>
			`;
		}

		return `
			<div class="summary-header">
				<div class="summary-title-row">
					<div class="summary-title">
						<i class="fa fa-bar-chart"></i>
						تقرير تحليل العملاء
					</div>
					<div class="summary-filters">
						${filterTags}
					</div>
				</div>

				<div class="summary-metrics">
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">عملاء</div>
						<div class="summary-metric-val">${totals.total_customers || 0}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">فواتير</div>
						<div class="summary-metric-val">${totals.invoice_count_period || 0}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">الوزن (طن)</div>
						<div class="summary-metric-val">${this.num(totals.total_weight_tons, 2)}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">أصناف</div>
						<div class="summary-metric-val">${totals.unique_items_count || 0}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">إجمالي المشتريات</div>
						<div class="summary-metric-val">${this.fmt(totals.total_purchase_all_time)}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">مشتريات الفترة</div>
						<div class="summary-metric-val">${this.fmt(totals.total_purchase_period)}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">الرصيد</div>
						<div class="summary-metric-val">${this.fmt(totals.total_balance)}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">المستحق</div>
						<div class="summary-metric-val ${(totals.total_due || 0) > 0 ? 'neg' : ''}">${this.fmt(totals.total_due)}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">أرباح كلي</div>
						<div class="summary-metric-val ${(totals.revenue_all_time || 0) >= 0 ? 'pos' : 'neg'}">${this.fmt(totals.revenue_all_time)}</div>
					</div>
					<div class="summary-metric-box">
						<div class="summary-metric-lbl">أرباح الفترة</div>
						<div class="summary-metric-val ${(totals.revenue_period || 0) >= 0 ? 'pos' : 'neg'}">${this.fmt(totals.revenue_period)}</div>
					</div>
				</div>
			</div>
		`;
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

	fmt(v) {
		if (v === null || v === undefined) v = 0;
		return parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	num(v, p) {
		if (v === null || v === undefined) v = 0;
		return parseFloat(v).toFixed(p || 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}
}
