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
			sort_order: 'desc',
			use_credit_days: true
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

		// Remove old floating elements (we'll use inline buttons now)
		$('#floating-gear-btn').remove();
		$('#floating-buttons-container').remove();
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
					fieldtype: 'HTML',
					fieldname: 'date_presets_html',
					options: `
						<div class="filter-presets-section">
							<div class="preset-label">اختيار سريع للفترة</div>
							<div class="preset-buttons-grid">
								<button type="button" class="preset-btn" data-preset="today">اليوم</button>
								<button type="button" class="preset-btn" data-preset="yesterday">أمس</button>
								<button type="button" class="preset-btn" data-preset="this_week">هذا الأسبوع</button>
								<button type="button" class="preset-btn" data-preset="last_week">الأسبوع الماضي</button>
								<button type="button" class="preset-btn" data-preset="this_month">هذا الشهر</button>
								<button type="button" class="preset-btn" data-preset="last_month">الشهر الماضي</button>
								<button type="button" class="preset-btn" data-preset="this_quarter">هذا الربع</button>
								<button type="button" class="preset-btn" data-preset="last_quarter">الربع الماضي</button>
								<button type="button" class="preset-btn" data-preset="this_year">هذه السنة</button>
							</div>
						</div>
					`
				},
				{ fieldtype: 'Section Break' },
				{ label: __('الشركة'), fieldname: 'company', fieldtype: 'Link', options: 'Company', default: me.filters.company, reqd: 1 },
				{ fieldtype: 'Column Break' },
				{ label: __('الفرع'), fieldname: 'branch', fieldtype: 'Link', options: 'Branch', default: me.filters.branch },
				{ fieldtype: 'Column Break' },
				{ label: __('من تاريخ'), fieldname: 'from_date', fieldtype: 'Date', default: me.filters.from_date, reqd: 1 },
				{ fieldtype: 'Column Break' },
				{ label: __('إلى تاريخ'), fieldname: 'to_date', fieldtype: 'Date', default: me.filters.to_date, reqd: 1 },
				{ fieldtype: 'Section Break' },
				{ label: __('العميل'), fieldname: 'customer', fieldtype: 'Link', options: 'Customer', default: me.filters.customer },
				{ fieldtype: 'Column Break' },
				{ label: __('نقطة البيع'), fieldname: 'pos_profile', fieldtype: 'Link', options: 'POS Profile', default: me.filters.pos_profile },
				{ fieldtype: 'Column Break' },
				{ label: __('مجموعة العملاء'), fieldname: 'customer_group', fieldtype: 'Link', options: 'Customer Group', default: me.filters.customer_group },
				{ fieldtype: 'Column Break' },
				{ label: __('المنطقة'), fieldname: 'territory', fieldtype: 'Link', options: 'Territory', default: me.filters.territory },
				{ fieldtype: 'Section Break' },
				{ label: __('مندوب المبيعات'), fieldname: 'sales_person', fieldtype: 'Link', options: 'Sales Person', default: me.filters.sales_person },
				{ fieldtype: 'Column Break' },
				{
					label: __('ترتيب حسب'), fieldname: 'sort_by', fieldtype: 'Select',
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
				},
			],
			primary_action_label: 'عرض التقرير',
			primary_action: function(values) {
				me.filters = values;
				me.filters.use_credit_days = true; // Always use credit days
				me.settings_dialog.hide();
				me.generate_report();
			}
		});

		// Dialog styles
		this.settings_dialog.$wrapper.find('.modal-dialog').css({ 'max-width': '1100px', 'margin': '15px auto' });
		this.settings_dialog.$wrapper.find('.modal-content').css({ 'border-radius': '16px', 'box-shadow': '0 25px 80px rgba(0, 0, 0, 0.35)', 'border': 'none', 'overflow': 'visible' });
		this.settings_dialog.$wrapper.find('.modal-header').css({ 'background': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 'color': '#fff', 'border-bottom': '4px solid #6366f1', 'padding': '14px 24px' });
		this.settings_dialog.$wrapper.find('.modal-title').css({ 'font-size': '20px', 'font-weight': '900' });
		this.settings_dialog.$wrapper.find('.btn-modal-close').css({ 'color': '#94a3b8', 'font-size': '22px' });
		this.settings_dialog.$wrapper.find('.modal-body').css({ 'padding': '16px 24px', 'background': '#f8fafc', 'max-height': 'none', 'overflow': 'visible' });
		this.settings_dialog.$wrapper.find('.modal-footer').css({ 'padding': '16px 24px', 'background': '#f8fafc', 'border-top': '3px solid #e2e8f0', 'display': 'flex', 'justify-content': 'center' });
		this.settings_dialog.$wrapper.find('.btn-primary').css({ 'font-size': '18px', 'padding': '12px 50px', 'font-weight': '900', 'border-radius': '10px', 'background': 'linear-gradient(135deg, #6366f1, #8b5cf6)', 'border': 'none', 'box-shadow': '0 6px 20px rgba(99, 102, 241, 0.5)' });

		const presetStyles = `
			<style>
				.filter-presets-section { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
				.preset-label { color: #e2e8f0; font-size: 16px; font-weight: 900; text-align: center; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 1px; }
				.preset-buttons-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
				.preset-btn { background: rgba(99, 102, 241, 0.25); border: 2px solid rgba(99, 102, 241, 0.5); color: #c7d2fe; padding: 12px 16px; border-radius: 8px; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); white-space: nowrap; text-align: center; }
				.preset-btn:hover { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-color: #6366f1; transform: translateY(-3px); box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5); }
				.preset-btn.active { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-color: #6366f1; }
				.modal-body .section-head { display: none !important; }
				.modal-body .form-section:first-child .section-head { display: none !important; }
				.modal-body .section-body { padding: 10px 0 !important; }
				.modal-body .form-column { padding: 0 10px !important; }
				.modal-body .frappe-control { margin-bottom: 6px !important; }
				.modal-body .form-group { margin-bottom: 6px !important; }
				.modal-body .control-label { font-size: 14px !important; font-weight: 800 !important; color: #1e293b !important; margin-bottom: 6px !important; }
				.modal-body .form-control { height: 44px !important; font-size: 16px !important; font-weight: 700 !important; border: 2px solid #cbd5e1 !important; border-radius: 10px !important; padding: 8px 14px !important; background: #fff !important; transition: all 0.3s ease; }
				.modal-body .form-control:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2) !important; }
				.modal-body .link-btn { top: 28px !important; }
				.modal-body .form-section { margin-bottom: 6px !important; }
				.modal-body .frappe-control[data-fieldtype="Select"] .form-control { font-size: 15px !important; }
			</style>
		`;
		this.settings_dialog.$wrapper.find('.modal-content').prepend(presetStyles);

		this.settings_dialog.$wrapper.find('.preset-btn').on('click', (e) => {
			const preset = $(e.target).data('preset');
			const dates = this.get_preset_dates(preset);
			if (dates) {
				this.settings_dialog.set_value('from_date', dates.from_date);
				this.settings_dialog.set_value('to_date', dates.to_date);
				this.settings_dialog.$wrapper.find('.preset-btn').removeClass('active');
				$(e.target).addClass('active');
			}
		});

		this.settings_dialog.show();
	}

	get_preset_dates(preset) {
		const today = frappe.datetime.get_today();
		const d = new Date(today);
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
				let lw = frappe.datetime.add_days(today, -7);
				from_date = frappe.datetime.week_start(lw);
				to_date = frappe.datetime.week_end(lw);
				break;
			case 'this_month':
				from_date = frappe.datetime.month_start(today);
				to_date = frappe.datetime.month_end(today);
				break;
			case 'last_month':
				// Calculate last month manually
				let lastMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
				let lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0);
				from_date = lastMonthDate.toISOString().split('T')[0];
				to_date = lastMonthEnd.toISOString().split('T')[0];
				break;
			case 'this_quarter':
				from_date = frappe.datetime.quarter_start(today);
				to_date = frappe.datetime.quarter_end(today);
				break;
			case 'last_quarter':
				// Calculate last quarter manually
				let currentQuarter = Math.floor(d.getMonth() / 3);
				let lastQuarterStart = new Date(d.getFullYear(), (currentQuarter - 1) * 3, 1);
				if (currentQuarter === 0) {
					lastQuarterStart = new Date(d.getFullYear() - 1, 9, 1); // Q4 of last year
				}
				let lastQuarterEnd = new Date(lastQuarterStart.getFullYear(), lastQuarterStart.getMonth() + 3, 0);
				from_date = lastQuarterStart.toISOString().split('T')[0];
				to_date = lastQuarterEnd.toISOString().split('T')[0];
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

	get_filters() { return this.filters; }

	render_content() {
		this.page.main.html(`
			<style>
				/* ===== ANIMATIONS ===== */
				@keyframes fadeInUp {
					from { opacity: 0; transform: translateY(20px); }
					to { opacity: 1; transform: translateY(0); }
				}
				@keyframes fadeIn {
					from { opacity: 0; }
					to { opacity: 1; }
				}
				@keyframes slideInRight {
					from { opacity: 0; transform: translateX(30px); }
					to { opacity: 1; transform: translateX(0); }
				}
				@keyframes pulse {
					0%, 100% { transform: scale(1); }
					50% { transform: scale(1.05); }
				}
				@keyframes shimmer {
					0% { background-position: -200% 0; }
					100% { background-position: 200% 0; }
				}
				@keyframes spin {
					to { transform: rotate(360deg); }
				}
				@keyframes bounce {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-5px); }
				}

				/* ===== FLOATING ACTION BUTTONS ===== */
				.floating-actions {
					position: fixed;
					bottom: 30px;
					right: 30px;
					z-index: 9999;
					display: flex;
					flex-direction: column-reverse;
					gap: 12px;
					animation: fadeInUp 0.5s ease-out;
				}
				.float-btn {
					width: 50px;
					height: 50px;
					border-radius: 50%;
					border: none;
					color: #fff;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 18px;
					font-weight: 900;
					transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
					position: relative;
					overflow: hidden;
					box-shadow: 0 4px 15px rgba(0,0,0,0.3);
				}
				.float-btn::before {
					content: '';
					position: absolute;
					top: 50%;
					left: 50%;
					width: 0;
					height: 0;
					background: rgba(255,255,255,0.3);
					border-radius: 50%;
					transform: translate(-50%, -50%);
					transition: width 0.4s ease, height 0.4s ease;
				}
				.float-btn:hover::before { width: 100%; height: 100%; }
				.float-btn:hover { transform: scale(1.15) rotate(5deg); box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
				.float-btn:active { transform: scale(0.95); }
				.float-btn.settings-btn { background: linear-gradient(135deg, #6366f1, #8b5cf6); animation-delay: 0.1s; }
				.float-btn.settings-btn:hover { box-shadow: 0 8px 30px rgba(99, 102, 241, 0.6); transform: scale(1.15) rotate(180deg); }
				.float-btn.reload-btn { background: linear-gradient(135deg, #059669, #10b981); animation-delay: 0.2s; }
				.float-btn.reload-btn:hover { box-shadow: 0 8px 30px rgba(16, 185, 129, 0.6); }
				.float-btn.reload-btn:hover i { animation: spin 0.6s ease-in-out; }
				.float-btn.print-btn { background: linear-gradient(135deg, #2563eb, #3b82f6); animation-delay: 0.3s; }
				.float-btn.print-btn:hover { box-shadow: 0 8px 30px rgba(37, 99, 235, 0.6); }
				.float-btn.pdf-btn { background: linear-gradient(135deg, #dc2626, #ef4444); animation-delay: 0.4s; }
				.float-btn.pdf-btn:hover { box-shadow: 0 8px 30px rgba(239, 68, 68, 0.6); }
				.float-btn i { font-size: 18px; font-weight: 900; }
				.float-btn .btn-tooltip {
					position: absolute;
					left: 60px;
					background: #1e293b;
					color: #fff;
					padding: 6px 12px;
					border-radius: 8px;
					font-size: 12px;
					font-weight: 700;
					white-space: nowrap;
					opacity: 0;
					visibility: hidden;
					transition: all 0.3s ease;
					pointer-events: none;
				}
				.float-btn .btn-tooltip::after {
					content: '';
					position: absolute;
					right: 100%;
					top: 50%;
					transform: translateY(-50%);
					border: 6px solid transparent;
					border-right-color: #1e293b;
				}
				.float-btn:hover .btn-tooltip { opacity: 1; visibility: visible; left: 65px; }

				/* ===== MAIN REPORT ===== */
				.customer-analysis-report {
					direction: rtl;
					font-family: 'Segoe UI', Tahoma, sans-serif;
					min-height: 100vh;
					padding: 10px 0;
					background: transparent;
					font-weight: 900;
					-webkit-font-smoothing: antialiased;
					-moz-osx-font-smoothing: grayscale;
					letter-spacing: 0.3px;
				}
				.customer-analysis-report * {
					font-weight: inherit;
				}
				#report-content { width: 100%; font-weight: 900; }

				/* ===== SUMMARY HEADER ===== */
				.summary-header {
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					border-radius: 16px;
					padding: 20px;
					margin-bottom: 16px;
					color: #fff;
					box-shadow: 0 15px 40px rgba(0, 0, 0, 0.25);
					animation: fadeInUp 0.6s ease-out;
					position: relative;
					overflow: hidden;
				}
				.summary-header::before {
					content: '';
					position: absolute;
					top: 0;
					left: 0;
					right: 0;
					height: 4px;
					background: linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #6366f1);
					background-size: 200% 100%;
					animation: shimmer 3s linear infinite;
				}
				.summary-title-row {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 16px;
					padding-bottom: 14px;
					border-bottom: 2px solid rgba(255, 255, 255, 0.1);
				}
				.summary-title {
					font-size: 26px;
					font-weight: 900;
					display: flex;
					align-items: center;
					gap: 12px;
					animation: slideInRight 0.5s ease-out;
				}
				.summary-title i { color: #a5b4fc; font-size: 26px; animation: bounce 2s ease-in-out infinite; }
				.summary-filters { display: flex; flex-wrap: wrap; gap: 10px; animation: fadeIn 0.6s ease-out 0.2s backwards; }
				.filter-tag {
					background: rgba(99, 102, 241, 0.25);
					padding: 10px 16px;
					border-radius: 20px;
					font-size: 16px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 10px;
					border: 1px solid rgba(99, 102, 241, 0.4);
					backdrop-filter: blur(10px);
					transition: all 0.3s ease;
				}
				.filter-tag:hover { background: rgba(99, 102, 241, 0.35); transform: translateY(-2px); }
				.filter-tag i { color: #a5b4fc; font-size: 16px; font-weight: 900; }
				.filter-tag .filter-label { color: #94a3b8; font-weight: 800; }
				.filter-tag .filter-value { color: #fff; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
				.period-days-badge {
					background: linear-gradient(135deg, #10b981, #059669);
					color: #fff;
					padding: 6px 14px;
					border-radius: 15px;
					font-size: 14px;
					font-weight: 800;
					margin-right: 10px;
					animation: pulse 2s ease-in-out infinite;
				}
				.summary-metrics {
					display: grid;
					grid-template-columns: repeat(4, 1fr);
					gap: 12px;
				}
				.summary-metric-box {
					background: linear-gradient(145deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%);
					border-radius: 14px;
					padding: 14px 10px;
					text-align: center;
					border: 2px solid transparent;
					transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
					backdrop-filter: blur(10px);
					animation: fadeInUp 0.5s ease-out backwards;
				}
				.summary-metric-box:nth-child(1) { animation-delay: 0.05s; }
				.summary-metric-box:nth-child(2) { animation-delay: 0.1s; }
				.summary-metric-box:nth-child(3) { animation-delay: 0.15s; }
				.summary-metric-box:nth-child(4) { animation-delay: 0.2s; }
				.summary-metric-box:nth-child(5) { animation-delay: 0.25s; }
				.summary-metric-box:nth-child(6) { animation-delay: 0.3s; }
				.summary-metric-box:nth-child(7) { animation-delay: 0.35s; }
				.summary-metric-box:nth-child(8) { animation-delay: 0.4s; }
				.summary-metric-box:nth-child(9) { animation-delay: 0.45s; }
				.summary-metric-box:nth-child(10) { animation-delay: 0.5s; }
				.summary-metric-box:hover {
					background: linear-gradient(145deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
					transform: translateY(-5px) scale(1.02);
					box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
				}
				.summary-metric-box:nth-child(1) { border-color: rgba(99, 102, 241, 0.5); background: linear-gradient(145deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.05) 100%); }
				.summary-metric-box:nth-child(2) { border-color: rgba(37, 99, 235, 0.5); background: linear-gradient(145deg, rgba(37, 99, 235, 0.2) 0%, rgba(37, 99, 235, 0.05) 100%); }
				.summary-metric-box:nth-child(3) { border-color: rgba(16, 185, 129, 0.5); background: linear-gradient(145deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%); }
				.summary-metric-box:nth-child(4) { border-color: rgba(245, 158, 11, 0.5); background: linear-gradient(145deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.05) 100%); }
				.summary-metric-box:nth-child(5) { border-color: rgba(139, 92, 246, 0.5); background: linear-gradient(145deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.05) 100%); }
				.summary-metric-box:nth-child(6) { border-color: rgba(236, 72, 153, 0.5); background: linear-gradient(145deg, rgba(236, 72, 153, 0.2) 0%, rgba(236, 72, 153, 0.05) 100%); }
				.summary-metric-box:nth-child(7) { border-color: rgba(34, 211, 238, 0.5); background: linear-gradient(145deg, rgba(34, 211, 238, 0.2) 0%, rgba(34, 211, 238, 0.05) 100%); }
				.summary-metric-box:nth-child(8) { border-color: rgba(220, 38, 38, 0.5); background: linear-gradient(145deg, rgba(220, 38, 38, 0.2) 0%, rgba(220, 38, 38, 0.05) 100%); }
				.summary-metric-box:nth-child(9) { border-color: rgba(5, 150, 105, 0.5); background: linear-gradient(145deg, rgba(5, 150, 105, 0.2) 0%, rgba(5, 150, 105, 0.05) 100%); }
				.summary-metric-box:nth-child(10) { border-color: rgba(251, 191, 36, 0.5); background: linear-gradient(145deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.05) 100%); }
				.summary-metric-lbl { font-size: 14px; color: #cbd5e1; font-weight: 800; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
				.summary-metric-val { font-size: 22px; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
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
				.summary-metric-val .metric-pct { font-size: 15px; font-weight: 900; padding: 5px 12px; border-radius: 10px; margin-right: 8px; }
				.summary-metric-val .metric-pct.pct-pos { background: linear-gradient(135deg, rgba(16, 185, 129, 0.5), rgba(16, 185, 129, 0.3)); color: #6ee7b7; border: 2px solid rgba(110, 231, 183, 0.5); text-shadow: 0 1px 2px rgba(0,0,0,0.2); }
				.summary-metric-val .metric-pct.pct-neg { background: linear-gradient(135deg, rgba(239, 68, 68, 0.5), rgba(239, 68, 68, 0.3)); color: #fca5a5; border: 2px solid rgba(252, 165, 165, 0.5); text-shadow: 0 1px 2px rgba(0,0,0,0.2); }

				/* ===== CUSTOMER CARD ===== */
				.customer-card {
					background: #fff;
					border-radius: 14px;
					margin-bottom: 14px;
					box-shadow: 0 8px 30px rgba(0,0,0,0.08);
					overflow: hidden;
					border: none;
					transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
					animation: fadeInUp 0.6s ease-out backwards;
				}
				.customer-card:hover {
					box-shadow: 0 15px 45px rgba(0,0,0,0.12);
					transform: translateY(-3px);
				}
				.customer-card-header {
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					padding: 14px 18px;
					display: flex;
					justify-content: space-between;
					align-items: center;
					color: #fff;
					border-bottom: none;
					position: relative;
				}
				.customer-main-info { display: flex; align-items: center; gap: 12px; flex: 1; }
				.customer-name { font-size: 22px; font-weight: 900; text-shadow: 0 1px 3px rgba(0,0,0,0.1); }
				.header-stats { display: flex; gap: 12px; flex-wrap: wrap; }
				.hstat {
					background: rgba(99, 102, 241, 0.25);
					padding: 6px 10px;
					border-radius: 8px;
					font-size: 12px;
					font-weight: 900;
					color: #a5b4fc;
					display: flex;
					align-items: center;
					gap: 5px;
				}
				.hstat i { font-size: 11px; opacity: 0.9; }
				.hstat.credit-days { background: rgba(16, 185, 129, 0.25); color: #6ee7b7; }
				.hstat.top-group { background: rgba(245, 158, 11, 0.25); color: #fbbf24; }
				.hstat.top-group i { color: #fbbf24; }
				.customer-stats { display: flex; gap: 10px; flex-wrap: wrap; }
				.stat-box {
					text-align: center;
					background: linear-gradient(145deg, rgba(99, 102, 241, 0.3) 0%, rgba(99, 102, 241, 0.15) 100%);
					padding: 8px 16px;
					border-radius: 10px;
					backdrop-filter: blur(10px);
					border: 1px solid rgba(99, 102, 241, 0.3);
					transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
					min-width: 70px;
				}
				.stat-box:hover { background: linear-gradient(145deg, rgba(99, 102, 241, 0.45) 0%, rgba(99, 102, 241, 0.25) 100%); transform: scale(1.05) translateY(-2px); }
				.stat-val { font-size: 16px; font-weight: 900; color: #a5b4fc; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
				.stat-lbl { font-size: 10px; color: #cbd5e1; font-weight: 800; text-transform: uppercase; margin-top: 2px; letter-spacing: 0.3px; }
				.stat-box.data-days-box { background: linear-gradient(145deg, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0.15) 100%); border: 1px solid rgba(16, 185, 129, 0.45); }
				.stat-box.data-days-box .stat-val { color: #6ee7b7; }
				.stat-box.data-days-box .stat-lbl { color: #a7f3d0; font-size: 9px; font-weight: 800; }

				/* ===== METRICS ROW ===== */
				.metrics-row {
					display: flex;
					flex-wrap: nowrap;
					gap: 10px;
					padding: 14px 12px;
					background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
				}
				.metric-box {
					flex: 1;
					min-width: 0;
					background: #fff;
					border-radius: 12px;
					padding: 14px 8px;
					text-align: center;
					box-shadow: 0 3px 10px rgba(0,0,0,0.06);
					border: 2px solid transparent;
					transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
					animation: fadeInUp 0.4s ease-out backwards;
				}
				.metric-box:nth-child(1) { border-color: #e0e7ff; background: linear-gradient(135deg, #eef2ff 0%, #fff 100%); animation-delay: 0.05s; }
				.metric-box:nth-child(2) { border-color: #dbeafe; background: linear-gradient(135deg, #eff6ff 0%, #fff 100%); animation-delay: 0.1s; }
				.metric-box:nth-child(3) { border-color: #d1fae5; background: linear-gradient(135deg, #ecfdf5 0%, #fff 100%); animation-delay: 0.15s; }
				.metric-box:nth-child(4) { border-color: #fee2e2; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%); animation-delay: 0.2s; }
				.metric-box:nth-child(5) { border-color: #fef3c7; background: linear-gradient(135deg, #fffbeb 0%, #fff 100%); animation-delay: 0.25s; }
				.metric-box:nth-child(6) { border-color: #d1fae5; background: linear-gradient(135deg, #ecfdf5 0%, #fff 100%); animation-delay: 0.3s; }
				.metric-box:nth-child(7) { border-color: #fca5a5; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%); animation-delay: 0.35s; }
				.metric-box:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 6px 15px rgba(0,0,0,0.1); }
				.metric-lbl { font-size: 13px; font-weight: 900; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
				.metric-box:nth-child(1) .metric-lbl { color: #4f46e5; }
				.metric-box:nth-child(2) .metric-lbl { color: #2563eb; }
				.metric-box:nth-child(3) .metric-lbl { color: #059669; }
				.metric-box:nth-child(4) .metric-lbl { color: #dc2626; }
				.metric-box:nth-child(5) .metric-lbl { color: #b45309; }
				.metric-box:nth-child(6) .metric-lbl { color: #047857; }
				.metric-box:nth-child(7) .metric-lbl { color: #dc2626; }
				.metric-val { font-size: 18px; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
				.metric-box:nth-child(1) .metric-val { color: #4f46e5; }
				.metric-box:nth-child(2) .metric-val { color: #2563eb; }
				.metric-box:nth-child(3) .metric-val { color: #059669; }
				.metric-box:nth-child(4) .metric-val { color: #dc2626; }
				.metric-box:nth-child(5) .metric-val { color: #b45309; }
				.metric-box:nth-child(6) .metric-val { color: #047857; }
				.metric-box:nth-child(7) .metric-val { color: #dc2626; }
				.metric-val.pos { color: #059669 !important; }
				.metric-val.neg { color: #dc2626 !important; }
				.days-badge {
					display: inline-block;
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					padding: 3px 6px;
					border-radius: 5px;
					font-size: 10px;
					font-weight: 900;
					margin-right: 4px;
					vertical-align: middle;
				}
				.days-badge.period {
					background: linear-gradient(135deg, #10b981, #059669);
				}
				.metric-val-with-pct { display: flex; flex-direction: column; align-items: center; gap: 3px; }
				.metric-val-with-pct span:first-child { font-size: 16px; font-weight: 900; }
				.metric-pct { font-size: 13px; font-weight: 900; padding: 4px 8px; border-radius: 8px; }
				.metric-pct.pct-pos { background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.15)); color: #047857; border: 2px solid rgba(16, 185, 129, 0.4); }
				.metric-pct.pct-neg { background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.15)); color: #b91c1c; border: 2px solid rgba(239, 68, 68, 0.4); }
				.metric-box.returns-box { border-color: #fca5a5 !important; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%) !important; }
				.metric-box.returns-box .metric-lbl { color: #dc2626 !important; }
				.metric-box.credit-remain-box { border-color: #fef3c7 !important; background: linear-gradient(135deg, #fffbeb 0%, #fff 100%) !important; }
				.metric-box.credit-remain-box .metric-lbl { color: #b45309 !important; }
				.metric-box.credit-remain-box .metric-val { color: #b45309 !important; }
				.metric-box.credit-remain-box.zero-credit { border-color: #fca5a5 !important; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%) !important; }
				.metric-box.credit-remain-box.zero-credit .metric-lbl { color: #dc2626 !important; }
				.metric-box.credit-remain-box.zero-credit .metric-val { color: #dc2626 !important; }
				.metric-val-with-count { display: flex; flex-direction: column; align-items: center; gap: 3px; }
				.metric-val-with-count span:first-child { font-size: 16px; font-weight: 900; }
				.return-count { font-size: 10px; font-weight: 800; color: #64748b; background: rgba(100, 116, 139, 0.15); padding: 3px 8px; border-radius: 8px; }

				/* ===== CUSTOMER INFO BAR ===== */
				.customer-info-bar {
					display: flex;
					flex-wrap: wrap;
					gap: 10px;
					padding: 10px 16px;
					background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
					border-top: 1px solid rgba(99, 102, 241, 0.3);
					border-bottom: 3px solid #6366f1;
				}
				.info-item { display: flex; align-items: center; gap: 8px; color: #94a3b8; font-size: 12px; font-weight: 900; transition: all 0.3s ease; }
				.info-item:hover { transform: translateY(-2px); }
				.info-item i { color: #6366f1; font-size: 13px; font-weight: 900; }
				.info-item .info-label { font-weight: 900; }
				.info-item .info-value { color: #fff; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
				.info-item.last-inv { background: rgba(16, 185, 129, 0.15); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3); }
				.info-item.last-inv i { color: #10b981; }
				.info-item.last-inv .info-value { color: #10b981; font-size: 12px; }
				.info-item.credit-limit { background: rgba(59, 130, 246, 0.15); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3); }
				.info-item.credit-limit i { color: #3b82f6; }
				.info-item.credit-limit .info-value { color: #3b82f6; font-size: 12px; }
				.info-item.credit-remaining { background: rgba(16, 185, 129, 0.15); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3); }
				.info-item.credit-remaining i { color: #10b981; }
				.info-item.credit-remaining .info-value { color: #10b981; font-size: 12px; }
				.info-item.credit-remaining.over-limit { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); }
				.info-item.credit-remaining.over-limit i { color: #ef4444; }
				.info-item.credit-remaining.over-limit .info-value { color: #ef4444; }
				.info-profit { display: flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 800; }
				.info-profit.profit-pos { background: rgba(16, 185, 129, 0.3); color: #10b981; }
				.info-profit.profit-neg { background: rgba(239, 68, 68, 0.3); color: #ef4444; }
				.info-profit i { font-size: 10px; }
				.days-tag {
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					color: #fff;
					padding: 4px 10px;
					border-radius: 8px;
					font-size: 13px;
					font-weight: 800;
					margin-right: 6px;
				}
				.days-tag.period { background: linear-gradient(135deg, #10b981, #059669); }
				.days-tag.credit { background: linear-gradient(135deg, #f59e0b, #d97706); }
				.info-item.data-days { background: rgba(245, 158, 11, 0.15); padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(245, 158, 11, 0.3); }
				.info-item.data-days i { color: #f59e0b; }
				.info-item.data-days .info-value { color: #fcd34d; }

				/* ===== ITEMS TABLE ===== */
				.items-wrapper { border-top: 2px solid #e5e7eb; margin-top: 4px; }
				.items-toggle {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 12px 16px;
					cursor: pointer;
					background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
					transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
				}
				.items-toggle:hover { background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); }
				.items-toggle.open { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #fff; }
				.items-toggle.open .toggle-icon { transform: rotate(180deg); }
				.items-toggle.open .items-badge { background: #10b981; }
				.items-title { font-size: 20px; font-weight: 900; display: flex; align-items: center; gap: 14px; letter-spacing: 0.3px; }
				.toggle-label { font-weight: 900; }
				.toggle-counts { display: flex; gap: 12px; margin-right: 10px; }
				.count-badge { padding: 6px 16px; border-radius: 10px; font-size: 16px; font-weight: 900; display: flex; align-items: center; gap: 8px; transition: all 0.3s ease; }
				.count-badge.invoices { background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1e40af; }
				.count-badge.items { background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #065f46; }
				.items-toggle.open .count-badge.invoices { background: rgba(59, 130, 246, 0.3); color: #93c5fd; }
				.items-toggle.open .count-badge.items { background: rgba(16, 185, 129, 0.3); color: #6ee7b7; }
				.items-badge { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; padding: 8px 20px; border-radius: 20px; font-size: 17px; font-weight: 800; }
				.toggle-icon { transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); font-size: 18px; font-weight: bold; }
				.items-panel { display: none; background: #fff; animation: fadeIn 0.3s ease-out; }
				.items-panel.show { display: block; }
				.items-scroll { max-height: 450px; overflow-y: auto; overflow-x: auto; }
				.items-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
				.items-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 5px; }
				.items-scroll::-webkit-scrollbar-thumb { background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 5px; }
				.items-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(135deg, #4f46e5, #7c3aed); }
				.items-tbl { width: 100%; border-collapse: collapse; font-size: 16px; }
				.items-tbl th {
					background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
					color: #fff;
					font-weight: 900;
					padding: 18px 14px;
					text-align: center;
					font-size: 17px;
					text-transform: uppercase;
					letter-spacing: 1px;
					position: sticky;
					top: 0;
					z-index: 10;
					border-bottom: 4px solid #6366f1;
					text-shadow: 0 1px 2px rgba(0,0,0,0.2);
				}
				.items-tbl td { padding: 16px 12px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: 900; color: #1e293b; font-size: 17px; letter-spacing: 0.2px; }
				.items-tbl tbody tr { transition: all 0.3s ease; }
				.items-tbl tbody tr:nth-child(even) { background: #f8fafc; }
				.items-tbl tbody tr:hover { background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%); transform: scale(1.005); }
				.inv-link {
					color: #fff;
					font-weight: 800;
					text-decoration: none;
					font-size: 12px;
					background: linear-gradient(135deg, #6366f1, #8b5cf6);
					padding: 8px 16px;
					border-radius: 8px;
					display: inline-block;
					transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
				}
				.inv-link:hover { transform: scale(1.08) translateY(-2px); box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4); }
				.item-code { color: #4f46e5; font-weight: 900; font-size: 16px; }
				.item-name { color: #1e293b; font-size: 14px; font-weight: 700; margin-top: 3px; }
				.qty-cell { display: flex; flex-direction: column; gap: 3px; }
				.qty-main { font-weight: 900; color: #1e293b; font-size: 18px; }
				.qty-uom { font-size: 13px; color: #64748b; font-weight: 600; }
				.rate-cell { display: flex; flex-direction: column; gap: 5px; align-items: center; }
				.rate-invoice { background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1e40af; padding: 6px 14px; border-radius: 8px; font-weight: 900; font-size: 15px; }
				.rate-ton { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #b45309; padding: 6px 14px; border-radius: 8px; font-weight: 900; font-size: 15px; }
				.date-cell { font-weight: 900; color: #6366f1; font-size: 12px; white-space: nowrap; }
				.weight-cell { font-weight: 900; color: #7c3aed; font-size: 18px; }
				.amount-cell { font-weight: 900; color: #1e293b; font-size: 18px; }
				.cost-cell { font-weight: 900; color: #dc2626; font-size: 18px; }
				.stock-cell { display: flex; align-items: center; justify-content: center; gap: 10px; }
				.stock-dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.2); animation: pulse 2s ease-in-out infinite; }
				.stock-dot.hi { background: linear-gradient(135deg, #10b981, #059669); }
				.stock-dot.md { background: linear-gradient(135deg, #f59e0b, #d97706); }
				.stock-dot.lo { background: linear-gradient(135deg, #ef4444, #dc2626); }
				.stock-val { font-weight: 900; color: #1e293b; font-size: 18px; }
				.val-pos { color: #059669 !important; font-weight: 900; }
				.val-neg { color: #dc2626 !important; font-weight: 900; }
				.branch-user-cell { display: flex; flex-direction: column; gap: 5px; align-items: center; }
				.branch-name { font-size: 15px; font-weight: 800; color: #7c3aed; background: rgba(124, 58, 237, 0.1); padding: 4px 12px; border-radius: 6px; }
				.creator-name { font-size: 13px; font-weight: 600; color: #64748b; }
				.profit-cell { display: flex; flex-direction: column; align-items: center; gap: 5px; }
				.profit-pct { font-size: 16px; font-weight: 900; padding: 6px 14px; border-radius: 12px; text-shadow: 0 1px 1px rgba(0,0,0,0.1); }
				.profit-pct.pct-pos { background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, 0.15)); color: #047857; border: 2px solid rgba(16, 185, 129, 0.5); }
				.profit-pct.pct-neg { background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.15)); color: #b91c1c; border: 2px solid rgba(239, 68, 68, 0.5); }

				/* ===== EMPTY & LOADING ===== */
				.empty-box { text-align: center; padding: 100px 20px; animation: fadeIn 0.5s ease-out; }
				.empty-box h4 { font-size: 24px; font-weight: 700; color: #6366f1; margin-bottom: 12px; }
				.empty-box p { color: #9ca3af; font-size: 15px; }
				.loading-box { display: flex; align-items: center; justify-content: center; padding: 120px; flex-direction: column; gap: 25px; }
				.spinner { width: 50px; height: 50px; border: 4px solid #e0e7ff; border-top: 4px solid #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
				.loading-txt { color: #6b7280; font-size: 15px; font-weight: 600; }

				/* ===== RESPONSIVE ===== */
				@media (max-width: 1400px) { .summary-metrics { grid-template-columns: repeat(4, 1fr); } }
				@media (max-width: 1200px) { .metrics-row { grid-template-columns: repeat(3, 1fr); } .customer-info-bar { justify-content: center; } }
				@media (max-width: 992px) { .summary-metrics { grid-template-columns: repeat(4, 1fr); } }
				@media (max-width: 768px) {
					.metrics-row { grid-template-columns: repeat(2, 1fr); }
					.summary-metrics { grid-template-columns: repeat(2, 1fr); }
					.summary-title-row { flex-direction: column; gap: 14px; align-items: flex-start; }
					.customer-card-header { flex-direction: column; gap: 12px; }
					.customer-stats { flex-wrap: wrap; justify-content: center; }
					.customer-main-info { flex-direction: column; text-align: center; }
					.customer-info-bar { flex-direction: column; gap: 14px; align-items: flex-start; }
				}
				@media (max-width: 480px) { .metrics-row { grid-template-columns: 1fr 1fr; } .summary-metrics { grid-template-columns: repeat(2, 1fr); } }

				/* ===== PRINT STYLES - CLEAN TABLES ONLY ===== */
				@media print {
					* {
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
						box-shadow: none !important;
					}
					html, body {
						background: #fff !important;
						font-family: Arial, sans-serif !important;
						font-size: 12pt !important;
						margin: 0 !important;
						padding: 0 !important;
						height: auto !important;
						min-height: auto !important;
						overflow: visible !important;
					}

					/* Hide ALL non-essential elements */
					.floating-actions,
					.navbar,
					.page-head,
					.page-container > .page-head,
					[data-page-container] > .page-head,
					.layout-side-section,
					.customer-card-header,
					.customer-info-bar,
					.metrics-row,
					.items-toggle,
					.toggle-icon,
					.summary-header,
					.count-badge,
					.items-badge,
					.stock-dot,
					.rate-ton,
					.profit-pct,
					.qty-uom,
					.item-name,
					.creator-name,
					.days-badge,
					.days-tag,
					footer,
					.footer,
					#page-customer-analysis-report > .page-head { display: none !important; visibility: hidden !important; height: 0 !important; }

					/* Main container */
					.main-section, .layout-main-section {
						margin: 0 !important;
						padding: 0 !important;
						width: 100% !important;
					}
					.customer-analysis-report {
						padding: 5mm !important;
						background: #fff !important;
						direction: rtl !important;
						min-height: auto !important;
					}
					#report-content {
						width: 100% !important;
						overflow: visible !important;
					}

					/* Print Header */
					.customer-analysis-report::before {
						content: 'تقرير تحليل العملاء';
						display: block;
						text-align: center;
						font-size: 18pt;
						font-weight: bold;
						margin-bottom: 12px;
						padding: 8px;
						border-bottom: 3px solid #000;
					}

					/* Customer Card */
					.customer-card {
						page-break-inside: avoid;
						margin: 0 0 15px 0 !important;
						padding: 0 !important;
						border: none !important;
						border-radius: 0 !important;
						background: #fff !important;
						overflow: visible !important;
					}

					/* Show items panel and fix overflow */
					.items-panel { display: block !important; overflow: visible !important; }
					.items-scroll { max-height: none !important; overflow: visible !important; }
					.items-wrapper { border: none !important; margin: 0 !important; overflow: visible !important; }

					/* Customer name header */
					.customer-card::before {
						content: attr(data-customer-name);
						display: block;
						font-size: 14pt;
						font-weight: bold;
						padding: 8px 12px;
						background: #ddd !important;
						border: 2px solid #333;
						margin-bottom: 5px;
					}

					/* Items Table */
					.items-tbl {
						width: 100% !important;
						border-collapse: collapse !important;
						font-size: 11pt !important;
						margin-bottom: 15px !important;
						page-break-inside: auto;
					}
					.items-tbl th {
						background: #333 !important;
						color: #fff !important;
						font-weight: bold !important;
						padding: 8px 6px !important;
						border: 2px solid #000 !important;
						font-size: 10pt !important;
						text-transform: none !important;
						letter-spacing: 0 !important;
					}
					.items-tbl td {
						padding: 6px 5px !important;
						border: 1px solid #333 !important;
						font-size: 11pt !important;
						color: #000 !important;
						text-align: center !important;
						background: #fff !important;
						font-weight: 600 !important;
					}
					.items-tbl tbody tr:nth-child(even) td { background: #f0f0f0 !important; }
					.items-tbl tbody tr:hover { transform: none !important; }
					.items-tbl tbody tr { page-break-inside: avoid; }

					/* Simple text */
					.inv-link {
						background: none !important;
						color: #000 !important;
						padding: 0 !important;
						border-radius: 0 !important;
						font-weight: bold !important;
						text-decoration: none !important;
						font-size: 10pt !important;
					}
					.date-cell { color: #000 !important; font-weight: bold !important; font-size: 10pt !important; }
					.item-code { color: #000 !important; font-weight: bold !important; font-size: 10pt !important; }
					.qty-main { color: #000 !important; font-weight: bold !important; font-size: 11pt !important; }
					.qty-cell, .rate-cell, .stock-cell, .branch-user-cell, .profit-cell { gap: 0 !important; }
					.rate-invoice, .branch-name {
						background: none !important;
						color: #000 !important;
						padding: 0 !important;
						border-radius: 0 !important;
						font-size: 10pt !important;
					}
					.weight-cell, .amount-cell, .cost-cell, .stock-val { color: #000 !important; font-size: 11pt !important; font-weight: bold !important; }
					.val-pos { color: #000 !important; }
					.val-neg { color: #000 !important; font-weight: bold !important; }

					/* Page settings */
					@page {
						size: A4 landscape;
						margin: 8mm;
					}
				}
			</style>
			<div class="floating-actions">
				<button class="float-btn settings-btn" id="settings-btn"><i class="fa fa-cog"></i><span class="btn-tooltip">إعدادات التقرير</span></button>
				<button class="float-btn reload-btn" id="reload-btn"><i class="fa fa-refresh"></i><span class="btn-tooltip">تحديث التقرير</span></button>
				<button class="float-btn print-btn" id="print-btn"><i class="fa fa-print"></i><span class="btn-tooltip">طباعة PDF</span></button>
			</div>
			<div class="customer-analysis-report">
				<div id="report-content">
					<div class="empty-box">
						<h4>تقرير تحليل العملاء</h4>
						<p>اضغط على زر الإعدادات لتحديد معايير البحث</p>
					</div>
				</div>
			</div>
		`);

		// Bind button events
		$('#settings-btn').off('click').on('click', () => this.show_settings_dialog());
		$('#reload-btn').off('click').on('click', () => this.generate_report());
		$('#print-btn').off('click').on('click', () => this.generate_pdf_and_print());
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

		$('#report-content').html(`<div class="loading-box"><div class="spinner"></div><div class="loading-txt">جاري تحميل البيانات...</div></div>`);

		frappe.call({
			method: 'expenses_management.expenses_management.page.customer_analysis_report.customer_analysis_report.get_report_data',
			args: filters,
			callback: (r) => {
				if (r.message && r.message.customers && r.message.customers.length > 0) {
					this.data = r.message;
					this.render_report(r.message);
				} else {
					$('#report-content').html(`<div class="empty-box"><h4>لا توجد بيانات</h4><p>لا يوجد عملاء للفلاتر المحددة</p></div>`);
				}
			},
			error: () => {
				$('#report-content').html(`<div class="empty-box"><h4>خطأ في تحميل البيانات</h4><p>يرجى المحاولة مرة أخرى</p></div>`);
			}
		});
	}

	render_report(data) {
		// Calculate period days for use in customer cards
		const filters = data.filters || {};
		const periodFromDate = new Date(filters.from_date);
		const periodToDate = new Date(filters.to_date);
		this.periodDays = Math.ceil((periodToDate - periodFromDate) / (1000 * 60 * 60 * 24)) + 1;

		let sortedCustomers = this.sort_customers(data.customers);
		let html = this.render_summary_header(data);
		sortedCustomers.forEach((c, idx) => { html += this.render_customer_card(c, idx); });
		$('#report-content').html(html);
		$('.items-toggle').off('click').on('click', function() {
			$(this).toggleClass('open');
			$(this).next('.items-panel').toggleClass('show');
		});
	}

	render_summary_header(data) {
		const totals = data.totals || {};
		const filters = data.filters || {};
		const periodFromDate = new Date(filters.from_date);
		const periodToDate = new Date(filters.to_date);
		const periodDays = Math.ceil((periodToDate - periodFromDate) / (1000 * 60 * 60 * 24)) + 1;

		let filterTags = `
			<div class="filter-tag">
				<i class="fa fa-calendar"></i>
				<span class="filter-label">الفترة:</span>
				<span class="filter-value">${filters.from_date || ''} - ${filters.to_date || ''}</span>
				<span class="period-days-badge">${periodDays} يوم</span>
			</div>
		`;
		if (filters.company) filterTags += `<div class="filter-tag"><i class="fa fa-building"></i><span class="filter-label">الشركة:</span><span class="filter-value">${filters.company}</span></div>`;
		if (filters.branch) filterTags += `<div class="filter-tag"><i class="fa fa-code-fork"></i><span class="filter-label">الفرع:</span><span class="filter-value">${filters.branch}</span></div>`;
		if (filters.customer) filterTags += `<div class="filter-tag"><i class="fa fa-user"></i><span class="filter-label">العميل:</span><span class="filter-value">${filters.customer}</span></div>`;
		if (filters.customer_group) filterTags += `<div class="filter-tag"><i class="fa fa-users"></i><span class="filter-label">مجموعة العملاء:</span><span class="filter-value">${filters.customer_group}</span></div>`;
		if (filters.territory) filterTags += `<div class="filter-tag"><i class="fa fa-map-marker"></i><span class="filter-label">المنطقة:</span><span class="filter-value">${filters.territory}</span></div>`;
		if (filters.sales_person) filterTags += `<div class="filter-tag"><i class="fa fa-id-badge"></i><span class="filter-label">المندوب:</span><span class="filter-value">${filters.sales_person}</span></div>`;
		if (filters.pos_profile) filterTags += `<div class="filter-tag"><i class="fa fa-desktop"></i><span class="filter-label">نقطة البيع:</span><span class="filter-value">${filters.pos_profile}</span></div>`;

		return `
			<div class="summary-header">
				<div class="summary-title-row">
					<div class="summary-title"><i class="fa fa-bar-chart"></i>تقرير تحليل العملاء</div>
					<div class="summary-filters">${filterTags}</div>
				</div>
				<div class="summary-metrics">
					<div class="summary-metric-box"><div class="summary-metric-lbl">عملاء</div><div class="summary-metric-val">${totals.total_customers || 0}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">فواتير</div><div class="summary-metric-val">${totals.invoice_count_period || 0}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">الوزن (طن)</div><div class="summary-metric-val">${this.num(totals.total_weight_tons, 2)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">أصناف</div><div class="summary-metric-val">${totals.unique_items_count || 0}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">المشتريات</div><div class="summary-metric-val">${this.fmt(totals.total_purchase_period)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">الرصيد</div><div class="summary-metric-val">${this.fmt(totals.total_balance)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">المستحق</div><div class="summary-metric-val ${(totals.total_due || 0) > 0 ? 'neg' : ''}">${this.fmt(totals.total_due)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">الأرباح</div><div class="summary-metric-val ${(totals.revenue_period || 0) >= 0 ? 'pos' : 'neg'}">${this.fmt(totals.revenue_period)}${totals.total_purchase_period > 0 ? ` <span class="metric-pct ${(totals.revenue_period || 0) >= 0 ? 'pct-pos' : 'pct-neg'}">${this.num((totals.revenue_period / totals.total_purchase_period) * 100, 1)}%</span>` : ''}</div></div>
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

	render_customer_card(c, idx) {
		let dataDays = 0;
		if (c.credit_days && c.credit_days > 0) {
			dataDays = c.credit_days;
		} else if (c.first_invoice_date) {
			const firstDate = new Date(c.first_invoice_date);
			const today = new Date();
			dataDays = Math.ceil((today - firstDate) / (1000 * 60 * 60 * 24));
		}

		return `
			<div class="customer-card" style="animation-delay: ${idx * 0.05}s" data-customer-name="${c.customer || ''} - ${c.customer_name || ''}">
				<div class="customer-card-header">
					<div class="customer-main-info">
						<span class="customer-name">${c.customer || ''} - ${c.customer_name || ''}</span>
					</div>
					<div class="header-stats">
						<span class="hstat"><i class="fa fa-file-text"></i> عدد الفواتير الكلي: ${c.invoice_count_all_time || 0}</span>
						<span class="hstat"><i class="fa fa-file-text-o"></i> فواتير الفترة: ${c.invoice_count_period || 0}</span>
						<span class="hstat"><i class="fa fa-balance-scale"></i> الوزن الكلي: ${this.num(c.total_weight_tons, 2)} طن</span>
						<span class="hstat"><i class="fa fa-cubes"></i> عدد الأصناف: ${c.unique_items_count || 0}</span>
						${c.top_item_group ? `<span class="hstat top-group"><i class="fa fa-star"></i> الأكثر شراءً: ${c.top_item_group}</span>` : ''}
					</div>
				</div>
				<div class="customer-info-bar">
					<div class="info-item"><i class="fa fa-calendar"></i><span class="info-label">آخر فاتورة:</span><span class="info-value">${c.last_invoice_date || '-'}</span></div>
					<div class="info-item last-inv">
						<i class="fa fa-money"></i>
						<span class="info-label">مبلغ آخر فاتورة:</span>
						<span class="info-value">${this.fmt(c.last_invoice_amount)}</span>
						<span class="info-profit ${(c.last_invoice_profit || 0) >= 0 ? 'profit-pos' : 'profit-neg'}">
							<i class="fa ${(c.last_invoice_profit || 0) >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
							${this.fmt(Math.abs(c.last_invoice_profit))}
						</span>
					</div>
					<div class="info-item credit-limit"><i class="fa fa-credit-card"></i><span class="info-label">حد الائتمان:</span><span class="info-value">${this.fmt(c.credit_limit)}</span></div>
					${c.credit_days && c.credit_days > 0 ? `<div class="info-item credit-days-info"><i class="fa fa-clock-o"></i><span class="info-label">أيام الائتمان:</span><span class="info-value">${c.credit_days} يوم</span></div>` : ''}
				</div>
				<div class="metrics-row">
					<div class="metric-box"><div class="metric-lbl">إجمالي المشتريات <span class="days-badge">${dataDays > 0 ? dataDays + ' يوم' : 'الكل'}</span></div><div class="metric-val">${this.fmt(c.total_purchase_all_time)}</div></div>
					<div class="metric-box"><div class="metric-lbl">مشتريات الفترة <span class="days-badge period">${this.periodDays} يوم</span></div><div class="metric-val">${this.fmt(c.total_purchase_period)}</div></div>
					<div class="metric-box"><div class="metric-lbl">الرصيد</div><div class="metric-val">${this.fmt(c.total_balance)}</div></div>
					<div class="metric-box"><div class="metric-lbl">المستحق</div><div class="metric-val ${(c.total_due || 0) > 0 ? 'neg' : ''}">${this.fmt(c.total_due)}</div></div>
					<div class="metric-box credit-remain-box ${Math.max(0, (c.credit_limit || 0) - (c.total_balance || 0)) <= 0 ? 'zero-credit' : ''}"><div class="metric-lbl">المتبقي من الائتمان</div><div class="metric-val">${this.fmt(Math.max(0, (c.credit_limit || 0) - (c.total_balance || 0)))}</div></div>
					<div class="metric-box"><div class="metric-lbl">أرباح الفترة <span class="days-badge period">${c.credit_days > 0 ? c.credit_days + ' يوم' : this.periodDays + ' يوم'}</span></div><div class="metric-val ${(c.revenue_period || 0) >= 0 ? 'pos' : 'neg'}">${this.fmt(c.revenue_period)}${c.total_purchase_period > 0 ? ` <span class="metric-pct ${(c.revenue_period || 0) >= 0 ? 'pct-pos' : 'pct-neg'}">${this.num((c.revenue_period / c.total_purchase_period) * 100, 1)}%</span>` : ''}</div></div>
					<div class="metric-box returns-box"><div class="metric-lbl">المرتجعات <span class="days-badge period">${c.credit_days > 0 ? c.credit_days + ' يوم' : this.periodDays + ' يوم'}</span></div><div class="metric-val-with-count"><span class="neg">${this.fmt(c.total_returns_period)}</span><span class="return-count">${c.return_count_period || 0} فاتورة</span></div></div>
				</div>
				<div class="items-wrapper">
					<div class="items-toggle">
						<div class="items-title">
							<span class="toggle-label">تفاصيل الفواتير</span>
							<span class="toggle-counts">
								<span class="count-badge invoices"><i class="fa fa-file-text-o"></i> ${c.invoice_count_period || 0} فاتورة</span>
								<span class="count-badge items"><i class="fa fa-cubes"></i> ${(c.items || []).length} صنف</span>
							</span>
						</div>
						<i class="fa fa-chevron-down toggle-icon"></i>
					</div>
					<div class="items-panel">${this.render_items_table(c.items)}</div>
				</div>
			</div>
		`;
	}

	render_items_table(items) {
		if (!items || items.length === 0) return `<div class="empty-box" style="padding:30px;"><p>لا توجد أصناف</p></div>`;

		let rows = items.map(i => {
			const stk = (i.current_stock || 0) > 100 ? 'hi' : ((i.current_stock || 0) > 20 ? 'md' : 'lo');
			const revCls = (i.revenue || 0) >= 0 ? 'val-pos' : 'val-neg';
			const invoiceRate = i.total_amount && i.qty ? (i.total_amount / i.qty) : 0;
			const profitPct = i.total_amount && i.total_amount > 0 ? ((i.revenue || 0) / i.total_amount * 100) : 0;
			const profitPctCls = profitPct >= 0 ? 'pct-pos' : 'pct-neg';

			return `
				<tr>
					<td><a href="/app/sales-invoice/${i.invoice_id}" class="inv-link" target="_blank">${i.invoice_id || ''}</a></td>
					<td class="date-cell">${i.posting_date || ''}</td>
					<td><div class="item-code">${i.item_code || ''}</div><div class="item-name">${i.item_name || ''}</div></td>
					<td><div class="qty-cell"><span class="qty-main">${this.num(i.qty, 2)}</span><span class="qty-uom">${i.invoice_uom || ''}</span></div></td>
					<td class="weight-cell">${this.num(i.weight_in_tons, 3)} طن</td>
					<td><div class="rate-cell"><span class="rate-invoice">${this.fmt(invoiceRate)}/${i.invoice_uom || ''}</span><span class="rate-ton">${this.fmt(i.rate_per_ton)}/طن</span></div></td>
					<td class="amount-cell">${this.fmt(i.total_amount)}</td>
					<td class="cost-cell">${this.fmt(i.cost_of_goods)}</td>
					<td><div class="profit-cell"><span class="${revCls}">${this.fmt(i.revenue)}</span><span class="profit-pct ${profitPctCls}">${this.num(profitPct, 1)}%</span></div></td>
					<td><div class="stock-cell"><span class="stock-dot ${stk}"></span><span class="stock-val">${this.num(i.current_stock, 0)}</span></div></td>
					<td><div class="branch-user-cell"><span class="branch-name">${i.invoice_branch || '-'}</span><span class="creator-name">${i.invoice_creator || '-'}</span></div></td>
				</tr>
			`;
		}).join('');

		return `
			<div class="items-scroll">
				<table class="items-tbl">
					<thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>الوزن</th><th>السعر</th><th>المبلغ</th><th>التكلفة</th><th>الربح</th><th>المخزون</th><th>الفرع / المستخدم</th></tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>
		`;
	}

	generate_pdf_and_print() {
		if (!this.data || !this.data.customers || this.data.customers.length === 0) {
			frappe.msgprint({ title: __('تنبيه'), indicator: 'orange', message: __('لا توجد بيانات لطباعتها') });
			return;
		}

		// Generate clean HTML for PDF
		const filters = this.data.filters || {};
		const periodFromDate = new Date(filters.from_date);
		const periodToDate = new Date(filters.to_date);
		const periodDays = Math.ceil((periodToDate - periodFromDate) / (1000 * 60 * 60 * 24)) + 1;

		// Calculate totals from customers data
		const totals = {
			total_customers: this.data.customers.length,
			invoice_count_period: 0,
			total_weight_tons: 0,
			unique_items_count: 0,
			total_purchase_all_time: 0,
			total_purchase_period: 0,
			total_balance: 0,
			total_due: 0,
			revenue_all_time: 0,
			revenue_period: 0
		};

		this.data.customers.forEach(c => {
			totals.invoice_count_period += c.invoice_count_period || 0;
			totals.total_weight_tons += c.total_weight_tons || 0;
			totals.unique_items_count += c.unique_items_count || 0;
			totals.total_purchase_all_time += c.total_purchase_all_time || 0;
			totals.total_purchase_period += c.total_purchase_period || 0;
			totals.total_balance += c.total_balance || 0;
			totals.total_due += c.total_due || 0;
			totals.revenue_all_time += c.revenue_all_time || 0;
			totals.revenue_period += c.revenue_period || 0;
		});

		let html = `
			<!DOCTYPE html>
			<html dir="rtl" lang="ar">
			<head>
				<meta charset="UTF-8">
				<title>تقرير تحليل العملاء</title>
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 16px; direction: rtl; padding: 15px; background: #fff; color: #000; }
					h1 { text-align: center; font-size: 24px; font-weight: 900; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 3px solid #000; }
					.filters-row { text-align: center; margin-bottom: 12px; font-size: 14px; font-weight: 800; }
					.filters-row span { margin: 0 10px; }
					.summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
					.summary-box { border: 2px solid #000; padding: 8px 6px; text-align: center; background: #f5f5f5; }
					.summary-box .s-lbl { font-size: 11px; font-weight: 800; color: #444; display: block; margin-bottom: 4px; }
					.summary-box .s-val { font-size: 15px; font-weight: 900; color: #000; }
					.customer-section { margin-bottom: 14px; page-break-inside: avoid; border: 2px solid #000; }
					.customer-header { width: 100%; border-collapse: collapse; background: #e5e5e5; }
					.customer-header td { padding: 6px 8px; font-weight: 900; border: 1px solid #999; text-align: center; }
					.customer-header .cust-name { font-size: 14px; text-align: right; background: #d0d0d0; }
					.customer-header .cust-stat .lbl { color: #555; font-size: 10px; display: block; }
					.customer-header .cust-stat .val { color: #000; font-weight: 900; font-size: 13px; }
					.customer-header .cust-stat.highlight { background: #fff3cd; }
					.customer-header .cust-stat.danger { background: #f8d7da; }
					.customer-header .cust-stat.success { background: #d4edda; }
					.items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
					.items-table th { background: #ddd; padding: 6px 4px; text-align: center; font-weight: 900; font-size: 12px; border: 2px solid #000; }
					.items-table td { border: 1px solid #888; padding: 5px 4px; text-align: center; font-weight: 700; }
					.items-table tbody tr:nth-child(even) { background: #f0f0f0; }
					.items-table .idx { background: #e5e5e5; font-weight: 900; width: 30px; font-size: 13px; }
					.neg { font-weight: 900; color: #c00; }
					.pct-badge { display: inline-block; font-size: 12px; font-weight: 900; padding: 3px 8px; border-radius: 6px; margin-right: 4px; }
					.pct-badge.pct-pos { background: #d4edda; color: #155724; border: 2px solid #28a745; }
					.pct-badge.pct-neg { background: #f8d7da; color: #721c24; border: 2px solid #dc3545; }
					@media print {
						body { padding: 6mm; font-size: 14px; }
						.customer-section { page-break-inside: avoid; }
						.items-table { font-size: 12px; }
						.items-table th { font-size: 11px; }
						@page { size: A4 landscape; margin: 8mm; }
					}
				</style>
			</head>
			<body>
				<h1>تقرير تحليل العملاء</h1>
				<div class="filters-row">
					<span>الفترة: <strong>${filters.from_date || ''} - ${filters.to_date || ''} (${periodDays} يوم)</strong></span>
					${filters.company ? `<span>الشركة: <strong>${filters.company}</strong></span>` : ''}
					${filters.branch ? `<span>الفرع: <strong>${filters.branch}</strong></span>` : ''}
					${filters.customer ? `<span>العميل: <strong>${filters.customer}</strong></span>` : ''}
				</div>
				<div class="summary-grid">
					<div class="summary-box"><span class="s-lbl">عملاء</span><span class="s-val">${totals.total_customers || 0}</span></div>
					<div class="summary-box"><span class="s-lbl">فواتير (${periodDays} يوم)</span><span class="s-val">${totals.invoice_count_period || 0}</span></div>
					<div class="summary-box"><span class="s-lbl">الوزن (طن)</span><span class="s-val">${this.num(totals.total_weight_tons, 2)}</span></div>
					<div class="summary-box"><span class="s-lbl">أصناف</span><span class="s-val">${totals.unique_items_count || 0}</span></div>
					<div class="summary-box"><span class="s-lbl">إجمالي المشتريات</span><span class="s-val">${this.fmt(totals.total_purchase_all_time)}</span></div>
					<div class="summary-box"><span class="s-lbl">مشتريات الفترة (${periodDays} يوم)</span><span class="s-val">${this.fmt(totals.total_purchase_period)}</span></div>
					<div class="summary-box"><span class="s-lbl">الرصيد</span><span class="s-val">${this.fmt(totals.total_balance)}</span></div>
					<div class="summary-box"><span class="s-lbl">المستحق</span><span class="s-val">${this.fmt(totals.total_due)}</span></div>
					<div class="summary-box"><span class="s-lbl">أرباح كلي</span><span class="s-val">${this.fmt(totals.revenue_all_time)}</span></div>
					<div class="summary-box"><span class="s-lbl">أرباح الفترة (${periodDays} يوم)</span><span class="s-val">${this.fmt(totals.revenue_period)}</span></div>
				</div>
		`;

		// Add each customer
		this.data.customers.forEach((c, custIdx) => {
			const creditDays = c.credit_days || 0;
			const creditLimit = c.credit_limit || 0;
			const creditRemaining = creditLimit - (c.total_balance || 0);
			const remainingClass = creditRemaining < 0 ? 'danger' : (creditRemaining < creditLimit * 0.2 ? 'highlight' : 'success');
			const lastInvDate = c.last_invoice_date || '-';

			html += `
				<div class="customer-section">
					<table class="customer-header">
						<tr>
							<td class="cust-name" colspan="2">${custIdx + 1}. ${c.customer || ''} - ${c.customer_name || ''}</td>
							<td class="cust-stat"><span class="lbl">أيام الائتمان</span><span class="val">${creditDays} يوم</span></td>
							<td class="cust-stat highlight"><span class="lbl">حد الائتمان</span><span class="val">${this.fmt(creditLimit)}</span></td>
							<td class="cust-stat ${remainingClass}"><span class="lbl">المتبقي من الحد</span><span class="val">${this.fmt(creditRemaining)}</span></td>
							<td class="cust-stat"><span class="lbl">آخر فاتورة</span><span class="val">${lastInvDate}</span></td>
							<td class="cust-stat"><span class="lbl">فواتير</span><span class="val">${c.invoice_count_period || 0}</span></td>
						</tr>
						<tr>
							<td class="cust-stat"><span class="lbl">إجمالي المشتريات</span><span class="val">${this.fmt(c.total_purchase_all_time)}</span></td>
							<td class="cust-stat"><span class="lbl">مشتريات الفترة</span><span class="val">${this.fmt(c.total_purchase_period)}</span></td>
							<td class="cust-stat"><span class="lbl">الرصيد</span><span class="val">${this.fmt(c.total_balance)}</span></td>
							<td class="cust-stat ${(c.total_due || 0) > 0 ? 'danger' : ''}"><span class="lbl">المستحق</span><span class="val">${this.fmt(c.total_due)}</span></td>
							<td class="cust-stat"><span class="lbl">ربح كلي</span><span class="val">${this.fmt(c.revenue_all_time)}</span></td>
							<td class="cust-stat"><span class="lbl">ربح الفترة</span><span class="val">${this.fmt(c.revenue_period)}</span></td>
							<td class="cust-stat"><span class="lbl">الوزن (طن)</span><span class="val">${this.num(c.total_weight_tons, 2)}</span></td>
						</tr>
					</table>
					<table class="items-table">
						<thead><tr><th>#</th><th>الفاتورة</th><th>الصنف</th><th>الكمية</th><th>الوزن</th><th>السعر</th><th>المبلغ</th><th>التكلفة</th><th>الربح</th><th>الفرع</th><th>المستخدم</th></tr></thead>
						<tbody>
			`;

			if (c.items && c.items.length > 0) {
				c.items.forEach((i, idx) => {
					const invoiceRate = i.qty && i.qty !== 0 ? (i.total_amount / i.qty) : 0;
					const profitPct = i.total_amount && i.total_amount !== 0 ? ((i.revenue / i.total_amount) * 100) : 0;
					html += `
						<tr>
							<td class="idx">${idx + 1}</td>
							<td>${i.invoice_id || ''}</td>
							<td>${i.item_code || ''}</td>
							<td>${this.num(i.qty, 2)} ${i.invoice_uom || ''}</td>
							<td>${this.num(i.weight_in_tons, 3)}</td>
							<td>${this.fmt(invoiceRate)}</td>
							<td>${this.fmt(i.total_amount)}</td>
							<td>${this.fmt(i.cost_of_goods)}</td>
							<td><span style="font-weight:900;">${this.fmt(i.revenue)}</span> <span class="pct-badge ${profitPct >= 0 ? 'pct-pos' : 'pct-neg'}">${this.num(profitPct, 1)}%</span></td>
							<td>${i.invoice_branch || '-'}</td>
							<td>${i.invoice_creator || '-'}</td>
						</tr>
					`;
				});
			}

			html += `
						</tbody>
					</table>
				</div>
			`;
		});

		html += `
			</body>
			</html>
		`;

		// Open in new window and print
		const printWindow = window.open('', '_blank', 'width=1200,height=800');
		printWindow.document.write(html);
		printWindow.document.close();

		printWindow.onload = function() {
			setTimeout(() => {
				printWindow.print();
			}, 300);
		};
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
