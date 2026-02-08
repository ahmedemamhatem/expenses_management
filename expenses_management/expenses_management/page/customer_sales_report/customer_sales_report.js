frappe.pages['customer-sales-report'].on_page_load = function(wrapper) {
	new CustomerSalesReport(wrapper);
}

class CustomerSalesReport {
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
			use_credit_days: true,
			payment_status: ''
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
					label: __('حالة السداد'), fieldname: 'payment_status', fieldtype: 'Select',
					options: [
						{ value: '', label: 'الكل' },
						{ value: 'not_paid', label: 'غير مسددة' },
						{ value: 'paid', label: 'مسددة' }
					],
					default: me.filters.payment_status
				},
				{ fieldtype: 'Column Break' },
				{
					label: __('ترتيب حسب'), fieldname: 'sort_by', fieldtype: 'Select',
					options: [
						{ value: 'total_purchase_period', label: 'المبيعات في الفترة' },
						{ value: 'total_purchase_all_time', label: 'إجمالي المبيعات' },
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
				me.filters.use_credit_days = true;
				me.settings_dialog.hide();
				me.generate_report();
			}
		});

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
				let currentQuarter = Math.floor(d.getMonth() / 3);
				let lastQuarterStart = new Date(d.getFullYear(), (currentQuarter - 1) * 3, 1);
				if (currentQuarter === 0) {
					lastQuarterStart = new Date(d.getFullYear() - 1, 9, 1);
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

				.customer-sales-report {
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
				.customer-sales-report * {
					font-weight: inherit;
				}
				#report-content { width: 100%; font-weight: 900; }

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
				.summary-metric-box:nth-child(1) { animation-delay: 0.05s; border-color: rgba(99, 102, 241, 0.5); background: linear-gradient(145deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.05) 100%); }
				.summary-metric-box:nth-child(2) { animation-delay: 0.1s; border-color: rgba(37, 99, 235, 0.5); background: linear-gradient(145deg, rgba(37, 99, 235, 0.2) 0%, rgba(37, 99, 235, 0.05) 100%); }
				.summary-metric-box:nth-child(3) { animation-delay: 0.15s; border-color: rgba(16, 185, 129, 0.5); background: linear-gradient(145deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%); }
				.summary-metric-box:nth-child(4) { animation-delay: 0.2s; border-color: rgba(245, 158, 11, 0.5); background: linear-gradient(145deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.05) 100%); }
				.summary-metric-box:nth-child(5) { animation-delay: 0.25s; border-color: rgba(139, 92, 246, 0.5); background: linear-gradient(145deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.05) 100%); }
				.summary-metric-box:nth-child(6) { animation-delay: 0.3s; border-color: rgba(236, 72, 153, 0.5); background: linear-gradient(145deg, rgba(236, 72, 153, 0.2) 0%, rgba(236, 72, 153, 0.05) 100%); }
				.summary-metric-box:nth-child(7) { animation-delay: 0.35s; border-color: rgba(220, 38, 38, 0.5); background: linear-gradient(145deg, rgba(220, 38, 38, 0.2) 0%, rgba(220, 38, 38, 0.05) 100%); }
				.summary-metric-box:hover {
					background: linear-gradient(145deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
					transform: translateY(-5px) scale(1.02);
					box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
				}
				.summary-metric-lbl { font-size: 14px; color: #cbd5e1; font-weight: 800; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
				.summary-metric-val { font-size: 22px; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
				.summary-metric-box:nth-child(1) .summary-metric-val { color: #a5b4fc; }
				.summary-metric-box:nth-child(2) .summary-metric-val { color: #93c5fd; }
				.summary-metric-box:nth-child(3) .summary-metric-val { color: #6ee7b7; }
				.summary-metric-box:nth-child(4) .summary-metric-val { color: #fcd34d; }
				.summary-metric-box:nth-child(5) .summary-metric-val { color: #c4b5fd; }
				.summary-metric-box:nth-child(6) .summary-metric-val { color: #f9a8d4; }
				.summary-metric-box:nth-child(7) .summary-metric-val { color: #fca5a5; }
				.summary-metric-val.neg { color: #fca5a5 !important; }

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
				.metric-box:nth-child(5) { border-color: #fca5a5; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%); animation-delay: 0.25s; }
				.metric-box:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 6px 15px rgba(0,0,0,0.1); }
				.metric-lbl { font-size: 13px; font-weight: 900; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
				.metric-box:nth-child(1) .metric-lbl { color: #4f46e5; }
				.metric-box:nth-child(2) .metric-lbl { color: #2563eb; }
				.metric-box:nth-child(3) .metric-lbl { color: #059669; }
				.metric-box:nth-child(4) .metric-lbl { color: #dc2626; }
				.metric-box:nth-child(5) .metric-lbl { color: #dc2626; }
				.metric-val { font-size: 18px; font-weight: 900; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
				.metric-box:nth-child(1) .metric-val { color: #4f46e5; }
				.metric-box:nth-child(2) .metric-val { color: #2563eb; }
				.metric-box:nth-child(3) .metric-val { color: #059669; }
				.metric-box:nth-child(4) .metric-val { color: #dc2626; }
				.metric-box:nth-child(5) .metric-val { color: #dc2626; }
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
				.metric-box.returns-box { border-color: #fca5a5 !important; background: linear-gradient(135deg, #fef2f2 0%, #fff 100%) !important; }
				.metric-box.returns-box .metric-lbl { color: #dc2626 !important; }
				.metric-box.balance-credit-box { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-color: #0ea5e9; }
				.metric-val-dual { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
				.metric-val-dual .dual-row { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.5); }
				.metric-val-dual .dual-row .dual-lbl { font-size: 10px; font-weight: 700; color: #64748b; white-space: nowrap; }
				.metric-val-dual .dual-row .balance-val { font-size: 14px; font-weight: 900; color: #0369a1; }
				.metric-val-dual .dual-row.credit-row { background: rgba(5, 150, 105, 0.08); }
				.metric-val-dual .dual-row.credit-row .credit-remain-val { font-size: 13px; font-weight: 800; color: #059669; }
				.metric-val-dual .dual-row.credit-row.zero-credit { background: rgba(220, 38, 38, 0.08); }
				.metric-val-dual .dual-row.credit-row.zero-credit .dual-lbl { color: #dc2626; }
				.metric-val-dual .dual-row.credit-row.zero-credit .credit-remain-val { color: #dc2626; }
				.metric-val-dual .dual-row.overdue-row { background: rgba(245, 158, 11, 0.08); }
				.metric-val-dual .dual-row.overdue-row .dual-lbl { color: #b45309; }
				.metric-val-dual .dual-row.overdue-row .overdue-val { font-size: 13px; font-weight: 800; color: #b45309; }
				.metric-val-dual .dual-row.overdue-row.has-overdue { background: rgba(220, 38, 38, 0.1); }
				.metric-val-dual .dual-row.overdue-row.has-overdue .dual-lbl { color: #dc2626; }
				.metric-val-dual .dual-row.overdue-row.has-overdue .overdue-val { color: #dc2626; }
				.metric-val-with-count { display: flex; flex-direction: column; align-items: center; gap: 3px; }
				.metric-val-with-count span:first-child { font-size: 16px; font-weight: 900; }
				.return-count { font-size: 10px; font-weight: 800; color: #64748b; background: rgba(100, 116, 139, 0.15); padding: 3px 8px; border-radius: 8px; }

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
				.stock-cell { display: flex; align-items: center; justify-content: center; gap: 10px; }
				.stock-dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.2); animation: pulse 2s ease-in-out infinite; }
				.stock-dot.hi { background: linear-gradient(135deg, #10b981, #059669); }
				.stock-dot.md { background: linear-gradient(135deg, #f59e0b, #d97706); }
				.stock-dot.lo { background: linear-gradient(135deg, #ef4444, #dc2626); }
				.stock-val { font-weight: 900; color: #1e293b; font-size: 18px; }
				.branch-user-cell { display: flex; flex-direction: column; gap: 5px; align-items: center; }
				.branch-name { font-size: 15px; font-weight: 800; color: #7c3aed; background: rgba(124, 58, 237, 0.1); padding: 4px 12px; border-radius: 6px; }
				.creator-name { font-size: 13px; font-weight: 600; color: #64748b; }

				/* ===== INVOICE GROUP ROWS ===== */
				.invoices-scroll { max-height: 500px; overflow-y: auto; overflow-x: auto; }
				.invoices-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
				.invoices-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 5px; }
				.invoices-scroll::-webkit-scrollbar-thumb { background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 5px; }
				.invoices-tbl { width: 100%; border-collapse: collapse; font-size: 16px; }
				.invoices-tbl th {
					background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
					color: #fff; font-weight: 900; padding: 14px 12px; text-align: center;
					font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px;
					position: sticky; top: 0; z-index: 10; border-bottom: 4px solid #6366f1;
				}
				.invoices-tbl td { padding: 12px 10px; text-align: center; border-bottom: 1px solid #e5e7eb; font-weight: 900; color: #1e293b; font-size: 15px; }
				.invoices-tbl tbody tr.invoice-row { transition: all 0.3s ease; cursor: pointer; }
				.invoices-tbl tbody tr.invoice-row:nth-child(4n+1) { background: #fff; }
				.invoices-tbl tbody tr.invoice-row:nth-child(4n+3) { background: #f8fafc; }
				.invoices-tbl tbody tr.invoice-row:hover { background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%); }
				.invoices-tbl tbody tr.invoice-row.expanded { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); }
				.invoices-tbl tbody tr.invoice-row.expanded td { color: #fff; }
				.invoices-tbl tbody tr.invoice-row.expanded .inv-link { background: linear-gradient(135deg, #10b981, #059669); }
				.invoices-tbl tbody tr.invoice-row.expanded .date-cell { color: #a5b4fc; }
				.invoices-tbl tbody tr.invoice-row.expanded .weight-cell { color: #c4b5fd; }
				.invoices-tbl tbody tr.invoice-row.expanded .amount-cell { color: #93c5fd; }
				.invoices-tbl tbody tr.invoice-row.expanded .items-count-badge { background: rgba(16, 185, 129, 0.3); color: #6ee7b7; }
				.invoices-tbl tbody tr.invoice-row.expanded .branch-name { background: rgba(139, 92, 246, 0.3); color: #c4b5fd; }
				.invoices-tbl tbody tr.invoice-row.expanded .creator-name { color: #94a3b8; }
				.invoices-tbl tbody tr.invoice-row.expanded .payment-cell .payment-pct-text { color: #e2e8f0; }
				.invoices-tbl tbody tr.invoice-row.expanded .payment-cell .payment-progress-bg { background: rgba(255,255,255,0.15); }
				.invoices-tbl tbody tr.invoice-row.expanded .payment-cell .payment-progress-fill.pay-full { background: linear-gradient(90deg, #6ee7b7, #34d399); }
				.invoices-tbl tbody tr.invoice-row.expanded .payment-cell .payment-progress-fill.pay-partial { background: linear-gradient(90deg, #fcd34d, #fbbf24); }
				.invoices-tbl tbody tr.invoice-row.expanded .payment-cell .payment-progress-fill.pay-none { background: linear-gradient(90deg, #fca5a5, #f87171); }
				.expand-cell { width: 40px; }
				.expand-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; transition: all 0.3s ease; }
				.expand-icon i { font-size: 14px; transition: transform 0.3s ease; }
				.invoice-row.expanded .expand-icon { background: linear-gradient(135deg, #10b981, #059669); }
				.invoice-row.expanded .expand-icon i { transform: rotate(45deg); }
				.items-count-badge { background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #065f46; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: 800; }

				/* Payment Percent */
				.payment-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 90px; }
				.payment-pct-text { font-size: 14px; font-weight: 900; }
				.payment-pct-text.pay-full { color: #059669; }
				.payment-pct-text.pay-partial { color: #d97706; }
				.payment-pct-text.pay-none { color: #dc2626; }
				.payment-progress-bg { width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
				.payment-progress-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
				.payment-progress-fill.pay-full { background: linear-gradient(90deg, #10b981, #059669); }
				.payment-progress-fill.pay-partial { background: linear-gradient(90deg, #f59e0b, #d97706); }
				.payment-progress-fill.pay-none { background: linear-gradient(90deg, #ef4444, #dc2626); }

				.invoice-items-row { background: #f8fafc; }
				.invoice-items-container { padding: 0 !important; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); }
				.invoice-items-tbl { width: 100%; border-collapse: collapse; font-size: 14px; margin: 0; }
				.invoice-items-tbl th {
					background: linear-gradient(135deg, #475569 0%, #334155 100%);
					color: #fff; font-weight: 800; padding: 10px 8px; text-align: center;
					font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px;
				}
				.invoice-items-tbl td { padding: 10px 8px; text-align: center; border-bottom: 1px solid #cbd5e1; font-weight: 800; color: #1e293b; font-size: 14px; background: #fff; }
				.invoice-items-tbl tbody tr:nth-child(even) td { background: #f8fafc; }
				.invoice-items-tbl tbody tr:hover td { background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%); }

				.empty-box { text-align: center; padding: 100px 20px; animation: fadeIn 0.5s ease-out; }
				.empty-box h4 { font-size: 24px; font-weight: 700; color: #6366f1; margin-bottom: 12px; }
				.empty-box p { color: #9ca3af; font-size: 15px; }
				.loading-box { display: flex; align-items: center; justify-content: center; padding: 120px; flex-direction: column; gap: 25px; }
				.spinner { width: 50px; height: 50px; border: 4px solid #e0e7ff; border-top: 4px solid #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; }
				.loading-txt { color: #6b7280; font-size: 15px; font-weight: 600; }

				@media (max-width: 1400px) { .summary-metrics { grid-template-columns: repeat(4, 1fr); } }
				@media (max-width: 1200px) { .metrics-row { grid-template-columns: repeat(3, 1fr); } .customer-info-bar { justify-content: center; } }
				@media (max-width: 992px) { .summary-metrics { grid-template-columns: repeat(4, 1fr); } }
				@media (max-width: 768px) {
					.metrics-row { grid-template-columns: repeat(2, 1fr); }
					.summary-metrics { grid-template-columns: repeat(2, 1fr); }
					.summary-title-row { flex-direction: column; gap: 14px; align-items: flex-start; }
					.customer-card-header { flex-direction: column; gap: 12px; }
					.customer-main-info { flex-direction: column; text-align: center; }
					.customer-info-bar { flex-direction: column; gap: 14px; align-items: flex-start; }
				}
				@media (max-width: 480px) { .metrics-row { grid-template-columns: 1fr 1fr; } .summary-metrics { grid-template-columns: repeat(2, 1fr); } }

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
					}
					.floating-actions,
					.navbar,
					.page-head,
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
					.qty-uom,
					.item-name,
					.creator-name,
					.days-badge,
					.days-tag,
					footer,
					.footer { display: none !important; visibility: hidden !important; height: 0 !important; }
					.customer-sales-report::before {
						content: 'تقرير مبيعات العملاء';
						display: block;
						text-align: center;
						font-size: 18pt;
						font-weight: bold;
						margin-bottom: 12px;
						padding: 8px;
						border-bottom: 3px solid #000;
					}
					.customer-card {
						page-break-inside: avoid;
						margin: 0 0 15px 0 !important;
						border: none !important;
						border-radius: 0 !important;
					}
					.items-panel { display: block !important; overflow: visible !important; }
					.items-scroll { max-height: none !important; overflow: visible !important; }
					.items-tbl th {
						background: #333 !important;
						color: #fff !important;
						font-weight: bold !important;
						padding: 8px 6px !important;
						border: 2px solid #000 !important;
					}
					.items-tbl td {
						padding: 6px 5px !important;
						border: 1px solid #333 !important;
						font-size: 11pt !important;
						color: #000 !important;
					}
					@page { size: A4 landscape; margin: 8mm; }
				}
			</style>
			<div class="floating-actions">
				<button class="float-btn settings-btn" id="settings-btn"><i class="fa fa-cog"></i><span class="btn-tooltip">إعدادات التقرير</span></button>
				<button class="float-btn reload-btn" id="reload-btn"><i class="fa fa-refresh"></i><span class="btn-tooltip">تحديث التقرير</span></button>
				<button class="float-btn print-btn" id="print-btn"><i class="fa fa-print"></i><span class="btn-tooltip">طباعة</span></button>
			</div>
			<div class="customer-sales-report">
				<div id="report-content">
					<div class="empty-box">
						<h4>تقرير مبيعات العملاء</h4>
						<p>اضغط على زر الإعدادات لتحديد معايير البحث</p>
					</div>
				</div>
			</div>
		`);

		$('#settings-btn').off('click').on('click', () => this.show_settings_dialog());
		$('#reload-btn').off('click').on('click', () => this.generate_report());
		$('#print-btn').off('click').on('click', () => window.print());
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
			method: 'expenses_management.expenses_management.page.customer_sales_report.customer_sales_report.get_report_data',
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

		$('.invoice-row').off('click').on('click', function(e) {
			if ($(e.target).closest('.inv-link').length) return;
			const $row = $(this);
			const $itemsRow = $row.next('.invoice-items-row');
			$row.toggleClass('expanded');
			$itemsRow.toggle();
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
		if (filters.payment_status) {
			const payLabels = {'paid': 'مسددة', 'not_paid': 'غير مسددة'};
			filterTags += `<div class="filter-tag"><i class="fa fa-money"></i><span class="filter-label">حالة السداد:</span><span class="filter-value">${payLabels[filters.payment_status] || filters.payment_status}</span></div>`;
		}

		return `
			<div class="summary-header">
				<div class="summary-title-row">
					<div class="summary-title"><i class="fa fa-bar-chart"></i>تقرير مبيعات العملاء</div>
					<div class="summary-filters">${filterTags}</div>
				</div>
				<div class="summary-metrics">
					<div class="summary-metric-box"><div class="summary-metric-lbl">عملاء</div><div class="summary-metric-val">${totals.total_customers || 0}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">فواتير</div><div class="summary-metric-val">${totals.invoice_count_period || 0}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">الوزن (طن)</div><div class="summary-metric-val">${this.num(totals.total_weight_tons, 2)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">أصناف</div><div class="summary-metric-val">${totals.unique_items_count || 0}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">المبيعات</div><div class="summary-metric-val">${this.fmt(totals.total_purchase_period)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">الرصيد</div><div class="summary-metric-val">${this.fmt(totals.total_balance)}</div></div>
					<div class="summary-metric-box"><div class="summary-metric-lbl">المستحق</div><div class="summary-metric-val ${(totals.total_due || 0) > 0 ? 'neg' : ''}">${this.fmt(totals.total_due)}</div></div>
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
					</div>
					<div class="info-item credit-limit"><i class="fa fa-credit-card"></i><span class="info-label">حد الائتمان:</span><span class="info-value">${this.fmt(c.credit_limit)}</span></div>
					${c.credit_days && c.credit_days > 0 ? `<div class="info-item credit-days-info"><i class="fa fa-clock-o"></i><span class="info-label">أيام الائتمان:</span><span class="info-value">${c.credit_days} يوم</span></div>` : ''}
				</div>
				<div class="metrics-row">
					<div class="metric-box"><div class="metric-lbl">إجمالي المبيعات <span class="days-badge">${dataDays > 0 ? dataDays + ' يوم' : '60 يوم'}</span></div><div class="metric-val">${this.fmt(c.total_purchase_all_time)}</div></div>
					<div class="metric-box"><div class="metric-lbl">مبيعات الفترة <span class="days-badge period">${this.periodDays} يوم</span></div><div class="metric-val">${this.fmt(c.total_purchase_period)}</div></div>
					<div class="metric-box balance-credit-box"><div class="metric-val-dual"><div class="dual-row"><span class="dual-lbl">الرصيد</span><span class="balance-val">${this.fmt(c.total_balance)}</span></div><div class="dual-row overdue-row ${(c.total_due || 0) > 0 ? 'has-overdue' : ''}"><span class="dual-lbl">المستحق</span><span class="overdue-val">${this.fmt(c.total_due)}</span></div><div class="dual-row credit-row ${Math.max(0, (c.credit_limit || 0) - (c.total_due || 0)) <= 0 ? 'zero-credit' : ''}"><span class="dual-lbl">المتبقي من الائتمان</span><span class="credit-remain-val">${this.fmt(Math.max(0, (c.credit_limit || 0) - (c.total_due || 0)))}</span></div></div></div>
					<div class="metric-box returns-box"><div class="metric-lbl">المرتجعات <span class="days-badge">${dataDays > 0 ? dataDays + ' يوم' : '60 يوم'}</span></div><div class="metric-val-with-count"><span class="neg">${this.fmt(c.total_returns_all_time)}</span><span class="return-count">${c.return_count_all_time || 0} فاتورة</span></div></div>
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
		if (!items || items.length === 0) return `<div class="empty-box" style="padding:30px;"><p>لا توجد فواتير</p></div>`;

		// Group items by invoice
		const invoicesMap = {};
		items.forEach(item => {
			const invId = item.invoice_id;
			if (!invoicesMap[invId]) {
				invoicesMap[invId] = {
					invoice_id: invId,
					posting_date: item.posting_date,
					invoice_branch: item.invoice_branch,
					invoice_creator: item.invoice_creator,
					invoice_grand_total: item.invoice_grand_total || 0,
					invoice_outstanding_amount: item.invoice_outstanding_amount || 0,
					items: [],
					total_amount: 0,
					total_weight_tons: 0,
					items_count: 0
				};
			}
			invoicesMap[invId].items.push(item);
			invoicesMap[invId].total_amount += item.total_amount || 0;
			invoicesMap[invId].total_weight_tons += item.weight_in_tons || 0;
			invoicesMap[invId].items_count++;
		});

		const invoices = Object.values(invoicesMap).sort((a, b) => {
			return new Date(b.posting_date) - new Date(a.posting_date);
		});

		let invoiceRows = invoices.map(inv => {
			const grandTotal = inv.invoice_grand_total || 0;
			const outstanding = inv.invoice_outstanding_amount || 0;
			const paidAmount = Math.max(0, grandTotal - outstanding);
			const paymentPct = grandTotal > 0 ? (paidAmount / grandTotal) * 100 : 100;
			const payCls = paymentPct >= 100 ? 'pay-full' : (paymentPct > 0 ? 'pay-partial' : 'pay-none');

			return `
				<tr class="invoice-row" data-invoice="${inv.invoice_id}">
					<td class="expand-cell">
						<span class="expand-icon"><i class="fa fa-plus-circle"></i></span>
					</td>
					<td><a href="/app/sales-invoice/${inv.invoice_id}" class="inv-link" target="_blank">${inv.invoice_id || ''}</a></td>
					<td class="date-cell">${inv.posting_date || ''}</td>
					<td><span class="items-count-badge">${inv.items_count} صنف</span></td>
					<td class="weight-cell">${this.num(inv.total_weight_tons, 3)} طن</td>
					<td class="amount-cell">${this.fmt(inv.invoice_grand_total)}</td>
					<td><div class="payment-cell"><span class="payment-pct-text ${payCls}">${this.num(paymentPct, 0)}%</span><div class="payment-progress-bg"><div class="payment-progress-fill ${payCls}" style="width: ${Math.min(paymentPct, 100)}%"></div></div></div></td>
					<td><div class="branch-user-cell"><span class="branch-name">${inv.invoice_branch || '-'}</span><span class="creator-name">${inv.invoice_creator || '-'}</span></div></td>
				</tr>
				<tr class="invoice-items-row" data-invoice="${inv.invoice_id}" style="display: none;">
					<td colspan="8" class="invoice-items-container">
						${this.render_invoice_items(inv.items)}
					</td>
				</tr>
			`;
		}).join('');

		return `
			<div class="invoices-scroll">
				<table class="invoices-tbl">
					<thead><tr><th style="width:40px;"></th><th>الفاتورة</th><th>التاريخ</th><th>الأصناف</th><th>الوزن</th><th>المبلغ</th><th>التحصيل</th><th>الفرع / المستخدم</th></tr></thead>
					<tbody>${invoiceRows}</tbody>
				</table>
			</div>
		`;
	}

	render_invoice_items(items) {
		if (!items || items.length === 0) return `<div class="empty-box" style="padding:15px;"><p>لا توجد أصناف</p></div>`;

		let rows = items.map(i => {
			const stk = (i.current_stock || 0) > 100 ? 'hi' : ((i.current_stock || 0) > 20 ? 'md' : 'lo');
			const invoiceRate = i.total_amount && i.qty ? (i.total_amount / i.qty) : 0;

			return `
				<tr>
					<td><div class="item-code">${i.item_code || ''}</div><div class="item-name">${i.item_name || ''}</div></td>
					<td><div class="qty-cell"><span class="qty-main">${this.num(i.qty, 2)}</span><span class="qty-uom">${i.invoice_uom || ''}</span></div></td>
					<td class="weight-cell">${this.num(i.weight_in_tons, 3)} طن</td>
					<td><div class="rate-cell"><span class="rate-invoice">${this.fmt(invoiceRate)}/${i.invoice_uom || ''}</span><span class="rate-ton">${this.fmt(i.rate_per_ton)}/طن</span></div></td>
					<td class="amount-cell">${this.fmt(i.total_amount)}</td>
					<td><div class="stock-cell"><span class="stock-dot ${stk}"></span><span class="stock-val">${this.num(i.current_stock, 0)}</span></div></td>
				</tr>
			`;
		}).join('');

		return `
			<table class="invoice-items-tbl">
				<thead><tr><th>الصنف</th><th>الكمية</th><th>الوزن</th><th>السعر</th><th>المبلغ</th><th>المخزون</th></tr></thead>
				<tbody>${rows}</tbody>
			</table>
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
