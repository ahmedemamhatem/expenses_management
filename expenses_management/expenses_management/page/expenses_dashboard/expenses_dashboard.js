// Global variables to store filters and page reference
var dashboard_filters = {
	company: null,
	from_date: null,
	to_date: null,
	cost_center: null,
	expense_type: null
};

var filter_options = {
	companies: [],
	cost_centers: [],
	expense_types: []
};

// Cache for chart instances to prevent memory leaks
var chart_instances = {
	monthly_trend: null,
	expenses_by_type: null,
	expenses_by_cost_center: null,
	expenses_by_company: null,
	tax_comparison: null,
	count_by_type: null
};

// Debounce function for performance
function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}

frappe.pages['expenses-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Expenses Dashboard',
		single_column: true
	});

	// Store page reference globally
	window.expenses_dashboard_page = page;

	// Create main container
	page.main = $('<div class="expenses-dashboard-container"></div>').appendTo(page.body);

	// Initialize dashboard
	initialize_dashboard(page);
}

function initialize_dashboard(page) {
	// Show loading with animation
	page.main.html(`
		<div class="text-center" style="padding: 80px 20px;">
			<div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
				<span class="sr-only">Loading...</span>
			</div>
			<p class="text-muted mt-3" style="font-size: 16px;">Loading dashboard...</p>
		</div>
	`);

	// First, fetch filter options
	frappe.call({
		method: 'expenses_management.expenses_management.page.expenses_dashboard.expenses_dashboard.get_filter_options',
		callback: function(r) {
			if (r.message) {
				filter_options = r.message;
				// Set default company to "All"
				dashboard_filters.company = "All";
				// Now load dashboard data
				load_dashboard_data(page);
			} else {
				page.main.html('<div class="text-center text-muted" style="padding: 50px;">Unable to load filter options</div>');
			}
		},
		error: function(r) {
			page.main.html('<div class="text-center text-danger" style="padding: 50px;">Error loading filter options</div>');
		}
	});
}

function load_dashboard_data(page) {
	// Show inline loading for better UX
	if (page.main.find('.expenses-dashboard').length > 0) {
		page.main.find('.expenses-dashboard').css('opacity', '0.5');
	}

	// Fetch dashboard data with filters
	frappe.call({
		method: 'expenses_management.expenses_management.page.expenses_dashboard.expenses_dashboard.get_dashboard_data',
		args: dashboard_filters,
		callback: function(r) {
			if (r.message) {
				render_dashboard(page, r.message);
			} else {
				page.main.html('<div class="text-center text-muted" style="padding: 50px;">No data available</div>');
			}
		},
		error: function(r) {
			page.main.html('<div class="text-center text-danger" style="padding: 50px;">Error loading dashboard data</div>');
		}
	});
}

function render_dashboard(page, data) {
	// Clear chart instances to prevent memory leaks
	Object.keys(chart_instances).forEach(key => {
		if (chart_instances[key]) {
			chart_instances[key] = null;
		}
	});

	// Create clean dashboard HTML with new design
	var html = `
		<style>
			.expenses-dashboard {
				padding: 30px;
				background: #ffffff;
				min-height: calc(100vh - 100px);
			}

			/* Filter Card */
			.filter-card {
				background: #f8f9fa;
				border: none;
				border-radius: 8px;
				padding: 24px;
				margin-bottom: 30px;
			}

			/* Metric Cards - Advanced Design with Gradients */
			.metric-card {
				background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
				border: 1px solid #e9ecef;
				border-radius: 12px;
				padding: 20px 24px;
				margin-bottom: 16px;
				transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
				height: 100%;
				position: relative;
				overflow: hidden;
				box-shadow: 0 2px 4px rgba(0,0,0,0.04);
			}

			.metric-card::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				height: 4px;
				background: linear-gradient(90deg, #4c6ef5, #51cf66);
				opacity: 0;
				transition: opacity 0.3s ease;
			}

			.metric-card:hover {
				transform: translateY(-4px);
				box-shadow: 0 12px 24px rgba(0,0,0,0.12);
			}

			.metric-card:hover::before {
				opacity: 1;
			}

			.metric-card .metric-icon {
				position: absolute;
				top: 20px;
				right: 20px;
				font-size: 32px;
				opacity: 0.15;
				transition: all 0.3s ease;
			}

			.metric-card:hover .metric-icon {
				opacity: 0.25;
				transform: scale(1.1);
			}

			.metric-card .metric-label {
				font-size: 12px;
				color: #868e96;
				font-weight: 600;
				margin-bottom: 8px;
				display: block;
				text-transform: uppercase;
				letter-spacing: 0.5px;
			}

			.metric-card .metric-value {
				font-size: 28px;
				font-weight: 800;
				color: #212529;
				margin-bottom: 8px;
				line-height: 1;
				position: relative;
				z-index: 1;
			}

			.metric-card .metric-info {
				font-size: 12px;
				color: #adb5bd;
				font-weight: 500;
			}

			.metric-card.primary {
				border-left: 4px solid #4c6ef5;
			}

			.metric-card.primary .metric-icon {
				color: #4c6ef5;
			}

			.metric-card.success {
				border-left: 4px solid #51cf66;
			}

			.metric-card.success .metric-icon {
				color: #51cf66;
			}

			.metric-card.warning {
				border-left: 4px solid #ffa94d;
			}

			.metric-card.warning .metric-icon {
				color: #ffa94d;
			}

			.metric-card.info {
				border-left: 4px solid #4dabf7;
			}

			.metric-card.info .metric-icon {
				color: #4dabf7;
			}

			.metric-change {
				display: inline-flex;
				align-items: center;
				gap: 3px;
				font-size: 10px;
				font-weight: 600;
				padding: 2px 6px;
				border-radius: 3px;
			}

			.metric-change.positive {
				background: #d3f9d8;
				color: #2b8a3e;
			}

			.metric-change.negative {
				background: #ffe3e3;
				color: #c92a2a;
			}

			/* Chart Cards - Enhanced Design */
			.chart-card {
				background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%);
				border: 1px solid #e9ecef;
				border-radius: 16px;
				padding: 28px;
				margin-bottom: 24px;
				box-shadow: 0 4px 12px rgba(0,0,0,0.05);
				transition: all 0.3s ease;
				position: relative;
				overflow: hidden;
			}

			.chart-card::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				height: 3px;
				background: linear-gradient(90deg, #4c6ef5, #51cf66, #ffa94d, #ff6b6b);
				opacity: 0;
				transition: opacity 0.3s ease;
			}

			.chart-card:hover {
				box-shadow: 0 8px 24px rgba(0,0,0,0.1);
			}

			.chart-card:hover::before {
				opacity: 1;
			}

			.chart-card h5 {
				font-size: 18px;
				font-weight: 700;
				color: #212529;
				margin-bottom: 24px;
				padding-bottom: 16px;
				border-bottom: 2px solid #f1f3f5;
				display: flex;
				align-items: center;
				gap: 8px;
			}

			/* Custom bar chart styles - Enhanced */
			.custom-bar-chart {
				padding: 20px 10px;
			}

			.custom-bar-chart .bar-group {
				display: inline-block;
				text-align: center;
				margin: 0 10px;
				vertical-align: bottom;
				animation: fadeInUp 0.6s ease forwards;
				opacity: 0;
			}

			@keyframes fadeInUp {
				from {
					opacity: 0;
					transform: translateY(20px);
				}
				to {
					opacity: 1;
					transform: translateY(0);
				}
			}

			.custom-bar-chart .bar-group:nth-child(1) { animation-delay: 0.1s; }
			.custom-bar-chart .bar-group:nth-child(2) { animation-delay: 0.2s; }
			.custom-bar-chart .bar-group:nth-child(3) { animation-delay: 0.3s; }
			.custom-bar-chart .bar-group:nth-child(4) { animation-delay: 0.4s; }
			.custom-bar-chart .bar-group:nth-child(5) { animation-delay: 0.5s; }
			.custom-bar-chart .bar-group:nth-child(6) { animation-delay: 0.6s; }
			.custom-bar-chart .bar-group:nth-child(7) { animation-delay: 0.7s; }
			.custom-bar-chart .bar-group:nth-child(8) { animation-delay: 0.8s; }

			.custom-bar-chart .bar-wrapper {
				position: relative;
				display: inline-block;
			}

			.custom-bar-chart .bar {
				width: 50px;
				background: linear-gradient(180deg, #51cf66 0%, #40c057 100%);
				border-radius: 8px 8px 0 0;
				transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
				position: relative;
				display: inline-block;
				box-shadow: 0 4px 12px rgba(81, 207, 102, 0.3);
				cursor: pointer;
			}

			.custom-bar-chart .bar:hover {
				transform: translateY(-6px) scale(1.05);
				box-shadow: 0 8px 20px rgba(81, 207, 102, 0.5);
			}

			.custom-bar-chart .bar::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 100%);
				border-radius: 8px 8px 0 0;
			}

			.custom-bar-chart .bar-value {
				position: absolute;
				top: -30px;
				left: 50%;
				transform: translateX(-50%);
				font-size: 12px;
				font-weight: 700;
				color: #495057;
				white-space: nowrap;
				background: rgba(255, 255, 255, 0.95);
				padding: 4px 8px;
				border-radius: 6px;
				box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			}

			.custom-bar-chart .bar-label {
				margin-top: 12px;
				font-size: 12px;
				color: #495057;
				font-weight: 600;
				max-width: 90px;
				word-wrap: break-word;
				line-height: 1.4;
				min-height: 40px;
			}

			.custom-bar-chart .chart-axis {
				border-top: 3px solid #dee2e6;
				margin-top: 10px;
				position: relative;
			}

			.custom-bar-chart .chart-axis::before {
				content: '0';
				position: absolute;
				left: 0;
				bottom: 5px;
				font-size: 10px;
				color: #adb5bd;
			}

			/* Row spacing */
			.row {
				margin-bottom: 10px;
			}

			.row:last-child {
				margin-bottom: 0;
			}

			/* Filter Controls */
			.filter-control {
				margin-bottom: 0;
			}

			.filter-control label {
				font-size: 13px;
				font-weight: 600;
				color: #495057;
				margin-bottom: 8px;
				display: block;
			}

			.filter-control select,
			.filter-control input {
				border-radius: 6px;
				border: 1px solid #ced4da;
				font-size: 14px;
				height: 38px;
				padding: 8px 12px;
				transition: all 0.2s ease;
				background: white;
			}

			.filter-control select:focus,
			.filter-control input:focus {
				border-color: #4c6ef5;
				box-shadow: 0 0 0 3px rgba(76, 110, 245, 0.1);
				outline: none;
			}

			/* Table Styles - Enhanced */
			.expenses-table {
				width: 100%;
				border-collapse: separate;
				border-spacing: 0;
			}

			.expenses-table thead th {
				background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
				color: #495057;
				font-weight: 700;
				font-size: 13px;
				text-align: left;
				padding: 16px 20px;
				border-bottom: 3px solid #dee2e6;
				position: sticky;
				top: 0;
				z-index: 10;
			}

			.expenses-table thead th:first-child {
				border-radius: 8px 0 0 0;
			}

			.expenses-table thead th:last-child {
				border-radius: 0 8px 0 0;
			}

			.expenses-table tbody td {
				padding: 16px 20px;
				border-bottom: 1px solid #e9ecef;
				font-size: 14px;
				color: #212529;
			}

			.expenses-table tbody tr {
				transition: all 0.2s ease;
				background: white;
			}

			.expenses-table tbody tr:hover {
				background: linear-gradient(90deg, #f8f9fa 0%, #ffffff 100%);
				transform: scale(1.01);
				box-shadow: 0 2px 8px rgba(0,0,0,0.08);
			}

			.expenses-table tbody tr:last-child td:first-child {
				border-radius: 0 0 0 8px;
			}

			.expenses-table tbody tr:last-child td:last-child {
				border-radius: 0 0 8px 0;
			}

			.expense-link {
				color: #4c6ef5;
				font-weight: 600;
				text-decoration: none;
				transition: all 0.2s ease;
				display: inline-flex;
				align-items: center;
				gap: 6px;
			}

			.expense-link:hover {
				color: #364fc7;
				text-decoration: none;
				transform: translateX(4px);
			}

			/* Badge Styles - Enhanced */
			.amount-badge {
				background: linear-gradient(135deg, #e7f5ff 0%, #d0ebff 100%);
				color: #1864ab;
				padding: 6px 14px;
				border-radius: 8px;
				font-weight: 700;
				font-size: 13px;
				display: inline-block;
				box-shadow: 0 2px 6px rgba(24, 100, 171, 0.15);
				transition: all 0.2s ease;
			}

			.amount-badge:hover {
				transform: scale(1.05);
				box-shadow: 0 4px 12px rgba(24, 100, 171, 0.25);
			}

			/* Responsive */
			@media (max-width: 768px) {
				.expenses-dashboard {
					padding: 15px;
				}

				.metric-card {
					padding: 12px 14px;
					margin-bottom: 12px;
				}

				.metric-value {
					font-size: 20px;
				}

				.chart-card {
					padding: 18px;
				}
			}

			/* Loading State */
			.chart-loading {
				text-align: center;
				padding: 60px 20px;
				color: #586069;
			}

			.chart-loading i {
				font-size: 32px;
				margin-bottom: 12px;
				opacity: 0.4;
				animation: pulse 1.5s ease-in-out infinite;
			}

			@keyframes pulse {
				0%, 100% { opacity: 0.4; transform: scale(1); }
				50% { opacity: 0.6; transform: scale(1.05); }
			}

			.chart-loading p {
				font-size: 14px;
				color: #6a737d;
				margin: 0;
			}

			/* Chart container fade in */
			#monthly-trend-chart,
			#expenses-by-type-chart,
			#expenses-by-cost-center-chart,
			#expenses-by-company-chart,
			#tax-comparison-chart,
			#count-by-type-chart {
				animation: fadeIn 0.8s ease;
			}

			@keyframes fadeIn {
				from { opacity: 0; transform: translateY(10px); }
				to { opacity: 1; transform: translateY(0); }
			}
		</style>

		<div class="expenses-dashboard">
			<!-- Filters Section -->
			<div class="filter-card">
				<div class="row">
					<div class="col-sm-2">
						<div class="filter-control">
							<label>Company</label>
							<select class="form-control" id="filter-company">
								${filter_options.companies.map(c =>
									`<option value="${c}" ${c === dashboard_filters.company ? 'selected' : ''}>${c}</option>`
								).join('')}
							</select>
						</div>
					</div>
					<div class="col-sm-2">
						<div class="filter-control">
							<label>From Date</label>
							<input type="date" class="form-control" id="filter-from-date"
								value="${dashboard_filters.from_date || data.current_period.from_date}">
						</div>
					</div>
					<div class="col-sm-2">
						<div class="filter-control">
							<label>To Date</label>
							<input type="date" class="form-control" id="filter-to-date"
								value="${dashboard_filters.to_date || data.current_period.to_date}">
						</div>
					</div>
					<div class="col-sm-2">
						<div class="filter-control">
							<label>Cost Center</label>
							<select class="form-control" id="filter-cost-center">
								<option value="">All</option>
								${filter_options.cost_centers.map(cc =>
									`<option value="${cc}" ${cc === dashboard_filters.cost_center ? 'selected' : ''}>${cc}</option>`
								).join('')}
							</select>
						</div>
					</div>
					<div class="col-sm-2">
						<div class="filter-control">
							<label>Expense Type</label>
							<select class="form-control" id="filter-expense-type">
								<option value="">All</option>
								${filter_options.expense_types.map(et =>
									`<option value="${et}" ${et === dashboard_filters.expense_type ? 'selected' : ''}>${et}</option>`
								).join('')}
							</select>
						</div>
					</div>
					<div class="col-sm-2">
						<div class="filter-control">
							<label>&nbsp;</label>
							<button class="btn btn-primary btn-apply-filters form-control" onclick="apply_filters()">
								<i class="fa fa-refresh"></i> Refresh
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Metrics Row -->
			<div class="row">
				<div class="col-sm-3">
					<div class="metric-card primary">
						<i class="fa fa-money metric-icon"></i>
						<div class="metric-label">Total Expenses</div>
						<div class="metric-value">${format_currency(data.current_period.total)}</div>
						<div class="metric-change ${data.current_period.change >= 0 ? 'positive' : 'negative'}">
							<i class="fa fa-arrow-${data.current_period.change >= 0 ? 'up' : 'down'}"></i>
							${Math.abs(data.current_period.change).toFixed(1)}%
						</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card success">
						<i class="fa fa-calendar-check-o metric-icon"></i>
						<div class="metric-label">Year to Date</div>
						<div class="metric-value">${format_currency(data.year_to_date.total)}</div>
						<div class="metric-info">${new Date().getFullYear()} total expenses</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card info">
						<i class="fa fa-file-text-o metric-icon"></i>
						<div class="metric-label">Total Entries</div>
						<div class="metric-value">${data.stats.count}</div>
						<div class="metric-info">Expense entries logged</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card warning">
						<i class="fa fa-calculator metric-icon"></i>
						<div class="metric-label">Average Amount</div>
						<div class="metric-value">${format_currency(data.stats.average)}</div>
						<div class="metric-info">Per expense entry</div>
					</div>
				</div>
			</div>

			<!-- Additional Metrics Row -->
			<div class="row">
				<div class="col-sm-3">
					<div class="metric-card info">
						<i class="fa fa-percent metric-icon"></i>
						<div class="metric-label">Total Tax</div>
						<div class="metric-value">${format_currency(data.stats.total_tax || 0)}</div>
						<div class="metric-info">Tax amount collected</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card primary">
						<i class="fa fa-arrow-circle-up metric-icon"></i>
						<div class="metric-label">Highest Entry</div>
						<div class="metric-value">${format_currency(data.top_expenses && data.top_expenses.length > 0 ? data.top_expenses[0].total_amount : 0)}</div>
						<div class="metric-info">Maximum single expense</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card success">
						<i class="fa fa-tags metric-icon"></i>
						<div class="metric-label">Categories</div>
						<div class="metric-value">${data.expenses_by_type ? data.expenses_by_type.length : 0}</div>
						<div class="metric-info">Expense types tracked</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card warning">
						<i class="fa fa-sitemap metric-icon"></i>
						<div class="metric-label">Cost Centers</div>
						<div class="metric-value">${data.expenses_by_cost_center ? data.expenses_by_cost_center.length : 0}</div>
						<div class="metric-info">Active cost centers</div>
					</div>
				</div>
			</div>

			<!-- Company Breakdown Section (Only shown when "All" companies selected) -->
			${data.is_all_companies && data.expenses_by_company && data.expenses_by_company.length > 0 ? `
				<div class="row">
					<div class="col-sm-12">
						<div class="chart-card">
							<h5><i class="fa fa-building" style="color: #4c6ef5;"></i> Expenses by Company</h5>
							<div id="expenses-by-company-chart"></div>
						</div>
					</div>
				</div>

				<!-- Company Details Table -->
				<div class="row">
					<div class="col-sm-12">
						<div class="chart-card">
							<h5><i class="fa fa-table" style="color: #51cf66;"></i> Company Breakdown</h5>
							<div class="table-responsive">
								<table class="expenses-table">
									<thead>
										<tr>
											<th>Company</th>
											<th>Total Amount</th>
											<th>Count</th>
											<th>Average</th>
											<th>Total Tax</th>
										</tr>
									</thead>
									<tbody>
										${data.expenses_by_company.map(comp => `
											<tr>
												<td><strong>${comp.company}</strong></td>
												<td><span class="amount-badge">${format_currency(comp.total)}</span></td>
												<td>${comp.count}</td>
												<td>${format_currency(comp.average)}</td>
												<td>${format_currency(comp.total_tax || 0)}</td>
											</tr>
										`).join('')}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</div>
			` : ''}

			<!-- Charts Row 1: Monthly Trend (Full Width) -->
			<div class="row">
				<div class="col-sm-12">
					<div class="chart-card">
						<h5><i class="fa fa-line-chart" style="color: #4c6ef5;"></i> Monthly Expense Trend</h5>
						<div id="monthly-trend-chart"></div>
					</div>
				</div>
			</div>

			<!-- Charts Row 2: Pie and Bar Charts -->
			<div class="row">
				<div class="col-sm-6">
					<div class="chart-card">
						<h5><i class="fa fa-pie-chart" style="color: #51cf66;"></i> Expenses by Type</h5>
						<div id="expenses-by-type-chart"></div>
					</div>
				</div>
				<div class="col-sm-6">
					<div class="chart-card">
						<h5><i class="fa fa-bar-chart" style="color: #ffa94d;"></i> Expenses by Cost Center</h5>
						<div id="expenses-by-cost-center-chart"></div>
					</div>
				</div>
			</div>

			<!-- Charts Row 3: Additional Insights -->
			<div class="row">
				<div class="col-sm-6">
					<div class="chart-card">
						<h5><i class="fa fa-balance-scale" style="color: #4dabf7;"></i> Tax vs Net Amount</h5>
						<div id="tax-comparison-chart"></div>
					</div>
				</div>
				<div class="col-sm-6">
					<div class="chart-card">
						<h5><i class="fa fa-list-ol" style="color: #a78bfa;"></i> Expense Count by Type</h5>
						<div id="count-by-type-chart"></div>
					</div>
				</div>
			</div>

			<!-- Top Expenses Table -->
			<div class="row">
				<div class="col-sm-12">
					<div class="chart-card">
						<h5><i class="fa fa-trophy" style="color: #ffa94d;"></i> Top 10 Expenses</h5>
						<div class="table-responsive">
							<table class="expenses-table">
								<thead>
									<tr>
										<th>Entry ID</th>
										<th>Date</th>
										<th>Amount</th>
										<th>Cost Center</th>
										<th>Tax</th>
										<th>Remarks</th>
									</tr>
								</thead>
								<tbody>
									${data.top_expenses && data.top_expenses.length > 0 ?
										data.top_expenses.map(exp => `
											<tr>
												<td>
													<a href="/app/expense-entry/${exp.name}" class="expense-link" target="_blank">
														<i class="fa fa-external-link"></i> ${exp.name}
													</a>
												</td>
												<td>${frappe.datetime.str_to_user(exp.posting_date)}</td>
												<td><span class="amount-badge">${format_currency(exp.total_amount)}</span></td>
												<td>${exp.cost_center || '<span style="color: #8094ae;">-</span>'}</td>
												<td>${format_currency(exp.total_tax_amount || 0)}</td>
												<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${exp.remarks || ''}">${exp.remarks || '<span style="color: #8094ae;">No remarks</span>'}</td>
											</tr>
										`).join('')
										: '<tr><td colspan="6" class="text-center" style="padding: 40px; color: #8094ae;"><i class="fa fa-inbox" style="font-size: 48px; opacity: 0.3; display: block; margin-bottom: 15px;"></i>No expenses found</td></tr>'
									}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>
	`;

	page.main.html(html);

	// Attach debounced change event listeners to filters for auto-refresh
	const debouncedApplyFilters = debounce(apply_filters, 500);

	$('#filter-company').on('change', debouncedApplyFilters);
	$('#filter-from-date').on('change', debouncedApplyFilters);
	$('#filter-to-date').on('change', debouncedApplyFilters);
	$('#filter-cost-center').on('change', debouncedApplyFilters);
	$('#filter-expense-type').on('change', debouncedApplyFilters);

	// Restore full opacity
	page.main.find('.expenses-dashboard').css('opacity', '1');

	// Render charts with requestAnimationFrame for better performance
	requestAnimationFrame(() => {
		// Render company chart only if "All" companies selected
		if (data.is_all_companies && data.expenses_by_company && data.expenses_by_company.length > 0) {
			render_expenses_by_company_chart(data.expenses_by_company);
		}
		render_monthly_trend_chart(data.monthly_trend);
		render_expenses_by_type_chart(data.expenses_by_type);
		render_expenses_by_cost_center_chart(data.expenses_by_cost_center);
		render_tax_comparison_chart(data.expenses_by_type);
		render_count_by_type_chart(data.expenses_by_type);
	});
}

function apply_filters() {
	// Get filter values
	dashboard_filters.company = $('#filter-company').val();
	dashboard_filters.from_date = $('#filter-from-date').val() || null;
	dashboard_filters.to_date = $('#filter-to-date').val() || null;
	dashboard_filters.cost_center = $('#filter-cost-center').val() || null;
	dashboard_filters.expense_type = $('#filter-expense-type').val() || null;

	// Reload dashboard with new filters
	load_dashboard_data(window.expenses_dashboard_page);
}

function render_monthly_trend_chart(data) {
	const container = $('#monthly-trend-chart');

	if (!data || data.length === 0) {
		container.html('<div class="chart-loading"><i class="fa fa-line-chart"></i><p>No trend data available</p></div>');
		return;
	}

	try {
		// Destroy previous chart instance
		if (chart_instances.monthly_trend) {
			chart_instances.monthly_trend = null;
		}

		// Calculate average for comparison line
		const values = data.map(d => d.total);
		const average = values.reduce((a, b) => a + b, 0) / values.length;
		const avgLine = new Array(values.length).fill(average);

		chart_instances.monthly_trend = new frappe.Chart("#monthly-trend-chart", {
			data: {
				labels: data.map(d => d.month),
				datasets: [
					{
						name: "Monthly Expenses",
						values: values,
						chartType: 'line'
					},
					{
						name: "Average",
						values: avgLine,
						chartType: 'line'
					}
				]
			},
			type: 'axis-mixed',
			height: 380,
			colors: ['#4c6ef5', '#ff6b6b'],
			lineOptions: {
				regionFill: 1,
				hideDots: 0,
				heatline: 0,
				dotSize: 6,
				spline: 1
			},
			axisOptions: {
				xAxisMode: 'tick',
				xIsSeries: 1
			},
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			},
			valuesOverPoints: 0
		});
	} catch (e) {
		console.error("Error rendering monthly trend chart:", e);
		container.html('<div class="chart-loading"><i class="fa fa-exclamation-triangle text-danger"></i><p>Error rendering chart</p></div>');
	}
}

function render_expenses_by_company_chart(data) {
	const container = $('#expenses-by-company-chart');

	if (!data || data.length === 0) {
		container.html('<div class="chart-loading"><i class="fa fa-building"></i><p>No company data available</p></div>');
		return;
	}

	try {
		// Destroy previous chart instance
		if (chart_instances.expenses_by_company) {
			chart_instances.expenses_by_company = null;
		}

		// Modern color palette for companies
		var colors = [
			'#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b',
			'#4dabf7', '#a78bfa', '#fcc419', '#ff8787'
		];

		// Calculate percentages
		const totalExpenses = data.reduce((sum, d) => sum + d.total, 0);
		const dataWithPercentage = data.map(d => ({
			...d,
			percentage: ((d.total / totalExpenses) * 100).toFixed(1)
		}));

		chart_instances.expenses_by_company = new frappe.Chart("#expenses-by-company-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.company} (${d.percentage}%)`),
				datasets: [{
					name: "Total Expenses",
					values: data.map(d => d.total)
				}]
			},
			type: 'bar',
			height: 380,
			colors: colors,
			barOptions: {
				spaceRatio: 0.4
			},
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			},
			animate: 1,
			truncateLegends: 1
		});
	} catch (e) {
		console.error("Error rendering expenses by company chart:", e);
		container.html('<div class="chart-loading"><i class="fa fa-exclamation-triangle text-danger"></i><p>Error rendering chart</p></div>');
	}
}

function render_expenses_by_type_chart(data) {
	const container = $('#expenses-by-type-chart');

	if (!data || data.length === 0) {
		container.html('<div class="chart-loading"><i class="fa fa-pie-chart"></i><p>No type data available</p></div>');
		return;
	}

	try {
		// Destroy previous chart instance
		if (chart_instances.expenses_by_type) {
			chart_instances.expenses_by_type = null;
		}

		// Modern, distinct color palette
		var colors = [
			'#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b',
			'#4dabf7', '#a78bfa', '#fcc419', '#ff8787',
			'#69db7c', '#74c0fc', '#ffd43b', '#da77f2'
		];

		// Calculate percentages for better insights
		const totalExpenses = data.reduce((sum, d) => sum + d.total, 0);
		const dataWithPercentage = data.map(d => ({
			...d,
			percentage: ((d.total / totalExpenses) * 100).toFixed(1)
		}));

		chart_instances.expenses_by_type = new frappe.Chart("#expenses-by-type-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.expense_type || 'Unspecified'} (${d.percentage}%)`),
				datasets: [{
					values: data.map(d => d.total)
				}]
			},
			type: 'donut',
			height: 380,
			colors: colors,
			maxSlices: 10,
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			},
			animate: 1
		});
	} catch (e) {
		console.error("Error rendering expenses by type chart:", e);
		container.html('<div class="chart-loading"><i class="fa fa-exclamation-triangle text-danger"></i><p>Error rendering chart</p></div>');
	}
}

function render_expenses_by_cost_center_chart(data) {
	const container = $('#expenses-by-cost-center-chart');

	if (!data || data.length === 0) {
		container.html('<div class="chart-loading"><i class="fa fa-bar-chart"></i><p>No cost center data available</p></div>');
		return;
	}

	try {
		// Sort data by total for better visualization
		const sortedData = [...data].sort((a, b) => b.total - a.total).slice(0, 10);
		const totalAmount = sortedData.reduce((sum, d) => sum + d.total, 0);
		const maxValue = Math.max(...sortedData.map(d => d.total));

		// Create custom bar chart HTML
		let chartHtml = '<div class="custom-bar-chart" style="text-align: center;">';

		const gradients = [
			'linear-gradient(180deg, #4c6ef5 0%, #364fc7 100%)',
			'linear-gradient(180deg, #51cf66 0%, #40c057 100%)',
			'linear-gradient(180deg, #ffa94d 0%, #fd7e14 100%)',
			'linear-gradient(180deg, #ff6b6b 0%, #fa5252 100%)',
			'linear-gradient(180deg, #4dabf7 0%, #339af0 100%)',
			'linear-gradient(180deg, #a78bfa 0%, #9368e8 100%)',
			'linear-gradient(180deg, #fcc419 0%, #fab005 100%)',
			'linear-gradient(180deg, #ff8787 0%, #ff6b6b 100%)',
			'linear-gradient(180deg, #69db7c 0%, #51cf66 100%)',
			'linear-gradient(180deg, #74c0fc 0%, #4dabf7 100%)'
		];

		sortedData.forEach((d, index) => {
			const label = d.cost_center || 'Unspecified';
			const percentage = ((d.total / totalAmount) * 100).toFixed(1);
			const barHeight = Math.max((d.total / maxValue) * 250, 10); // Min height 10px, max 250px
			const gradient = gradients[index % gradients.length];

			chartHtml += `
				<div class="bar-group">
					<div class="bar-wrapper">
						<div class="bar-value">${percentage}%</div>
						<div class="bar" style="height: ${barHeight}px; background: ${gradient};"
							 title="${label}: ${format_currency(d.total)} (${percentage}%)"></div>
					</div>
					<div class="bar-label" title="${label}">${label}</div>
				</div>
			`;
		});

		chartHtml += '<div class="chart-axis"></div></div>';
		container.html(chartHtml);
	} catch (e) {
		console.error("Error rendering cost center chart:", e);
		container.html('<div class="chart-loading"><i class="fa fa-exclamation-triangle text-danger"></i><p>Error rendering chart</p></div>');
	}
}

function render_tax_comparison_chart(data) {
	const container = $('#tax-comparison-chart');

	if (!data || data.length === 0) {
		container.html('<div class="chart-loading"><i class="fa fa-bar-chart"></i><p>No data available</p></div>');
		return;
	}

	try {
		// Calculate total tax and net amounts
		const totalTax = data.reduce((sum, d) => sum + (d.total * 0.15 || 0), 0); // Assuming 15% tax
		const totalNet = data.reduce((sum, d) => sum + d.total, 0) - totalTax;

		chart_instances.tax_comparison = new frappe.Chart("#tax-comparison-chart", {
			data: {
				labels: ['Net Amount', 'Tax Amount'],
				datasets: [{
					values: [totalNet, totalTax]
				}]
			},
			type: 'donut',
			height: 350,
			colors: ['#4dabf7', '#ffa94d'],
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			},
			animate: 1
		});
	} catch (e) {
		console.error("Error rendering tax comparison chart:", e);
		container.html('<div class="chart-loading"><i class="fa fa-exclamation-triangle text-danger"></i><p>Error rendering chart</p></div>');
	}
}

function render_count_by_type_chart(data) {
	const container = $('#count-by-type-chart');

	if (!data || data.length === 0) {
		container.html('<div class="chart-loading"><i class="fa fa-bar-chart"></i><p>No data available</p></div>');
		return;
	}

	try {
		// Sort by count and take top 8
		const sortedData = [...data].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);
		const totalCount = sortedData.reduce((sum, d) => sum + (d.count || 0), 0);
		const maxCount = Math.max(...sortedData.map(d => d.count || 0));

		// Create custom bar chart HTML
		let chartHtml = '<div class="custom-bar-chart" style="text-align: center;">';

		const countGradients = [
			'linear-gradient(180deg, #a78bfa 0%, #9368e8 100%)',
			'linear-gradient(180deg, #4dabf7 0%, #339af0 100%)',
			'linear-gradient(180deg, #fcc419 0%, #fab005 100%)',
			'linear-gradient(180deg, #ff6b6b 0%, #fa5252 100%)',
			'linear-gradient(180deg, #51cf66 0%, #40c057 100%)',
			'linear-gradient(180deg, #4c6ef5 0%, #364fc7 100%)',
			'linear-gradient(180deg, #ffa94d 0%, #fd7e14 100%)',
			'linear-gradient(180deg, #ff8787 0%, #ff6b6b 100%)'
		];

		sortedData.forEach((d, index) => {
			const label = d.expense_type || 'Unspecified';
			const count = d.count || 0;
			const percentage = ((count / totalCount) * 100).toFixed(1);
			const barHeight = Math.max((count / maxCount) * 250, 10); // Min height 10px, max 250px
			const gradient = countGradients[index % countGradients.length];

			chartHtml += `
				<div class="bar-group">
					<div class="bar-wrapper">
						<div class="bar-value">${count} (${percentage}%)</div>
						<div class="bar" style="height: ${barHeight}px; background: ${gradient};"
							 title="${label}: ${count} entries (${percentage}%)"></div>
					</div>
					<div class="bar-label" title="${label}">${label}</div>
				</div>
			`;
		});

		chartHtml += '<div class="chart-axis"></div></div>';
		container.html(chartHtml);
	} catch (e) {
		console.error("Error rendering count by type chart:", e);
		container.html('<div class="chart-loading"><i class="fa fa-exclamation-triangle text-danger"></i><p>Error rendering chart</p></div>');
	}
}

function format_currency(value) {
	if (!value) value = 0;

	var currency = frappe.boot.sysdefaults.currency || frappe.defaults.get_default('currency') || 'USD';
	var precision = frappe.boot.sysdefaults.currency_precision || 2;

	// Format number with commas and decimals
	var formatted = parseFloat(value).toFixed(precision).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

	// Add currency symbol
	return currency + ' ' + formatted;
}

function export_dashboard_data() {
	frappe.msgprint({
		title: __('Export Dashboard Data'),
		indicator: 'blue',
		message: __('Exporting dashboard data with current filters...') + '<br><br>' +
			'<strong>Filters:</strong><br>' +
			'Company: ' + (dashboard_filters.company || 'All') + '<br>' +
			'Date Range: ' + (dashboard_filters.from_date || 'N/A') + ' to ' + (dashboard_filters.to_date || 'N/A') + '<br>' +
			'Cost Center: ' + (dashboard_filters.cost_center || 'All') + '<br>' +
			'Expense Type: ' + (dashboard_filters.expense_type || 'All')
	});

	frappe.call({
		method: 'expenses_management.expenses_management.page.expenses_dashboard.expenses_dashboard.get_dashboard_data',
		args: dashboard_filters,
		callback: function(r) {
			if (r.message) {
				// Convert to CSV and download
				var csv_data = convert_to_csv(r.message);
				download_csv(csv_data, 'expenses_dashboard_export_' + frappe.datetime.now_datetime().replace(/[^0-9]/g, '') + '.csv');
				frappe.show_alert({message: __('Dashboard data exported successfully'), indicator: 'green'}, 3);
			}
		}
	});
}

function convert_to_csv(data) {
	var csv = 'Expense Entry,Date,Amount,Cost Center,Tax Amount,Remarks\n';

	if (data.top_expenses) {
		data.top_expenses.forEach(function(exp) {
			csv += `"${exp.name}","${exp.posting_date}","${exp.total_amount}","${exp.cost_center || ''}","${exp.total_tax_amount || 0}","${(exp.remarks || '').replace(/"/g, '""')}"\n`;
		});
	}

	return csv;
}

function download_csv(csv_data, filename) {
	var blob = new Blob([csv_data], { type: 'text/csv;charset=utf-8;' });
	var link = document.createElement('a');
	var url = URL.createObjectURL(blob);
	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.visibility = 'hidden';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

// Make apply_filters globally accessible
window.apply_filters = apply_filters;
