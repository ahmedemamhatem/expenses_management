frappe.pages['expenses-dashboard'].on_page_load = function(wrapper) {
	new ExpensesDashboard(wrapper);
}

// Chart instances cache
const chart_instances = {
	monthly_trend: null,
	expenses_by_type: null,
	expenses_by_cost_center: null,
	expenses_by_company: null,
	tax_comparison: null,
	count_by_type: null
};

// Dashboard filters
let dashboard_filters = {
	company: null,
	from_date: null,
	to_date: null,
	cost_center: null,
	expense_type: null
};

// Filter options cache
let filter_options = {
	companies: [],
	cost_centers: [],
	expense_types: []
};

class ExpensesDashboard {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Expenses Dashboard',
			single_column: true
		});

		window.expenses_dashboard_page = this.page;

		// Load filter options first
		frappe.call({
			method: 'expenses_management.expenses_management.page.expenses_dashboard.expenses_dashboard.get_filter_options',
			callback: (r) => {
				if (r.message) {
					filter_options = r.message;
					dashboard_filters.company = "All";
					load_dashboard_data(this.page);
				}
			}
		});
	}
}

function load_dashboard_data(page) {
	page.main.find('.expenses-dashboard').css('opacity', '0.5');

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
	Object.keys(chart_instances).forEach(key => {
		if (chart_instances[key]) {
			chart_instances[key] = null;
		}
	});

	var html = `
		<style>
			.expenses-dashboard {
				padding: 20px;
				background: #f5f7fa;
				min-height: calc(100vh - 100px);
			}
			.filter-section {
				background: white;
				border-radius: 12px;
				padding: 16px 20px;
				margin-bottom: 20px;
				box-shadow: 0 2px 8px rgba(0,0,0,0.06);
			}
			.filter-row {
				display: flex;
				gap: 12px;
				align-items: end;
				flex-wrap: wrap;
			}
			.filter-item {
				flex: 1;
				min-width: 150px;
			}
			.filter-item label {
				font-size: 11px;
				font-weight: 700;
				color: #495057;
				margin-bottom: 6px;
				display: block;
				text-transform: uppercase;
				letter-spacing: 0.5px;
			}
			.filter-item select,
			.filter-item input {
				width: 100%;
				border-radius: 8px;
				border: 1px solid #dee2e6;
				font-size: 13px;
				height: 36px;
				padding: 6px 12px;
				transition: all 0.2s ease;
				background: white;
			}
			.filter-item select:focus,
			.filter-item input:focus {
				border-color: #4c6ef5;
				box-shadow: 0 0 0 3px rgba(76, 110, 245, 0.1);
				outline: none;
			}
			.btn-refresh {
				height: 36px;
				padding: 0 20px;
				border-radius: 8px;
				background: linear-gradient(135deg, #4c6ef5 0%, #364fc7 100%);
				color: white;
				border: none;
				font-weight: 600;
				font-size: 13px;
				cursor: pointer;
				transition: all 0.3s ease;
				box-shadow: 0 4px 12px rgba(76, 110, 245, 0.3);
			}
			.btn-refresh:hover {
				transform: translateY(-2px);
				box-shadow: 0 6px 20px rgba(76, 110, 245, 0.4);
			}
			.metrics-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
				gap: 16px;
				margin-bottom: 20px;
			}
			.metric-card {
				background: white;
				border-radius: 12px;
				padding: 20px;
				position: relative;
				overflow: hidden;
				box-shadow: 0 2px 8px rgba(0,0,0,0.06);
				transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
			}
			.metric-card::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				width: 4px;
				height: 100%;
				background: linear-gradient(180deg, #4c6ef5, #51cf66);
			}
			.metric-card:hover {
				transform: translateY(-4px);
				box-shadow: 0 8px 24px rgba(0,0,0,0.12);
			}
			.metric-icon {
				position: absolute;
				top: 20px;
				right: 20px;
				font-size: 28px;
				opacity: 0.1;
			}
			.metric-label {
				font-size: 11px;
				color: #868e96;
				font-weight: 700;
				margin-bottom: 8px;
				text-transform: uppercase;
				letter-spacing: 0.5px;
			}
			.metric-value {
				font-size: 24px;
				font-weight: 800;
				color: #212529;
				margin-bottom: 6px;
			}
			.metric-info {
				font-size: 11px;
				color: #adb5bd;
				font-weight: 500;
			}
			.metric-change {
				display: inline-flex;
				align-items: center;
				gap: 4px;
				font-size: 11px;
				font-weight: 700;
				padding: 3px 8px;
				border-radius: 6px;
			}
			.metric-change.positive {
				background: #d3f9d8;
				color: #2b8a3e;
			}
			.metric-change.negative {
				background: #ffe3e3;
				color: #c92a2a;
			}
			.charts-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
				gap: 16px;
				margin-bottom: 20px;
			}
			.chart-card {
				background: white;
				border-radius: 12px;
				padding: 24px;
				box-shadow: 0 2px 8px rgba(0,0,0,0.06);
				transition: all 0.3s ease;
			}
			.chart-card:hover {
				box-shadow: 0 8px 24px rgba(0,0,0,0.1);
			}
			.chart-card h5 {
				font-size: 16px;
				font-weight: 700;
				color: #212529;
				margin: 0 0 20px 0;
				display: flex;
				align-items: center;
				gap: 8px;
			}
			.chart-full {
				grid-column: 1 / -1;
			}
			.data-table {
				background: white;
				border-radius: 12px;
				padding: 24px;
				box-shadow: 0 2px 8px rgba(0,0,0,0.06);
			}
			.expenses-table {
				width: 100%;
				border-collapse: separate;
				border-spacing: 0;
			}
			.expenses-table thead th {
				background: #f8f9fa;
				color: #495057;
				font-weight: 700;
				font-size: 12px;
				text-align: left;
				padding: 14px 16px;
				border-bottom: 2px solid #dee2e6;
			}
			.expenses-table thead th:first-child {
				border-radius: 8px 0 0 0;
			}
			.expenses-table thead th:last-child {
				border-radius: 0 8px 0 0;
			}
			.expenses-table tbody td {
				padding: 12px 16px;
				border-bottom: 1px solid #e9ecef;
				font-size: 13px;
				color: #212529;
			}
			.expenses-table tbody tr {
				transition: all 0.2s ease;
			}
			.expenses-table tbody tr:hover {
				background: #f8f9fa;
			}
			.amount-badge {
				background: linear-gradient(135deg, #e7f5ff 0%, #d0ebff 100%);
				color: #1864ab;
				padding: 4px 10px;
				border-radius: 6px;
				font-weight: 700;
				font-size: 12px;
				display: inline-block;
			}
			.expense-link {
				color: #4c6ef5;
				font-weight: 600;
				text-decoration: none;
			}
			.expense-link:hover {
				color: #364fc7;
			}
			@media (max-width: 768px) {
				.charts-grid {
					grid-template-columns: 1fr;
				}
				.filter-row {
					flex-direction: column;
				}
				.filter-item {
					width: 100%;
				}
			}
		</style>

		<div class="expenses-dashboard">
			<div class="filter-section">
				<div class="filter-row">
					<div class="filter-item">
						<label>Company</label>
						<select class="form-control" id="filter-company">
							${filter_options.companies.map(c =>
								`<option value="${c}" ${c === dashboard_filters.company ? 'selected' : ''}>${c}</option>`
							).join('')}
						</select>
					</div>
					<div class="filter-item">
						<label>From Date</label>
						<input type="date" class="form-control" id="filter-from-date"
							value="${dashboard_filters.from_date || data.current_period.from_date}">
					</div>
					<div class="filter-item">
						<label>To Date</label>
						<input type="date" class="form-control" id="filter-to-date"
							value="${dashboard_filters.to_date || data.current_period.to_date}">
					</div>
					<div class="filter-item">
						<label>Cost Center</label>
						<select class="form-control" id="filter-cost-center">
							<option value="">All</option>
							${filter_options.cost_centers.map(cc =>
								`<option value="${cc}" ${cc === dashboard_filters.cost_center ? 'selected' : ''}>${cc}</option>`
							).join('')}
						</select>
					</div>
					<div class="filter-item">
						<label>Expense Type</label>
						<select class="form-control" id="filter-expense-type">
							<option value="">All</option>
							${filter_options.expense_types.map(et =>
								`<option value="${et}" ${et === dashboard_filters.expense_type ? 'selected' : ''}>${et}</option>`
							).join('')}
						</select>
					</div>
					<div class="filter-item" style="flex: 0 0 auto;">
						<label>&nbsp;</label>
						<button class="btn-refresh" onclick="apply_filters()">
							<i class="fa fa-refresh"></i> Refresh
						</button>
					</div>
				</div>
			</div>

			<div class="metrics-grid">
				<div class="metric-card">
					<i class="fa fa-money metric-icon"></i>
					<div class="metric-label">Total Expenses</div>
					<div class="metric-value">${format_currency(data.current_period.total)}</div>
					<div class="metric-change ${data.current_period.change >= 0 ? 'positive' : 'negative'}">
						<i class="fa fa-arrow-${data.current_period.change >= 0 ? 'up' : 'down'}"></i>
						${Math.abs(data.current_period.change).toFixed(1)}%
					</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-calendar-check-o metric-icon"></i>
					<div class="metric-label">Year to Date</div>
					<div class="metric-value">${format_currency(data.year_to_date.total)}</div>
					<div class="metric-info">${new Date().getFullYear()} total</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-file-text-o metric-icon"></i>
					<div class="metric-label">Total Entries</div>
					<div class="metric-value">${data.stats.count}</div>
					<div class="metric-info">Entries logged</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-calculator metric-icon"></i>
					<div class="metric-label">Average Amount</div>
					<div class="metric-value">${format_currency(data.stats.average)}</div>
					<div class="metric-info">Per entry</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-percent metric-icon"></i>
					<div class="metric-label">Total Tax</div>
					<div class="metric-value">${format_currency(data.stats.total_tax || 0)}</div>
					<div class="metric-info">Tax collected</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-arrow-circle-up metric-icon"></i>
					<div class="metric-label">Highest Entry</div>
					<div class="metric-value">${format_currency(data.top_expenses && data.top_expenses.length > 0 ? data.top_expenses[0].total_amount : 0)}</div>
					<div class="metric-info">Maximum expense</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-tags metric-icon"></i>
					<div class="metric-label">Categories</div>
					<div class="metric-value">${data.expenses_by_type ? data.expenses_by_type.length : 0}</div>
					<div class="metric-info">Expense types</div>
				</div>
				<div class="metric-card">
					<i class="fa fa-sitemap metric-icon"></i>
					<div class="metric-label">Cost Centers</div>
					<div class="metric-value">${data.expenses_by_cost_center ? data.expenses_by_cost_center.length : 0}</div>
					<div class="metric-info">Active centers</div>
				</div>
			</div>

			${data.is_all_companies && data.expenses_by_company && data.expenses_by_company.length > 0 ? `
				<div class="chart-card chart-full" style="margin-bottom: 20px;">
					<h5><i class="fa fa-building" style="color: #4c6ef5;"></i> Expenses by Company</h5>
					<div id="expenses-by-company-chart"></div>
				</div>
				<div class="data-table" style="margin-bottom: 20px;">
					<h5 style="font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">
						<i class="fa fa-table" style="color: #51cf66;"></i> Company Breakdown
					</h5>
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
			` : ''}

			<div class="chart-card chart-full" style="margin-bottom: 20px;">
				<h5><i class="fa fa-line-chart" style="color: #4c6ef5;"></i> Monthly Expense Trend</h5>
				<div id="monthly-trend-chart"></div>
			</div>

			<div class="charts-grid">
				<div class="chart-card">
					<h5><i class="fa fa-pie-chart" style="color: #51cf66;"></i> Expenses by Type</h5>
					<div id="expenses-by-type-chart"></div>
				</div>
				<div class="chart-card">
					<h5><i class="fa fa-bar-chart" style="color: #ffa94d;"></i> Expenses by Cost Center</h5>
					<div id="expenses-by-cost-center-chart"></div>
				</div>
				<div class="chart-card">
					<h5><i class="fa fa-balance-scale" style="color: #4dabf7;"></i> Tax vs Net Amount</h5>
					<div id="tax-comparison-chart"></div>
				</div>
				<div class="chart-card">
					<h5><i class="fa fa-list-ol" style="color: #a78bfa;"></i> Expense Count by Type</h5>
					<div id="count-by-type-chart"></div>
				</div>
			</div>

			<div class="data-table">
				<h5 style="font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">
					<i class="fa fa-trophy" style="color: #ffa94d;"></i> Top 10 Expenses
				</h5>
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
									<td>${exp.cost_center || '-'}</td>
									<td>${format_currency(exp.total_tax_amount || 0)}</td>
									<td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${exp.remarks || ''}">${exp.remarks || 'No remarks'}</td>
								</tr>
							`).join('')
							: '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #8094ae;">No expenses found</td></tr>'
						}
					</tbody>
				</table>
			</div>
		</div>
	`;

	page.main.html(html);

	const debouncedApplyFilters = debounce(apply_filters, 500);
	$('#filter-company').on('change', debouncedApplyFilters);
	$('#filter-from-date').on('change', debouncedApplyFilters);
	$('#filter-to-date').on('change', debouncedApplyFilters);
	$('#filter-cost-center').on('change', debouncedApplyFilters);
	$('#filter-expense-type').on('change', debouncedApplyFilters);

	page.main.find('.expenses-dashboard').css('opacity', '1');

	requestAnimationFrame(() => {
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
	dashboard_filters.company = $('#filter-company').val();
	dashboard_filters.from_date = $('#filter-from-date').val() || null;
	dashboard_filters.to_date = $('#filter-to-date').val() || null;
	dashboard_filters.cost_center = $('#filter-cost-center').val() || null;
	dashboard_filters.expense_type = $('#filter-expense-type').val() || null;
	load_dashboard_data(window.expenses_dashboard_page);
}

function render_monthly_trend_chart(data) {
	const container = $('#monthly-trend-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:40px;color:#868e96;">No data available</div>');
		return;
	}
	try {
		if (chart_instances.monthly_trend) {
			chart_instances.monthly_trend = null;
		}
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
			height: 320,
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
			}
		});
	} catch (e) {
		console.error("Error rendering monthly trend chart:", e);
		container.html('<div style="text-align:center;padding:40px;color:#ff6b6b;">Error rendering chart</div>');
	}
}

function render_expenses_by_company_chart(data) {
	const container = $('#expenses-by-company-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:40px;color:#868e96;">No data available</div>');
		return;
	}
	try {
		if (chart_instances.expenses_by_company) {
			chart_instances.expenses_by_company = null;
		}
		var colors = ['#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b', '#4dabf7', '#a78bfa', '#fcc419', '#ff8787'];
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
			height: 320,
			colors: colors,
			barOptions: {
				spaceRatio: 0.4
			},
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
		});
	} catch (e) {
		console.error("Error rendering expenses by company chart:", e);
		container.html('<div style="text-align:center;padding:40px;color:#ff6b6b;">Error rendering chart</div>');
	}
}

function render_expenses_by_type_chart(data) {
	const container = $('#expenses-by-type-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:40px;color:#868e96;">No data available</div>');
		return;
	}
	try {
		if (chart_instances.expenses_by_type) {
			chart_instances.expenses_by_type = null;
		}
		var colors = ['#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b', '#4dabf7', '#a78bfa', '#fcc419', '#ff8787', '#69db7c', '#74c0fc'];
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
			height: 300,
			colors: colors,
			maxSlices: 10,
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
		});
	} catch (e) {
		console.error("Error rendering expenses by type chart:", e);
		container.html('<div style="text-align:center;padding:40px;color:#ff6b6b;">Error rendering chart</div>');
	}
}

function render_expenses_by_cost_center_chart(data) {
	const container = $('#expenses-by-cost-center-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:40px;color:#868e96;">No data available</div>');
		return;
	}
	try {
		const sortedData = [...data].sort((a, b) => b.total - a.total).slice(0, 10);
		const totalAmount = sortedData.reduce((sum, d) => sum + d.total, 0);
		const dataWithPercentage = sortedData.map(d => ({
			...d,
			percentage: ((d.total / totalAmount) * 100).toFixed(1)
		}));
		var colors = ['#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b', '#4dabf7', '#a78bfa', '#fcc419', '#ff8787', '#69db7c', '#74c0fc'];
		chart_instances.expenses_by_cost_center = new frappe.Chart("#expenses-by-cost-center-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.cost_center || 'Unspecified'} (${d.percentage}%)`),
				datasets: [{
					name: "Expenses",
					values: sortedData.map(d => d.total)
				}]
			},
			type: 'bar',
			height: 300,
			colors: colors,
			barOptions: {
				spaceRatio: 0.3
			},
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
		});
	} catch (e) {
		console.error("Error rendering cost center chart:", e);
		container.html('<div style="text-align:center;padding:40px;color:#ff6b6b;">Error rendering chart</div>');
	}
}

function render_tax_comparison_chart(data) {
	const container = $('#tax-comparison-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:40px;color:#868e96;">No data available</div>');
		return;
	}
	try {
		const totalTax = data.reduce((sum, d) => sum + (d.total * 0.15 || 0), 0);
		const totalNet = data.reduce((sum, d) => sum + d.total, 0) - totalTax;
		chart_instances.tax_comparison = new frappe.Chart("#tax-comparison-chart", {
			data: {
				labels: ['Net Amount', 'Tax Amount'],
				datasets: [{
					values: [totalNet, totalTax]
				}]
			},
			type: 'donut',
			height: 300,
			colors: ['#4dabf7', '#ffa94d'],
			tooltipOptions: {
				formatTooltipY: d => format_currency(d)
			}
		});
	} catch (e) {
		console.error("Error rendering tax comparison chart:", e);
		container.html('<div style="text-align:center;padding:40px;color:#ff6b6b;">Error rendering chart</div>');
	}
}

function render_count_by_type_chart(data) {
	const container = $('#count-by-type-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:40px;color:#868e96;">No data available</div>');
		return;
	}
	try {
		const sortedData = [...data].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);
		const totalCount = sortedData.reduce((sum, d) => sum + (d.count || 0), 0);
		const dataWithPercentage = sortedData.map(d => ({
			...d,
			percentage: (((d.count || 0) / totalCount) * 100).toFixed(1)
		}));
		var colors = ['#a78bfa', '#4dabf7', '#fcc419', '#ff6b6b', '#51cf66', '#4c6ef5', '#ffa94d', '#ff8787'];
		chart_instances.count_by_type = new frappe.Chart("#count-by-type-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.expense_type || 'Unspecified'} (${d.count})`),
				datasets: [{
					name: "Count",
					values: sortedData.map(d => d.count || 0)
				}]
			},
			type: 'bar',
			height: 300,
			colors: colors,
			barOptions: {
				spaceRatio: 0.3
			},
			tooltipOptions: {
				formatTooltipY: d => d + ' entries'
			}
		});
	} catch (e) {
		console.error("Error rendering count by type chart:", e);
		container.html('<div style="text-align:center;padding:40px;color:#ff6b6b;">Error rendering chart</div>');
	}
}

function format_currency(value) {
	if (!value) value = 0;
	var currency = frappe.boot.sysdefaults.currency || frappe.defaults.get_default('currency') || 'USD';
	var precision = frappe.boot.sysdefaults.currency_precision || 2;
	var formatted = parseFloat(value).toFixed(precision).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return currency + ' ' + formatted;
}

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

window.apply_filters = apply_filters;
