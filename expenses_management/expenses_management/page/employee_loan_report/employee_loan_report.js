frappe.pages['employee-loan-report'].on_page_load = function(wrapper) {
	new EmployeeLoanReport(wrapper);
}

class EmployeeLoanReport {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'تقرير القروض والسلف',
			single_column: true
		});

		this.filters = {
			company: '',
			from_date: '',
			to_date: '',
			employee: '',
			branch: '',
			department: '',
			loan_product: '',
			status: ''
		};

		this.filter_options = {};
		this.data = null;

		this.setup_page();
		this.render_content();
		this.load_filter_options();
	}

	setup_page() {
		$(this.wrapper).find('.page-head').hide();
		$('.main-section > footer, .main-section > .page-head').remove();
	}

	load_filter_options() {
		frappe.call({
			method: 'expenses_management.expenses_management.page.employee_loan_report.employee_loan_report.get_filter_options',
			callback: (r) => {
				if (r.message) {
					this.filter_options = r.message;
				}
			}
		});
	}

	show_settings_dialog() {
		let me = this;
		let d = new frappe.ui.Dialog({
			title: 'إعدادات التقرير',
			size: 'large',
			fields: [
				{
					fieldtype: 'HTML',
					options: `<div style="text-align:center; padding:10px 0 15px; border-bottom:2px solid #e2e8f0; margin-bottom:15px;">
						<span style="font-size:18px; font-weight:900; color:#0ea5e9;">⚙️ إعدادات تقرير القروض والسلف</span>
					</div>`
				},
				{
					fieldtype: 'Section Break',
					label: 'الفترة الزمنية',
					collapsible: 0
				},
				{
					fieldtype: 'HTML',
					fieldname: 'date_presets_html',
					options: `<div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:12px; direction:rtl;">
						<button class="btn btn-xs btn-default date-preset" data-preset="this_month" style="font-weight:700;">هذا الشهر</button>
						<button class="btn btn-xs btn-default date-preset" data-preset="last_month" style="font-weight:700;">الشهر الماضي</button>
						<button class="btn btn-xs btn-default date-preset" data-preset="this_quarter" style="font-weight:700;">هذا الربع</button>
						<button class="btn btn-xs btn-default date-preset" data-preset="last_quarter" style="font-weight:700;">الربع الماضي</button>
						<button class="btn btn-xs btn-default date-preset" data-preset="this_year" style="font-weight:700;">هذه السنة</button>
						<button class="btn btn-xs btn-default date-preset" data-preset="last_year" style="font-weight:700;">السنة الماضية</button>
						<button class="btn btn-xs btn-default date-preset" data-preset="all_time" style="font-weight:700;">الكل</button>
					</div>`
				},
				{
					fieldtype: 'Column Break'
				},
				{
					fieldname: 'from_date',
					label: 'من تاريخ',
					fieldtype: 'Date',
					default: me.filters.from_date
				},
				{
					fieldtype: 'Column Break'
				},
				{
					fieldname: 'to_date',
					label: 'إلى تاريخ',
					fieldtype: 'Date',
					default: me.filters.to_date
				},
				{
					fieldtype: 'Section Break',
					label: 'الفلاتر',
					collapsible: 0
				},
				{
					fieldname: 'company',
					label: 'الشركة',
					fieldtype: 'Link',
					options: 'Company',
					default: me.filters.company
				},
				{
					fieldtype: 'Column Break'
				},
				{
					fieldname: 'employee',
					label: 'الموظف',
					fieldtype: 'Link',
					options: 'Employee',
					default: me.filters.employee
				},
				{
					fieldtype: 'Section Break'
				},
				{
					fieldname: 'branch',
					label: 'الفرع',
					fieldtype: 'Link',
					options: 'Branch',
					default: me.filters.branch
				},
				{
					fieldtype: 'Column Break'
				},
				{
					fieldname: 'department',
					label: 'القسم',
					fieldtype: 'Link',
					options: 'Department',
					default: me.filters.department
				},
				{
					fieldtype: 'Section Break'
				},
				{
					fieldname: 'loan_product',
					label: 'نوع القرض',
					fieldtype: 'Link',
					options: 'Loan Product',
					default: me.filters.loan_product
				},
				{
					fieldtype: 'Column Break'
				},
				{
					fieldname: 'status',
					label: 'حالة القرض',
					fieldtype: 'Select',
					options: '\nactive\nclosed\nsanctioned',
					default: me.filters.status
				}
			],
			primary_action_label: '🔍 عرض التقرير',
			primary_action: function() {
				me.filters.company = d.get_value('company') || '';
				me.filters.from_date = d.get_value('from_date') || '';
				me.filters.to_date = d.get_value('to_date') || '';
				me.filters.employee = d.get_value('employee') || '';
				me.filters.branch = d.get_value('branch') || '';
				me.filters.department = d.get_value('department') || '';
				me.filters.loan_product = d.get_value('loan_product') || '';
				me.filters.status = d.get_value('status') || '';
				d.hide();
				me.generate_report();
			}
		});

		// Date presets
		d.$wrapper.find('.date-preset').on('click', function() {
			let preset = $(this).data('preset');
			let dates = me.get_preset_dates(preset);
			if (dates.from_date) {
				d.set_value('from_date', dates.from_date);
			} else {
				d.set_value('from_date', '');
			}
			if (dates.to_date) {
				d.set_value('to_date', dates.to_date);
			} else {
				d.set_value('to_date', '');
			}
			d.$wrapper.find('.date-preset').removeClass('btn-primary').addClass('btn-default');
			$(this).removeClass('btn-default').addClass('btn-primary');
		});

		d.show();
	}

	get_preset_dates(preset) {
		let today = frappe.datetime.get_today();
		let y = parseInt(today.substring(0, 4));
		let m = parseInt(today.substring(5, 7));

		switch(preset) {
			case 'this_month':
				return {
					from_date: `${y}-${String(m).padStart(2,'0')}-01`,
					to_date: frappe.datetime.get_last_day(today)
				};
			case 'last_month': {
				let lm = m - 1, ly = y;
				if (lm < 1) { lm = 12; ly--; }
				let fd = `${ly}-${String(lm).padStart(2,'0')}-01`;
				return { from_date: fd, to_date: frappe.datetime.get_last_day(fd) };
			}
			case 'this_quarter': {
				let qm = Math.floor((m - 1) / 3) * 3 + 1;
				return {
					from_date: `${y}-${String(qm).padStart(2,'0')}-01`,
					to_date: frappe.datetime.get_last_day(`${y}-${String(qm + 2).padStart(2,'0')}-01`)
				};
			}
			case 'last_quarter': {
				let qm = Math.floor((m - 1) / 3) * 3 - 2;
				let qy = y;
				if (qm < 1) { qm += 12; qy--; }
				return {
					from_date: `${qy}-${String(qm).padStart(2,'0')}-01`,
					to_date: frappe.datetime.get_last_day(`${qy}-${String(qm + 2).padStart(2,'0')}-01`)
				};
			}
			case 'this_year':
				return { from_date: `${y}-01-01`, to_date: `${y}-12-31` };
			case 'last_year':
				return { from_date: `${y-1}-01-01`, to_date: `${y-1}-12-31` };
			case 'all_time':
				return { from_date: '', to_date: '' };
			default:
				return { from_date: '', to_date: '' };
		}
	}

	render_content() {
		let container = $(this.wrapper).find('.layout-main-section');
		container.html(`
			<style>
				@keyframes fadeInUp {
					from { opacity: 0; transform: translateY(20px); }
					to { opacity: 1; transform: translateY(0); }
				}
				@keyframes slideInRight {
					from { opacity: 0; transform: translateX(-30px); }
					to { opacity: 1; transform: translateX(0); }
				}
				@keyframes shimmer {
					0% { background-position: -200% 0; }
					100% { background-position: 200% 0; }
				}
				@keyframes pulse {
					0%, 100% { transform: scale(1); }
					50% { transform: scale(1.05); }
				}
				@keyframes countUp {
					from { opacity: 0; transform: translateY(10px); }
					to { opacity: 1; transform: translateY(0); }
				}
				.loan-report-container {
					direction: rtl;
					font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
					padding: 0;
					max-width: 100%;
					background: #f8fafc;
					min-height: 100vh;
				}
				.loan-header {
					background: linear-gradient(135deg, #0c4a6e 0%, #075985 30%, #0369a1 60%, #0ea5e9 100%);
					padding: 28px 30px 22px;
					color: white;
					position: relative;
					overflow: hidden;
				}
				.loan-header::before {
					content: '';
					position: absolute;
					top: -50%;
					left: -50%;
					width: 200%;
					height: 200%;
					background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
					animation: pulse 8s ease-in-out infinite;
				}
				.loan-header-title {
					font-size: 26px;
					font-weight: 900;
					margin-bottom: 4px;
					position: relative;
					z-index: 1;
				}
				.loan-header-subtitle {
					font-size: 13px;
					opacity: 0.85;
					font-weight: 600;
					position: relative;
					z-index: 1;
				}
				.loan-filter-tags {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
					margin-top: 14px;
					position: relative;
					z-index: 1;
				}
				.loan-filter-tag {
					background: rgba(255,255,255,0.18);
					backdrop-filter: blur(10px);
					border: 1px solid rgba(255,255,255,0.25);
					padding: 4px 14px;
					border-radius: 20px;
					font-size: 12px;
					font-weight: 700;
					color: white;
				}
				/* Floating action buttons */
				.loan-fab-container {
					position: fixed;
					left: 24px;
					bottom: 24px;
					display: flex;
					flex-direction: column;
					gap: 10px;
					z-index: 1000;
				}
				.loan-fab {
					width: 52px;
					height: 52px;
					border-radius: 50%;
					border: none;
					color: white;
					font-size: 20px;
					cursor: pointer;
					box-shadow: 0 4px 15px rgba(0,0,0,0.25);
					display: flex;
					align-items: center;
					justify-content: center;
					transition: all 0.3s ease;
				}
				.loan-fab:hover {
					transform: scale(1.1);
					box-shadow: 0 6px 20px rgba(0,0,0,0.35);
				}
				.loan-fab-settings { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
				.loan-fab-reload { background: linear-gradient(135deg, #10b981, #059669); }
				.loan-fab-print { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
				.loan-fab-excel { background: linear-gradient(135deg, #f59e0b, #d97706); }
				/* Summary grid */
				.loan-summary-grid {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
					gap: 14px;
					padding: 20px 24px;
					background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
					border-bottom: 2px solid #bae6fd;
				}
				.loan-summary-box {
					background: white;
					border-radius: 14px;
					padding: 16px;
					text-align: center;
					box-shadow: 0 2px 10px rgba(0,0,0,0.06);
					border: 1px solid #e0f2fe;
					transition: transform 0.2s;
					animation: fadeInUp 0.5s ease-out forwards;
				}
				.loan-summary-box:hover {
					transform: translateY(-3px);
					box-shadow: 0 6px 20px rgba(14,165,233,0.15);
				}
				.loan-summary-label {
					font-size: 11px;
					font-weight: 800;
					color: #64748b;
					margin-bottom: 6px;
					text-transform: uppercase;
					letter-spacing: 0.5px;
				}
				.loan-summary-value {
					font-size: 20px;
					font-weight: 900;
					color: #0c4a6e;
					animation: countUp 0.6s ease-out;
				}
				.loan-summary-sub {
					font-size: 10px;
					color: #94a3b8;
					font-weight: 700;
					margin-top: 2px;
				}
				/* Period analysis section */
				.loan-period-section {
					padding: 20px 24px;
					background: white;
					margin: 16px 24px;
					border-radius: 16px;
					box-shadow: 0 2px 10px rgba(0,0,0,0.05);
					border: 1px solid #e2e8f0;
				}
				.loan-period-title {
					font-size: 17px;
					font-weight: 900;
					color: #0c4a6e;
					margin-bottom: 16px;
					padding-bottom: 10px;
					border-bottom: 2px solid #e0f2fe;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				.loan-period-grid {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					gap: 16px;
				}
				.loan-period-card {
					border-radius: 14px;
					padding: 20px;
					text-align: center;
					position: relative;
					overflow: hidden;
				}
				.loan-period-card::after {
					content: '';
					position: absolute;
					top: 0;
					right: 0;
					width: 60px;
					height: 60px;
					border-radius: 0 0 0 60px;
					opacity: 0.1;
				}
				.loan-period-card.before {
					background: linear-gradient(135deg, #fef3c7, #fde68a);
					border: 1px solid #fbbf24;
				}
				.loan-period-card.before::after { background: #f59e0b; }
				.loan-period-card.during {
					background: linear-gradient(135deg, #dbeafe, #bfdbfe);
					border: 1px solid #60a5fa;
				}
				.loan-period-card.during::after { background: #3b82f6; }
				.loan-period-card.current {
					background: linear-gradient(135deg, #d1fae5, #a7f3d0);
					border: 1px solid #34d399;
				}
				.loan-period-card.current::after { background: #10b981; }
				.loan-period-card-title {
					font-size: 14px;
					font-weight: 900;
					margin-bottom: 14px;
				}
				.loan-period-card.before .loan-period-card-title { color: #92400e; }
				.loan-period-card.during .loan-period-card-title { color: #1e40af; }
				.loan-period-card.current .loan-period-card-title { color: #065f46; }
				.loan-period-metric {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 6px 0;
					border-bottom: 1px dashed rgba(0,0,0,0.1);
				}
				.loan-period-metric:last-child { border-bottom: none; }
				.loan-period-metric-label {
					font-size: 12px;
					font-weight: 700;
					color: #475569;
				}
				.loan-period-metric-value {
					font-size: 15px;
					font-weight: 900;
					color: #0f172a;
				}
				/* Employee cards */
				.loan-cards-container {
					padding: 0 24px 30px;
				}
				.loan-cards-header {
					font-size: 17px;
					font-weight: 900;
					color: #0c4a6e;
					padding: 16px 0 12px;
					display: flex;
					align-items: center;
					gap: 8px;
				}
				.loan-emp-card {
					background: white;
					border-radius: 16px;
					margin-bottom: 16px;
					box-shadow: 0 2px 12px rgba(0,0,0,0.06);
					border: 1px solid #e2e8f0;
					overflow: hidden;
					animation: fadeInUp 0.4s ease-out forwards;
					transition: box-shadow 0.3s;
				}
				.loan-emp-card:hover {
					box-shadow: 0 6px 24px rgba(14,165,233,0.12);
				}
				.loan-emp-header {
					background: linear-gradient(135deg, #0c4a6e, #0369a1);
					padding: 16px 20px;
					color: white;
					display: flex;
					justify-content: space-between;
					align-items: center;
					cursor: pointer;
					transition: background 0.3s;
				}
				.loan-emp-header:hover {
					background: linear-gradient(135deg, #0369a1, #0ea5e9);
				}
				.loan-emp-info {
					display: flex;
					align-items: center;
					gap: 14px;
				}
				.loan-emp-avatar {
					width: 48px;
					height: 48px;
					border-radius: 50%;
					background: rgba(255,255,255,0.2);
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 20px;
					font-weight: 900;
					border: 2px solid rgba(255,255,255,0.4);
					overflow: hidden;
				}
				.loan-emp-avatar img {
					width: 100%;
					height: 100%;
					object-fit: cover;
				}
				.loan-emp-name {
					font-size: 17px;
					font-weight: 900;
				}
				.loan-emp-meta {
					font-size: 11px;
					opacity: 0.85;
					font-weight: 600;
					margin-top: 2px;
				}
				.loan-emp-stats {
					display: flex;
					gap: 20px;
					align-items: center;
				}
				.loan-emp-stat {
					text-align: center;
				}
				.loan-emp-stat-val {
					font-size: 18px;
					font-weight: 900;
				}
				.loan-emp-stat-label {
					font-size: 10px;
					font-weight: 700;
					opacity: 0.8;
				}
				.loan-emp-body {
					display: none;
					padding: 0;
				}
				.loan-emp-body.open {
					display: block;
				}
				/* Mini period summary inside card */
				.loan-emp-period-strip {
					display: grid;
					grid-template-columns: repeat(3, 1fr);
					gap: 0;
					border-bottom: 1px solid #e2e8f0;
				}
				.loan-emp-period-cell {
					padding: 12px 16px;
					text-align: center;
					border-left: 1px solid #e2e8f0;
				}
				.loan-emp-period-cell:last-child { border-left: none; }
				.loan-emp-period-cell.before-cell { background: #fffbeb; }
				.loan-emp-period-cell.during-cell { background: #eff6ff; }
				.loan-emp-period-cell.current-cell { background: #ecfdf5; }
				.loan-emp-period-cell-title {
					font-size: 11px;
					font-weight: 800;
					margin-bottom: 8px;
				}
				.loan-emp-period-cell.before-cell .loan-emp-period-cell-title { color: #92400e; }
				.loan-emp-period-cell.during-cell .loan-emp-period-cell-title { color: #1e40af; }
				.loan-emp-period-cell.current-cell .loan-emp-period-cell-title { color: #065f46; }
				.loan-emp-period-cell-row {
					display: flex;
					justify-content: space-between;
					font-size: 11px;
					padding: 2px 0;
				}
				.loan-emp-period-cell-row .label { color: #64748b; font-weight: 700; }
				.loan-emp-period-cell-row .value { font-weight: 900; color: #0f172a; }
				/* Progress bar */
				.loan-progress-container {
					padding: 14px 20px;
					border-bottom: 1px solid #e2e8f0;
					background: #f8fafc;
				}
				.loan-progress-header {
					display: flex;
					justify-content: space-between;
					margin-bottom: 6px;
				}
				.loan-progress-label {
					font-size: 11px;
					font-weight: 800;
					color: #475569;
				}
				.loan-progress-pct {
					font-size: 12px;
					font-weight: 900;
					color: #0ea5e9;
				}
				.loan-progress-bar {
					height: 8px;
					background: #e2e8f0;
					border-radius: 4px;
					overflow: hidden;
				}
				.loan-progress-fill {
					height: 100%;
					border-radius: 4px;
					transition: width 1s ease-out;
					background: linear-gradient(90deg, #0ea5e9, #06b6d4);
				}
				/* Loan detail rows */
				.loan-detail-table {
					width: 100%;
					border-collapse: collapse;
				}
				.loan-detail-table th {
					background: #f1f5f9;
					padding: 10px 14px;
					font-size: 11px;
					font-weight: 800;
					color: #475569;
					text-align: right;
					border-bottom: 2px solid #e2e8f0;
				}
				.loan-detail-table td {
					padding: 10px 14px;
					font-size: 12px;
					font-weight: 700;
					color: #1e293b;
					border-bottom: 1px solid #f1f5f9;
					text-align: right;
				}
				.loan-detail-table tr:hover td {
					background: #f8fafc;
				}
				.loan-status-badge {
					display: inline-block;
					padding: 3px 10px;
					border-radius: 12px;
					font-size: 10px;
					font-weight: 800;
				}
				.loan-status-active {
					background: #dcfce7;
					color: #166534;
				}
				.loan-status-closed {
					background: #f1f5f9;
					color: #475569;
				}
				.loan-status-sanctioned {
					background: #fef3c7;
					color: #92400e;
				}
				/* Repayment sub-table */
				.loan-repay-toggle {
					cursor: pointer;
					color: #0ea5e9;
					font-weight: 800;
					font-size: 11px;
					user-select: none;
				}
				.loan-repay-toggle:hover { text-decoration: underline; }
				.loan-repay-panel {
					display: none;
					background: #f8fafc;
					border-top: 1px dashed #cbd5e1;
				}
				.loan-repay-panel.open { display: table-row; }
				.loan-repay-table {
					width: 100%;
					border-collapse: collapse;
					margin: 0;
				}
				.loan-repay-table th {
					background: #e0f2fe;
					padding: 7px 12px;
					font-size: 10px;
					font-weight: 800;
					color: #0369a1;
					text-align: right;
				}
				.loan-repay-table td {
					padding: 7px 12px;
					font-size: 11px;
					font-weight: 700;
					color: #334155;
					border-bottom: 1px solid #e2e8f0;
					text-align: right;
				}
				/* Empty state */
				.loan-empty-state {
					text-align: center;
					padding: 80px 30px;
					animation: fadeInUp 0.6s ease-out;
				}
				.loan-empty-icon {
					font-size: 64px;
					margin-bottom: 16px;
				}
				.loan-empty-title {
					font-size: 22px;
					font-weight: 900;
					color: #0c4a6e;
					margin-bottom: 8px;
				}
				.loan-empty-text {
					font-size: 14px;
					color: #64748b;
					font-weight: 600;
				}
				/* Analysis charts section */
				.loan-analysis-section {
					padding: 20px 24px;
					background: white;
					margin: 0 24px 16px;
					border-radius: 16px;
					box-shadow: 0 2px 10px rgba(0,0,0,0.05);
					border: 1px solid #e2e8f0;
				}
				.loan-analysis-title {
					font-size: 17px;
					font-weight: 900;
					color: #0c4a6e;
					margin-bottom: 16px;
					padding-bottom: 10px;
					border-bottom: 2px solid #e0f2fe;
				}
				.loan-bar-chart {
					display: flex;
					flex-direction: column;
					gap: 10px;
				}
				.loan-bar-row {
					display: flex;
					align-items: center;
					gap: 12px;
				}
				.loan-bar-label {
					width: 140px;
					font-size: 12px;
					font-weight: 800;
					color: #334155;
					text-align: right;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.loan-bar-track {
					flex: 1;
					height: 24px;
					background: #f1f5f9;
					border-radius: 12px;
					overflow: hidden;
					position: relative;
				}
				.loan-bar-fill {
					height: 100%;
					border-radius: 12px;
					transition: width 1.2s ease-out;
					display: flex;
					align-items: center;
					justify-content: flex-end;
					padding: 0 8px;
					font-size: 10px;
					font-weight: 900;
					color: white;
					min-width: 35px;
				}
				.loan-bar-fill.outstanding { background: linear-gradient(90deg, #ef4444, #f87171); }
				.loan-bar-fill.repaid { background: linear-gradient(90deg, #10b981, #34d399); }
				.loan-bar-amount {
					font-size: 11px;
					font-weight: 800;
					color: #64748b;
					min-width: 80px;
					text-align: left;
				}
				/* Risk indicators */
				.loan-risk-high { color: #ef4444; }
				.loan-risk-medium { color: #f59e0b; }
				.loan-risk-low { color: #10b981; }
			</style>

			<div class="loan-report-container">
				<!-- Floating action buttons -->
				<div class="loan-fab-container">
					<button class="loan-fab loan-fab-settings" title="إعدادات">⚙️</button>
					<button class="loan-fab loan-fab-reload" title="تحديث">🔄</button>
					<button class="loan-fab loan-fab-print" title="طباعة">🖨️</button>
				</div>

				<div id="loan-report-content">
					<div class="loan-empty-state">
						<div class="loan-empty-icon">📊</div>
						<div class="loan-empty-title">تقرير القروض والسلف</div>
						<div class="loan-empty-text">اضغط على زر الإعدادات لتحديد الفلاتر وعرض التقرير</div>
					</div>
				</div>
			</div>
		`);

		// Bind FAB buttons
		let me = this;
		container.find('.loan-fab-settings').on('click', () => me.show_settings_dialog());
		container.find('.loan-fab-reload').on('click', () => me.generate_report());
		container.find('.loan-fab-print').on('click', () => me.generate_pdf_and_print());
	}

	generate_report() {
		let me = this;
		let args = {};
		Object.keys(this.filters).forEach(k => {
			if (this.filters[k]) args[k] = this.filters[k];
		});

		frappe.call({
			method: 'expenses_management.expenses_management.page.employee_loan_report.employee_loan_report.get_report_data',
			args: args,
			freeze: true,
			freeze_message: 'جاري تحميل التقرير...',
			callback: (r) => {
				if (r.message) {
					me.data = r.message;
					me.render_report(r.message);
				}
			}
		});
	}

	render_report(data) {
		let content = $(this.wrapper).find('#loan-report-content');

		if (!data.employees || data.employees.length === 0) {
			content.html(`
				<div class="loan-empty-state">
					<div class="loan-empty-icon">📭</div>
					<div class="loan-empty-title">لا توجد بيانات</div>
					<div class="loan-empty-text">لم يتم العثور على قروض بالفلاتر المحددة</div>
				</div>
			`);
			return;
		}

		let t = data.totals;
		let f = data.filters;
		let has_period = t.has_period;

		let html = '';

		// --- Header ---
		html += `<div class="loan-header">
			<div class="loan-header-title">📊 تقرير القروض والسلف</div>
			<div class="loan-header-subtitle">تحليل شامل للقروض والسلف حسب الموظف</div>
			<div class="loan-filter-tags">`;

		if (f.company) html += `<span class="loan-filter-tag">الشركة: ${f.company}</span>`;
		if (f.from_date && f.to_date) html += `<span class="loan-filter-tag">الفترة: ${f.from_date} → ${f.to_date}</span>`;
		if (f.employee) html += `<span class="loan-filter-tag">الموظف: ${f.employee}</span>`;
		if (f.branch) html += `<span class="loan-filter-tag">الفرع: ${f.branch}</span>`;
		if (f.department) html += `<span class="loan-filter-tag">القسم: ${f.department}</span>`;
		if (f.loan_product) html += `<span class="loan-filter-tag">نوع القرض: ${f.loan_product}</span>`;
		if (f.status) html += `<span class="loan-filter-tag">الحالة: ${f.status}</span>`;
		if (!f.company && !f.from_date && !f.employee) html += `<span class="loan-filter-tag">جميع البيانات</span>`;

		html += `</div></div>`;

		// --- Summary Grid ---
		html += `<div class="loan-summary-grid">
			<div class="loan-summary-box">
				<div class="loan-summary-label">عدد الموظفين</div>
				<div class="loan-summary-value" style="color:#0ea5e9;">${t.employee_count}</div>
				<div class="loan-summary-sub">موظف لديه قروض</div>
			</div>
			<div class="loan-summary-box">
				<div class="loan-summary-label">إجمالي القروض</div>
				<div class="loan-summary-value" style="color:#6366f1;">${t.total_loans}</div>
				<div class="loan-summary-sub">${t.active_loans} قرض نشط</div>
			</div>
			<div class="loan-summary-box">
				<div class="loan-summary-label">إجمالي مبالغ القروض</div>
				<div class="loan-summary-value" style="color:#0c4a6e;">${this.fmt(t.total_loan_amount)}</div>
				<div class="loan-summary-sub">ريال</div>
			</div>
			<div class="loan-summary-box">
				<div class="loan-summary-label">إجمالي المسدد</div>
				<div class="loan-summary-value" style="color:#10b981;">${this.fmt(t.total_repaid)}</div>
				<div class="loan-summary-sub">${t.collection_rate}% نسبة التحصيل</div>
			</div>
			<div class="loan-summary-box">
				<div class="loan-summary-label">إجمالي المتبقي</div>
				<div class="loan-summary-value" style="color:#ef4444;">${this.fmt(t.total_outstanding)}</div>
				<div class="loan-summary-sub">ريال مستحق</div>
			</div>
			<div class="loan-summary-box">
				<div class="loan-summary-label">متوسط القرض</div>
				<div class="loan-summary-value" style="color:#8b5cf6;">${this.fmt(t.avg_loan_amount)}</div>
				<div class="loan-summary-sub">ريال / قرض</div>
			</div>
		</div>`;

		// --- Period Analysis ---
		if (has_period) {
			html += `<div class="loan-period-section">
				<div class="loan-period-title">📅 تحليل الفترة الزمنية</div>
				<div class="loan-period-grid">
					<div class="loan-period-card before">
						<div class="loan-period-card-title">⏪ قبل الفترة</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">إجمالي الصرف</span>
							<span class="loan-period-metric-value">${this.fmt(t.before_total_disbursed)}</span>
						</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">إجمالي السداد</span>
							<span class="loan-period-metric-value">${this.fmt(t.before_total_repaid)}</span>
						</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">الرصيد المتبقي</span>
							<span class="loan-period-metric-value" style="color:#ef4444;">${this.fmt(t.before_outstanding)}</span>
						</div>
					</div>
					<div class="loan-period-card during">
						<div class="loan-period-card-title">📆 خلال الفترة</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">قروض جديدة</span>
							<span class="loan-period-metric-value">${this.fmt(t.period_total_disbursed)}</span>
						</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">سداد خلال الفترة</span>
							<span class="loan-period-metric-value">${this.fmt(t.period_total_repaid)}</span>
						</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">صافي الحركة</span>
							<span class="loan-period-metric-value" style="color:${(t.period_total_disbursed - t.period_total_repaid) > 0 ? '#ef4444' : '#10b981'};">${this.fmt(Math.abs(t.period_total_disbursed - t.period_total_repaid))}</span>
						</div>
					</div>
					<div class="loan-period-card current">
						<div class="loan-period-card-title">📍 نهاية الفترة</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">الرصيد الحالي</span>
							<span class="loan-period-metric-value" style="color:#ef4444; font-size:20px;">${this.fmt(t.period_outstanding)}</span>
						</div>
						<div class="loan-period-metric">
							<span class="loan-period-metric-label">نسبة التحصيل الكلية</span>
							<span class="loan-period-metric-value" style="color:#10b981;">${t.collection_rate}%</span>
						</div>
					</div>
				</div>
			</div>`;
		}

		// --- Top Borrowers Analysis (Bar Chart) ---
		let top_emps = data.employees.slice(0, 10);
		let max_outstanding = Math.max(...top_emps.map(e => e.total_outstanding), 1);

		html += `<div class="loan-analysis-section">
			<div class="loan-analysis-title">📊 أعلى الموظفين برصيد قروض متبقي</div>
			<div class="loan-bar-chart">`;

		top_emps.forEach((e, i) => {
			let pct = (e.total_outstanding / max_outstanding * 100).toFixed(0);
			let repaid_pct = (e.total_repaid / Math.max(e.total_loan_amount, 1) * 100).toFixed(0);
			html += `<div class="loan-bar-row" style="animation: slideInRight ${0.3 + i * 0.08}s ease-out;">
				<div class="loan-bar-label">${e.employee_name}</div>
				<div class="loan-bar-track">
					<div class="loan-bar-fill outstanding" style="width: ${pct}%">${this.fmt(e.total_outstanding)}</div>
				</div>
				<div class="loan-bar-amount">سُدد ${repaid_pct}%</div>
			</div>`;
		});

		html += `</div></div>`;

		// --- Employee Cards ---
		html += `<div class="loan-cards-container">
			<div class="loan-cards-header">👥 تفاصيل الموظفين (${data.employees.length})</div>`;

		data.employees.forEach((emp, idx) => {
			html += this.render_employee_card(emp, idx, has_period);
		});

		html += `</div>`;

		content.html(html);
		this.bind_card_events(content);
	}

	render_employee_card(emp, idx, has_period) {
		let avatar_content = emp.employee_image
			? `<img src="${emp.employee_image}" alt="${emp.employee_name}">`
			: emp.employee_name.charAt(0);

		let risk_class = 'loan-risk-low';
		let risk_label = 'منخفض';
		if (emp.total_outstanding > 100000) {
			risk_class = 'loan-risk-high';
			risk_label = 'مرتفع';
		} else if (emp.total_outstanding > 50000) {
			risk_class = 'loan-risk-medium';
			risk_label = 'متوسط';
		}

		let html = `<div class="loan-emp-card" style="animation-delay: ${idx * 0.06}s;">
			<div class="loan-emp-header" data-idx="${idx}">
				<div class="loan-emp-info">
					<div class="loan-emp-avatar">${avatar_content}</div>
					<div>
						<div class="loan-emp-name">${emp.employee_name}</div>
						<div class="loan-emp-meta">${emp.employee_id} | ${emp.designation || '-'} | ${emp.branch || '-'} | ${emp.department || '-'}</div>
					</div>
				</div>
				<div class="loan-emp-stats">
					<div class="loan-emp-stat">
						<div class="loan-emp-stat-val">${emp.loan_count}</div>
						<div class="loan-emp-stat-label">قروض</div>
					</div>
					<div class="loan-emp-stat">
						<div class="loan-emp-stat-val">${this.fmt(emp.total_loan_amount)}</div>
						<div class="loan-emp-stat-label">إجمالي</div>
					</div>
					<div class="loan-emp-stat">
						<div class="loan-emp-stat-val" style="color:#34d399;">${this.fmt(emp.total_repaid)}</div>
						<div class="loan-emp-stat-label">مسدد</div>
					</div>
					<div class="loan-emp-stat">
						<div class="loan-emp-stat-val" style="color:#f87171;">${this.fmt(emp.total_outstanding)}</div>
						<div class="loan-emp-stat-label">متبقي</div>
					</div>
					<div class="loan-emp-stat">
						<div class="loan-emp-stat-val ${risk_class}">${risk_label}</div>
						<div class="loan-emp-stat-label">المخاطر</div>
					</div>
				</div>
			</div>
			<div class="loan-emp-body" data-body-idx="${idx}">`;

		// Period strip (if period selected)
		if (has_period) {
			html += `<div class="loan-emp-period-strip">
				<div class="loan-emp-period-cell before-cell">
					<div class="loan-emp-period-cell-title">قبل الفترة</div>
					<div class="loan-emp-period-cell-row"><span class="label">صرف</span><span class="value">${this.fmt(emp.before_total_disbursed)}</span></div>
					<div class="loan-emp-period-cell-row"><span class="label">سداد</span><span class="value">${this.fmt(emp.before_total_repaid)}</span></div>
					<div class="loan-emp-period-cell-row"><span class="label">رصيد</span><span class="value" style="color:#ef4444;">${this.fmt(emp.before_outstanding)}</span></div>
				</div>
				<div class="loan-emp-period-cell during-cell">
					<div class="loan-emp-period-cell-title">خلال الفترة</div>
					<div class="loan-emp-period-cell-row"><span class="label">صرف</span><span class="value">${this.fmt(emp.period_total_disbursed)}</span></div>
					<div class="loan-emp-period-cell-row"><span class="label">سداد</span><span class="value">${this.fmt(emp.period_total_repaid)}</span></div>
					<div class="loan-emp-period-cell-row"><span class="label">صافي</span><span class="value" style="color:${(emp.period_total_disbursed - emp.period_total_repaid) > 0 ? '#ef4444' : '#10b981'};">${this.fmt(Math.abs(emp.period_total_disbursed - emp.period_total_repaid))}</span></div>
				</div>
				<div class="loan-emp-period-cell current-cell">
					<div class="loan-emp-period-cell-title">نهاية الفترة</div>
					<div class="loan-emp-period-cell-row"><span class="label">رصيد</span><span class="value" style="color:#ef4444; font-size:14px; font-weight:900;">${this.fmt(emp.period_outstanding)}</span></div>
					<div class="loan-emp-period-cell-row"><span class="label">تحصيل</span><span class="value" style="color:#10b981;">${emp.payment_progress}%</span></div>
				</div>
			</div>`;
		}

		// Progress bar
		html += `<div class="loan-progress-container">
			<div class="loan-progress-header">
				<span class="loan-progress-label">نسبة السداد الكلية</span>
				<span class="loan-progress-pct">${emp.payment_progress}%</span>
			</div>
			<div class="loan-progress-bar">
				<div class="loan-progress-fill" style="width: ${emp.payment_progress}%;"></div>
			</div>
		</div>`;

		// Loan detail table
		html += `<table class="loan-detail-table">
			<thead>
				<tr>
					<th>رقم القرض</th>
					<th>نوع القرض</th>
					<th>التاريخ</th>
					<th>مبلغ القرض</th>
					<th>القسط الشهري</th>
					<th>المسدد</th>
					<th>المتبقي</th>
					<th>التقدم</th>
					<th>الحالة</th>
					${has_period ? '<th>سداد الفترة</th>' : ''}
				</tr>
			</thead>
			<tbody>`;

		emp.loans.forEach((loan, li) => {
			let status_cls = 'loan-status-active';
			let status_text = loan.status;
			if (['Closed', 'Settled'].includes(loan.status)) {
				status_cls = 'loan-status-closed';
			} else if (loan.status === 'Sanctioned') {
				status_cls = 'loan-status-sanctioned';
			}

			let has_repayments = loan.period_repayments && loan.period_repayments.length > 0;

			html += `<tr>
				<td><a href="/app/loan/${loan.loan_id}" target="_blank" style="color:#0ea5e9; font-weight:800;">${loan.loan_id}</a></td>
				<td>${loan.loan_product || '-'}</td>
				<td>${loan.loan_date || '-'}</td>
				<td style="font-weight:900;">${this.fmt(loan.loan_amount)}</td>
				<td>${this.fmt(loan.monthly_repayment)}</td>
				<td style="color:#10b981; font-weight:900;">${this.fmt(loan.total_repaid)}</td>
				<td style="color:#ef4444; font-weight:900;">${this.fmt(loan.outstanding)}</td>
				<td>
					<div style="display:flex; align-items:center; gap:6px;">
						<div style="flex:1; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
							<div style="width:${loan.payment_progress}%; height:100%; background:linear-gradient(90deg,#0ea5e9,#06b6d4); border-radius:3px;"></div>
						</div>
						<span style="font-size:10px; font-weight:900; color:#0ea5e9;">${loan.payment_progress}%</span>
					</div>
				</td>
				<td><span class="loan-status-badge ${status_cls}">${status_text}</span></td>
				${has_period ? `<td>
					${has_repayments
						? `<span class="loan-repay-toggle" data-loan-idx="${idx}-${li}">📋 ${loan.period_repayments.length} دفعة (${this.fmt(loan.period_repaid)})</span>`
						: `<span style="color:#94a3b8; font-size:11px;">—</span>`
					}
				</td>` : ''}
			</tr>`;

			// Repayment detail sub-row
			if (has_period && has_repayments) {
				html += `<tr class="loan-repay-panel" data-repay-panel="${idx}-${li}">
					<td colspan="${has_period ? 10 : 9}" style="padding:0;">
						<table class="loan-repay-table">
							<thead>
								<tr>
									<th>رقم السداد</th>
									<th>التاريخ</th>
									<th>المبلغ المدفوع</th>
									<th>أصل الدين</th>
									<th>الفائدة</th>
									<th>غرامات</th>
									<th>الرصيد المتبقي</th>
								</tr>
							</thead>
							<tbody>`;

				loan.period_repayments.forEach(rep => {
					html += `<tr>
						<td><a href="/app/loan-repayment/${rep.repayment_id}" target="_blank" style="color:#0ea5e9;">${rep.repayment_id}</a></td>
						<td>${rep.posting_date || '-'}</td>
						<td style="font-weight:900;">${this.fmt(rep.amount_paid)}</td>
						<td>${this.fmt(rep.principal_amount_paid)}</td>
						<td>${this.fmt(rep.total_interest_paid)}</td>
						<td>${this.fmt(rep.total_penalty_paid)}</td>
						<td style="color:#ef4444; font-weight:900;">${this.fmt(rep.pending_principal_amount)}</td>
					</tr>`;
				});

				html += `</tbody></table></td></tr>`;
			}
		});

		html += `</tbody></table></div></div>`;
		return html;
	}

	bind_card_events(container) {
		// Toggle employee card body
		container.find('.loan-emp-header').on('click', function() {
			let idx = $(this).data('idx');
			let body = container.find(`[data-body-idx="${idx}"]`);
			body.toggleClass('open');
		});

		// Toggle repayment detail panels
		container.find('.loan-repay-toggle').on('click', function(e) {
			e.stopPropagation();
			let key = $(this).data('loan-idx');
			let panel = container.find(`[data-repay-panel="${key}"]`);
			panel.toggleClass('open');
		});
	}

	generate_pdf_and_print() {
		if (!this.data || !this.data.employees || this.data.employees.length === 0) {
			frappe.msgprint('لا توجد بيانات للطباعة. قم بإنشاء التقرير أولاً.');
			return;
		}

		let data = this.data;
		let t = data.totals;
		let f = data.filters;
		let has_period = t.has_period;

		let html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>تقرير القروض والسلف</title>
<style>
	body {
		font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
		direction: rtl;
		padding: 20px;
		color: #1e293b;
		font-size: 12px;
	}
	.print-header {
		text-align: center;
		border-bottom: 3px solid #0c4a6e;
		padding-bottom: 14px;
		margin-bottom: 20px;
	}
	.print-header h1 {
		font-size: 22px;
		font-weight: 900;
		color: #0c4a6e;
		margin: 0 0 6px;
	}
	.print-header .filters {
		font-size: 11px;
		color: #64748b;
		font-weight: 700;
	}
	.print-summary {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 16px;
		justify-content: center;
	}
	.print-summary-box {
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 8px 16px;
		text-align: center;
		min-width: 100px;
	}
	.print-summary-box .label { font-size: 9px; color: #64748b; font-weight: 800; }
	.print-summary-box .value { font-size: 16px; font-weight: 900; color: #0c4a6e; }
	table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 16px;
	}
	th {
		background: #f1f5f9;
		padding: 8px 10px;
		font-size: 10px;
		font-weight: 800;
		color: #475569;
		text-align: right;
		border: 1px solid #e2e8f0;
	}
	td {
		padding: 7px 10px;
		font-size: 11px;
		font-weight: 700;
		border: 1px solid #e2e8f0;
		text-align: right;
	}
	.section-title {
		font-size: 15px;
		font-weight: 900;
		color: #0c4a6e;
		border-bottom: 2px solid #e0f2fe;
		padding-bottom: 6px;
		margin: 20px 0 10px;
	}
	.period-grid {
		display: flex;
		gap: 12px;
		margin-bottom: 16px;
	}
	.period-box {
		flex: 1;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 10px;
		text-align: center;
	}
	.period-box h4 { font-size: 12px; margin: 0 0 8px; font-weight: 900; }
	.period-box .metric { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }
	.green { color: #10b981; }
	.red { color: #ef4444; }
	@media print {
		body { padding: 10px; }
		.page-break { page-break-before: always; }
	}
</style>
</head>
<body>`;

		// Header
		let filter_parts = [];
		if (f.company) filter_parts.push(`الشركة: ${f.company}`);
		if (f.from_date && f.to_date) filter_parts.push(`الفترة: ${f.from_date} إلى ${f.to_date}`);
		if (f.employee) filter_parts.push(`الموظف: ${f.employee}`);
		if (f.branch) filter_parts.push(`الفرع: ${f.branch}`);
		if (f.department) filter_parts.push(`القسم: ${f.department}`);

		html += `<div class="print-header">
			<h1>تقرير القروض والسلف</h1>
			<div class="filters">${filter_parts.join(' | ') || 'جميع البيانات'}</div>
		</div>`;

		// Summary
		html += `<div class="print-summary">
			<div class="print-summary-box"><div class="label">عدد الموظفين</div><div class="value">${t.employee_count}</div></div>
			<div class="print-summary-box"><div class="label">إجمالي القروض</div><div class="value">${t.total_loans}</div></div>
			<div class="print-summary-box"><div class="label">إجمالي المبالغ</div><div class="value">${this.fmt(t.total_loan_amount)}</div></div>
			<div class="print-summary-box"><div class="label">المسدد</div><div class="value green">${this.fmt(t.total_repaid)}</div></div>
			<div class="print-summary-box"><div class="label">المتبقي</div><div class="value red">${this.fmt(t.total_outstanding)}</div></div>
			<div class="print-summary-box"><div class="label">نسبة التحصيل</div><div class="value">${t.collection_rate}%</div></div>
		</div>`;

		// Period analysis
		if (has_period) {
			html += `<div class="section-title">تحليل الفترة</div>
			<div class="period-grid">
				<div class="period-box">
					<h4>قبل الفترة</h4>
					<div class="metric"><span>صرف</span><span>${this.fmt(t.before_total_disbursed)}</span></div>
					<div class="metric"><span>سداد</span><span>${this.fmt(t.before_total_repaid)}</span></div>
					<div class="metric"><span>رصيد</span><span class="red">${this.fmt(t.before_outstanding)}</span></div>
				</div>
				<div class="period-box">
					<h4>خلال الفترة</h4>
					<div class="metric"><span>قروض جديدة</span><span>${this.fmt(t.period_total_disbursed)}</span></div>
					<div class="metric"><span>سداد</span><span>${this.fmt(t.period_total_repaid)}</span></div>
				</div>
				<div class="period-box">
					<h4>نهاية الفترة</h4>
					<div class="metric"><span>الرصيد</span><span class="red">${this.fmt(t.period_outstanding)}</span></div>
				</div>
			</div>`;
		}

		// Employee detail table
		html += `<div class="section-title">تفاصيل الموظفين</div>
		<table>
			<thead>
				<tr>
					<th>#</th>
					<th>الموظف</th>
					<th>الفرع</th>
					<th>القسم</th>
					<th>عدد القروض</th>
					<th>إجمالي القروض</th>
					${has_period ? '<th>رصيد قبل الفترة</th><th>صرف الفترة</th><th>سداد الفترة</th>' : ''}
					<th>إجمالي المسدد</th>
					<th>المتبقي</th>
					<th>نسبة السداد</th>
				</tr>
			</thead>
			<tbody>`;

		data.employees.forEach((emp, i) => {
			html += `<tr>
				<td>${i + 1}</td>
				<td style="font-weight:900;">${emp.employee_name}</td>
				<td>${emp.branch || '-'}</td>
				<td>${emp.department || '-'}</td>
				<td>${emp.loan_count}</td>
				<td style="font-weight:900;">${this.fmt(emp.total_loan_amount)}</td>
				${has_period ? `
					<td>${this.fmt(emp.before_outstanding)}</td>
					<td>${this.fmt(emp.period_total_disbursed)}</td>
					<td>${this.fmt(emp.period_total_repaid)}</td>
				` : ''}
				<td class="green">${this.fmt(emp.total_repaid)}</td>
				<td class="red">${this.fmt(emp.total_outstanding)}</td>
				<td>${emp.payment_progress}%</td>
			</tr>`;
		});

		html += `</tbody></table>`;

		// Loan details per employee
		data.employees.forEach((emp, i) => {
			if (emp.loans.length > 0) {
				html += `<div class="section-title" ${i > 0 ? '' : ''}>${emp.employee_name} - تفاصيل القروض</div>
				<table>
					<thead>
						<tr>
							<th>رقم القرض</th>
							<th>نوع القرض</th>
							<th>التاريخ</th>
							<th>مبلغ القرض</th>
							<th>القسط</th>
							<th>المسدد</th>
							<th>المتبقي</th>
							<th>التقدم</th>
							<th>الحالة</th>
						</tr>
					</thead>
					<tbody>`;

				emp.loans.forEach(loan => {
					html += `<tr>
						<td>${loan.loan_id}</td>
						<td>${loan.loan_product || '-'}</td>
						<td>${loan.loan_date || '-'}</td>
						<td style="font-weight:900;">${this.fmt(loan.loan_amount)}</td>
						<td>${this.fmt(loan.monthly_repayment)}</td>
						<td class="green">${this.fmt(loan.total_repaid)}</td>
						<td class="red">${this.fmt(loan.outstanding)}</td>
						<td>${loan.payment_progress}%</td>
						<td>${loan.status}</td>
					</tr>`;
				});

				html += `</tbody></table>`;
			}
		});

		html += `</body></html>`;

		let w = window.open('', '_blank');
		w.document.write(html);
		w.document.close();
		setTimeout(() => w.print(), 500);
	}

	fmt(v) {
		if (v === undefined || v === null || isNaN(v)) return '0';
		let num = parseFloat(v);
		if (num === 0) return '0';
		return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	}

	num(v, precision) {
		if (v === undefined || v === null || isNaN(v)) return '0';
		return parseFloat(v).toFixed(precision || 0);
	}
}
