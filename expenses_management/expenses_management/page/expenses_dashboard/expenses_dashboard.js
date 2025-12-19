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

			/* Metric Cards - Ultra Compact Design */
			.metric-card {
				background: white;
				border: 1px solid #e9ecef;
				border-radius: 8px;
				padding: 14px 16px;
				margin-bottom: 16px;
				transition: all 0.2s ease;
				height: 100%;
			}

			.metric-card:hover {
				border-color: #dee2e6;
				box-shadow: 0 2px 8px rgba(0,0,0,0.06);
			}

			.metric-card .metric-label {
				font-size: 11px;
				color: #868e96;
				font-weight: 500;
				margin-bottom: 6px;
				display: block;
				text-transform: uppercase;
				letter-spacing: 0.3px;
			}

			.metric-card .metric-value {
				font-size: 22px;
				font-weight: 700;
				color: #212529;
				margin-bottom: 4px;
				line-height: 1;
			}

			.metric-card .metric-info {
				font-size: 11px;
				color: #adb5bd;
			}

			.metric-card.primary {
				border-left: 3px solid #4c6ef5;
			}

			.metric-card.success {
				border-left: 3px solid #51cf66;
			}

			.metric-card.warning {
				border-left: 3px solid #ffa94d;
			}

			.metric-card.info {
				border-left: 3px solid #4dabf7;
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

			/* Chart Cards */
			.chart-card {
				background: white;
				border: 1px solid #e9ecef;
				border-radius: 10px;
				padding: 24px;
				margin-bottom: 24px;
			}

			.chart-card h5 {
				font-size: 16px;
				font-weight: 600;
				color: #212529;
				margin-bottom: 20px;
				padding-bottom: 12px;
				border-bottom: 2px solid #f1f3f5;
			}

			/* Custom bar chart styles */
			.custom-bar-chart {
				padding: 20px 10px;
			}

			.custom-bar-chart .bar-group {
				display: inline-block;
				text-align: center;
				margin: 0 8px;
				vertical-align: bottom;
			}

			.custom-bar-chart .bar-wrapper {
				position: relative;
				display: inline-block;
			}

			.custom-bar-chart .bar {
				width: 45px;
				background: linear-gradient(180deg, #51cf66 0%, #40c057 100%);
				border-radius: 4px 4px 0 0;
				transition: all 0.3s ease;
				position: relative;
				display: inline-block;
			}

			.custom-bar-chart .bar:hover {
				opacity: 0.8;
				transform: translateY(-3px);
			}

			.custom-bar-chart .bar-value {
				position: absolute;
				top: -25px;
				left: 50%;
				transform: translateX(-50%);
				font-size: 11px;
				font-weight: 600;
				color: #495057;
				white-space: nowrap;
			}

			.custom-bar-chart .bar-label {
				margin-top: 8px;
				font-size: 12px;
				color: #495057;
				font-weight: 500;
				max-width: 80px;
				word-wrap: break-word;
				line-height: 1.4;
				min-height: 35px;
			}

			.custom-bar-chart .chart-axis {
				border-top: 2px solid #dee2e6;
				margin-top: 10px;
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

			/* Table Styles */
			.expenses-table {
				width: 100%;
				border-collapse: collapse;
			}

			.expenses-table thead th {
				background: #f8f9fa;
				color: #495057;
				font-weight: 600;
				font-size: 13px;
				text-align: left;
				padding: 14px 16px;
				border-bottom: 2px solid #dee2e6;
			}

			.expenses-table tbody td {
				padding: 14px 16px;
				border-bottom: 1px solid #e9ecef;
				font-size: 14px;
				color: #212529;
			}

			.expenses-table tbody tr {
				transition: background 0.15s ease;
			}

			.expenses-table tbody tr:hover {
				background: #f8f9fa;
			}

			.expense-link {
				color: #4c6ef5;
				font-weight: 500;
				text-decoration: none;
				transition: color 0.15s ease;
			}

			.expense-link:hover {
				color: #364fc7;
				text-decoration: underline;
			}

			/* Badge Styles */
			.amount-badge {
				background: #e7f5ff;
				color: #1864ab;
				padding: 4px 12px;
				border-radius: 4px;
				font-weight: 600;
				font-size: 13px;
				display: inline-block;
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
				font-size: 24px;
				margin-bottom: 12px;
				opacity: 0.4;
			}

			.chart-loading p {
				font-size: 14px;
				color: #6a737d;
				margin: 0;
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
						<div class="metric-label">Year to Date</div>
						<div class="metric-value">${format_currency(data.year_to_date.total)}</div>
						<div class="metric-info">${new Date().getFullYear()} total expenses</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card info">
						<div class="metric-label">Total Entries</div>
						<div class="metric-value">${data.stats.count}</div>
						<div class="metric-info">Expense entries logged</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card warning">
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
						<div class="metric-label">Total Tax</div>
						<div class="metric-value">${format_currency(data.stats.total_tax || 0)}</div>
						<div class="metric-info">Tax amount collected</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card primary">
						<div class="metric-label">Highest Entry</div>
						<div class="metric-value">${format_currency(data.top_expenses && data.top_expenses.length > 0 ? data.top_expenses[0].total_amount : 0)}</div>
						<div class="metric-info">Maximum single expense</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card success">
						<div class="metric-label">Categories</div>
						<div class="metric-value">${data.expenses_by_type ? data.expenses_by_type.length : 0}</div>
						<div class="metric-info">Expense types tracked</div>
					</div>
				</div>
				<div class="col-sm-3">
					<div class="metric-card warning">
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
							<h5>📊 Expenses by Company</h5>
							<div id="expenses-by-company-chart"></div>
						</div>
					</div>
				</div>

				<!-- Company Details Table -->
				<div class="row">
					<div class="col-sm-12">
						<div class="chart-card">
							<h5>💼 Company Breakdown</h5>
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
						<h5>Monthly Expense Trend</h5>
						<div id="monthly-trend-chart"></div>
					</div>
				</div>
			</div>

			<!-- Charts Row 2: Pie and Bar Charts -->
			<div class="row">
				<div class="col-sm-6">
					<div class="chart-card">
						<h5>Expenses by Type</h5>
						<div id="expenses-by-type-chart"></div>
					</div>
				</div>
				<div class="col-sm-6">
					<div class="chart-card">
						<h5>Expenses by Cost Center</h5>
						<div id="expenses-by-cost-center-chart"></div>
					</div>
				</div>
			</div>

			<!-- Charts Row 3: Additional Insights -->
			<div class="row">
				<div class="col-sm-6">
					<div class="chart-card">
						<h5>Tax vs Net Amount</h5>
						<div id="tax-comparison-chart"></div>
					</div>
				</div>
				<div class="col-sm-6">
					<div class="chart-card">
						<h5>Expense Count by Type</h5>
						<div id="count-by-type-chart"></div>
					</div>
				</div>
			</div>

			<!-- Top Expenses Table -->
			<div class="row">
				<div class="col-sm-12">
					<div class="chart-card">
						<h5>Top 10 Expenses</h5>
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
			height: 350,
			colors: ['#4c6ef5', '#ff6b6b'],
			lineOptions: {
				regionFill: 1,
				hideDots: 0,
				heatline: 0,
				dotSize: 5,
				spline: 1
			},
			axisOptions: {
				xAxisMode: 'tick',
				xIsSeries: 1
			},
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
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
			height: 350,
			colors: colors,
			barOptions: {
				spaceRatio: 0.5
			},
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
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
			type: 'percentage',
			height: 350,
			colors: colors,
			maxSlices: 10,
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
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

		sortedData.forEach((d) => {
			const label = d.cost_center || 'Unspecified';
			const percentage = ((d.total / totalAmount) * 100).toFixed(1);
			const barHeight = Math.max((d.total / maxValue) * 250, 10); // Min height 10px, max 250px

			chartHtml += `
				<div class="bar-group">
					<div class="bar-wrapper">
						<div class="bar-value">${percentage}%</div>
						<div class="bar" style="height: ${barHeight}px; background: linear-gradient(180deg, #51cf66 0%, #40c057 100%);"
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
			type: 'pie',
			height: 300,
			colors: ['#4dabf7', '#ffa94d'],
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
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

		sortedData.forEach((d) => {
			const label = d.expense_type || 'Unspecified';
			const count = d.count || 0;
			const percentage = ((count / totalCount) * 100).toFixed(1);
			const barHeight = Math.max((count / maxCount) * 250, 10); // Min height 10px, max 250px

			chartHtml += `
				<div class="bar-group">
					<div class="bar-wrapper">
						<div class="bar-value">${count} (${percentage}%)</div>
						<div class="bar" style="height: ${barHeight}px; background: linear-gradient(180deg, #a78bfa 0%, #9368e8 100%);"
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
