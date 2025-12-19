frappe.pages['expenses-dashboard'].on_page_load = function(wrapper) {
	new ExpensesDashboard(wrapper);
}

const chart_instances = {};
let dashboard_filters = { company: null, from_date: null, to_date: null, cost_center: null, expense_type: null };
let filter_options = { companies: [], cost_centers: [], expense_types: [] };

class ExpensesDashboard {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Expenses Dashboard',
			single_column: true
		});
		window.expenses_dashboard_page = this.page;
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
	Object.keys(chart_instances).forEach(key => { if (chart_instances[key]) chart_instances[key] = null; });

	var html = `
		<style>
			* { box-sizing: border-box; }
			.expenses-dashboard { padding: 16px; background: #f8f9fa; min-height: calc(100vh - 80px); }
			.filter-section { background: white; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
			.filter-row { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
			.filter-item { flex: 1; min-width: 140px; }
			.filter-item label { font-size: 10px; font-weight: 700; color: #495057; margin-bottom: 4px; display: block; text-transform: uppercase; letter-spacing: 0.5px; }
			.filter-item select, .filter-item input { width: 100%; border-radius: 6px; border: 1px solid #ced4da; font-size: 13px; height: 32px; padding: 4px 10px; transition: all 0.2s; background: white; }
			.filter-item select:focus, .filter-item input:focus { border-color: #4c6ef5; box-shadow: 0 0 0 2px rgba(76,110,245,0.1); outline: none; }
			.btn-refresh { height: 32px; padding: 0 16px; border-radius: 6px; background: linear-gradient(135deg, #4c6ef5, #364fc7); color: white; border: none; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.3s; box-shadow: 0 3px 8px rgba(76,110,245,0.3); }
			.btn-refresh:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(76,110,245,0.4); }
			.metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
			.metric-card { background: white; border-radius: 10px; padding: 16px; position: relative; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); transition: all 0.3s; }
			.metric-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(180deg, #4c6ef5, #51cf66); }
			.metric-card:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
			.metric-icon { position: absolute; top: 16px; right: 16px; font-size: 24px; opacity: 0.1; }
			.metric-label { font-size: 10px; color: #868e96; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
			.metric-value { font-size: 20px; font-weight: 800; color: #212529; margin-bottom: 4px; }
			.metric-info { font-size: 10px; color: #adb5bd; font-weight: 500; }
			.metric-change { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
			.metric-change.positive { background: #d3f9d8; color: #2b8a3e; }
			.metric-change.negative { background: #ffe3e3; color: #c92a2a; }
			.chart-full { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px; transition: all 0.3s; }
			.chart-full:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
			.chart-full h5 { font-size: 15px; font-weight: 700; color: #212529; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px; }
			.data-table { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
			.expenses-table { width: 100%; border-collapse: separate; border-spacing: 0; }
			.expenses-table thead th { background: #f8f9fa; color: #495057; font-weight: 700; font-size: 11px; text-align: left; padding: 10px 12px; border-bottom: 2px solid #dee2e6; }
			.expenses-table thead th:first-child { border-radius: 6px 0 0 0; }
			.expenses-table thead th:last-child { border-radius: 0 6px 0 0; }
			.expenses-table tbody td { padding: 10px 12px; border-bottom: 1px solid #e9ecef; font-size: 12px; color: #212529; }
			.expenses-table tbody tr { transition: all 0.2s; }
			.expenses-table tbody tr:hover { background: #f8f9fa; }
			.amount-badge { background: linear-gradient(135deg, #e7f5ff, #d0ebff); color: #1864ab; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; display: inline-block; }
			.expense-link { color: #4c6ef5; font-weight: 600; text-decoration: none; }
			.expense-link:hover { color: #364fc7; }
			@media (max-width: 1200px) {
				.metrics-grid { grid-template-columns: repeat(2, 1fr); }
			}
			@media (max-width: 768px) {
				.metrics-grid { grid-template-columns: 1fr; }
				.filter-row { flex-direction: column; }
				.filter-item { width: 100%; }
			}
		</style>

		<div class="expenses-dashboard">
			<div class="filter-section">
				<div class="filter-row">
					<div class="filter-item">
						<label>Company</label>
						<select class="form-control" id="filter-company">
							${filter_options.companies.map(c => `<option value="${c}" ${c === dashboard_filters.company ? 'selected' : ''}>${c}</option>`).join('')}
						</select>
					</div>
					<div class="filter-item">
						<label>From Date</label>
						<input type="date" class="form-control" id="filter-from-date" value="${dashboard_filters.from_date || data.current_period.from_date}">
					</div>
					<div class="filter-item">
						<label>To Date</label>
						<input type="date" class="form-control" id="filter-to-date" value="${dashboard_filters.to_date || data.current_period.to_date}">
					</div>
					<div class="filter-item">
						<label>Cost Center</label>
						<select class="form-control" id="filter-cost-center">
							<option value="">All</option>
							${filter_options.cost_centers.map(cc => `<option value="${cc}" ${cc === dashboard_filters.cost_center ? 'selected' : ''}>${cc}</option>`).join('')}
						</select>
					</div>
					<div class="filter-item">
						<label>Expense Type</label>
						<select class="form-control" id="filter-expense-type">
							<option value="">All</option>
							${filter_options.expense_types.map(et => `<option value="${et}" ${et === dashboard_filters.expense_type ? 'selected' : ''}>${et}</option>`).join('')}
						</select>
					</div>
					<div class="filter-item" style="flex: 0 0 auto;">
						<label>&nbsp;</label>
						<button class="btn-refresh" onclick="apply_filters()"><i class="fa fa-refresh"></i> Refresh</button>
					</div>
				</div>
			</div>

			<div class="metrics-grid">
				<div class="metric-card">
					<i class="fa fa-money metric-icon"></i>
					<div class="metric-label">Total Expenses</div>
					<div class="metric-value">${format_currency(data.current_period.total)}</div>
					<div class="metric-change ${data.current_period.change >= 0 ? 'positive' : 'negative'}">
						<i class="fa fa-arrow-${data.current_period.change >= 0 ? 'up' : 'down'}"></i> ${Math.abs(data.current_period.change).toFixed(1)}%
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
			</div>

			${data.is_all_companies && data.expenses_by_company && data.expenses_by_company.length > 0 ? `
				<div class="chart-full">
					<h5><i class="fa fa-building" style="color: #4c6ef5;"></i> Expenses by Company</h5>
					<div id="expenses-by-company-chart"></div>
				</div>
			` : ''}

			<div class="chart-full">
				<h5><i class="fa fa-line-chart" style="color: #4c6ef5;"></i> Monthly Expense Trend</h5>
				<div id="monthly-trend-chart"></div>
			</div>

			<div class="chart-full">
				<h5><i class="fa fa-pie-chart" style="color: #51cf66;"></i> Expenses by Type</h5>
				<div id="expenses-by-type-chart"></div>
			</div>

			<div class="chart-full">
				<h5><i class="fa fa-bar-chart" style="color: #ffa94d;"></i> Expenses by Cost Center</h5>
				<div id="expenses-by-cost-center-chart"></div>
			</div>

			<div class="chart-full">
				<h5><i class="fa fa-balance-scale" style="color: #4dabf7;"></i> Tax vs Net Amount</h5>
				<div id="tax-comparison-chart"></div>
			</div>

			<div class="chart-full">
				<h5><i class="fa fa-list-ol" style="color: #a78bfa;"></i> Entry Count by Type</h5>
				<div id="count-by-type-chart"></div>
			</div>

			<div class="chart-full">
				<h5><i class="fa fa-calendar" style="color: #ff6b6b;"></i> Daily Expense Trend</h5>
				<div id="daily-trend-chart"></div>
			</div>

			<div class="data-table">
				<h5 style="font-size: 15px; font-weight: 700; margin: 0 0 14px 0;">
					<i class="fa fa-trophy" style="color: #ffa94d;"></i> Top 10 Expenses
				</h5>
				<table class="expenses-table">
					<thead>
						<tr><th>Entry ID</th><th>Date</th><th>Amount</th><th>Cost Center</th><th>Tax</th><th>Remarks</th></tr>
					</thead>
					<tbody>
						${data.top_expenses && data.top_expenses.length > 0 ?
							data.top_expenses.map(exp => `
								<tr>
									<td><a href="/app/expense-entry/${exp.name}" class="expense-link" target="_blank"><i class="fa fa-external-link"></i> ${exp.name}</a></td>
									<td>${frappe.datetime.str_to_user(exp.posting_date)}</td>
									<td><span class="amount-badge">${format_currency(exp.total_amount)}</span></td>
									<td>${exp.cost_center || '-'}</td>
									<td>${format_currency(exp.total_tax_amount || 0)}</td>
									<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${exp.remarks || ''}">${exp.remarks || 'No remarks'}</td>
								</tr>
							`).join('')
							: '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #8094ae;">No expenses found</td></tr>'
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
		render_daily_trend_chart(data.monthly_trend);
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
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		if (chart_instances.monthly_trend) chart_instances.monthly_trend = null;
		const values = data.map(d => d.total);
		const average = values.reduce((a, b) => a + b, 0) / values.length;
		const avgLine = new Array(values.length).fill(average);
		chart_instances.monthly_trend = new frappe.Chart("#monthly-trend-chart", {
			data: {
				labels: data.map(d => d.month),
				datasets: [
					{ name: "Expenses", values: values, chartType: 'line' },
					{ name: "Average", values: avgLine, chartType: 'line' }
				]
			},
			type: 'axis-mixed',
			height: 300,
			colors: ['#4c6ef5', '#ff6b6b'],
			lineOptions: { regionFill: 1, hideDots: 0, dotSize: 6, spline: 1 },
			axisOptions: { xAxisMode: 'tick', xIsSeries: 1 },
			tooltipOptions: { formatTooltipY: d => format_currency(d) }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
	}
}

function render_expenses_by_company_chart(data) {
	const container = $('#expenses-by-company-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		if (chart_instances.expenses_by_company) chart_instances.expenses_by_company = null;
		var colors = ['#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b', '#4dabf7', '#a78bfa', '#fcc419', '#ff8787'];
		const total = data.reduce((sum, d) => sum + d.total, 0);
		const dataWithPercentage = data.map(d => ({ ...d, percentage: ((d.total / total) * 100).toFixed(1) }));
		chart_instances.expenses_by_company = new frappe.Chart("#expenses-by-company-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.company} (${d.percentage}%)`),
				datasets: [{ name: "Total", values: data.map(d => d.total) }]
			},
			type: 'bar',
			height: 300,
			colors: colors,
			barOptions: { spaceRatio: 0.3 },
			tooltipOptions: { formatTooltipY: d => format_currency(d) }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
	}
}

function render_expenses_by_type_chart(data) {
	const container = $('#expenses-by-type-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		if (chart_instances.expenses_by_type) chart_instances.expenses_by_type = null;
		var colors = ['#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b', '#4dabf7', '#a78bfa', '#fcc419', '#ff8787'];
		const total = data.reduce((sum, d) => sum + d.total, 0);
		const dataWithPercentage = data.map(d => ({ ...d, percentage: ((d.total / total) * 100).toFixed(1) }));
		chart_instances.expenses_by_type = new frappe.Chart("#expenses-by-type-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.expense_type || 'Unspecified'} (${d.percentage}%)`),
				datasets: [{ name: "Amount", values: data.map(d => d.total) }]
			},
			type: 'bar',
			height: 350,
			colors: colors,
			barOptions: { spaceRatio: 0.3 },
			tooltipOptions: { formatTooltipY: d => format_currency(d) }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
	}
}

function render_expenses_by_cost_center_chart(data) {
	const container = $('#expenses-by-cost-center-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		const sortedData = [...data].sort((a, b) => b.total - a.total).slice(0, 8);
		const total = sortedData.reduce((sum, d) => sum + d.total, 0);
		const dataWithPercentage = sortedData.map(d => ({ ...d, percentage: ((d.total / total) * 100).toFixed(1) }));
		var colors = ['#4c6ef5', '#51cf66', '#ffa94d', '#ff6b6b', '#4dabf7', '#a78bfa', '#fcc419', '#ff8787'];
		chart_instances.expenses_by_cost_center = new frappe.Chart("#expenses-by-cost-center-chart", {
			data: {
				labels: dataWithPercentage.map(d => `${d.cost_center || 'Unspecified'} (${d.percentage}%)`),
				datasets: [{ name: "Expenses", values: sortedData.map(d => d.total) }]
			},
			type: 'bar',
			height: 350,
			colors: colors,
			barOptions: { spaceRatio: 0.3 },
			tooltipOptions: { formatTooltipY: d => format_currency(d) }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
	}
}

function render_tax_comparison_chart(data) {
	const container = $('#tax-comparison-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		const totalTax = data.reduce((sum, d) => sum + (d.total * 0.15 || 0), 0);
		const totalNet = data.reduce((sum, d) => sum + d.total, 0) - totalTax;
		chart_instances.tax_comparison = new frappe.Chart("#tax-comparison-chart", {
			data: {
				labels: ['Net Amount', 'Tax Amount'],
				datasets: [{ name: "Amount", values: [totalNet, totalTax] }]
			},
			type: 'bar',
			height: 300,
			colors: ['#4dabf7', '#ffa94d'],
			barOptions: { spaceRatio: 0.5 },
			tooltipOptions: { formatTooltipY: d => format_currency(d) }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
	}
}

function render_count_by_type_chart(data) {
	const container = $('#count-by-type-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		const sortedData = [...data].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 6);
		var colors = ['#a78bfa', '#4dabf7', '#fcc419', '#ff6b6b', '#51cf66', '#4c6ef5'];
		chart_instances.count_by_type = new frappe.Chart("#count-by-type-chart", {
			data: {
				labels: sortedData.map(d => d.expense_type || 'Unspecified'),
				datasets: [{ name: "Count", values: sortedData.map(d => d.count || 0) }]
			},
			type: 'bar',
			height: 300,
			colors: colors,
			barOptions: { spaceRatio: 0.3 },
			tooltipOptions: { formatTooltipY: d => d + ' entries' }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
	}
}

function render_daily_trend_chart(data) {
	const container = $('#daily-trend-chart');
	if (!data || data.length === 0) {
		container.html('<div style="text-align:center;padding:30px;color:#868e96;">No data</div>');
		return;
	}
	try {
		const values = data.map(d => d.total);
		chart_instances.daily_trend = new frappe.Chart("#daily-trend-chart", {
			data: {
				labels: data.map(d => d.month.substring(0, 3)),
				datasets: [{ name: "Expenses", values: values }]
			},
			type: 'bar',
			height: 300,
			colors: ['#ff6b6b'],
			barOptions: { spaceRatio: 0.3 },
			tooltipOptions: { formatTooltipY: d => format_currency(d) }
		});
	} catch (e) {
		console.error("Error:", e);
		container.html('<div style="text-align:center;padding:30px;color:#ff6b6b;">Error</div>');
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
