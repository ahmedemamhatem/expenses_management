import React, { useState, useEffect } from 'react';
import ReactFrappeChart from 'react-frappe-charts';

const ExpensesDashboard = () => {
	const [dashboardData, setDashboardData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filters, setFilters] = useState({
		company: null,
		from_date: null,
		to_date: null,
		cost_center: null,
		expense_type: null
	});
	const [filterOptions, setFilterOptions] = useState({
		companies: [],
		cost_centers: [],
		expense_types: []
	});

	// Fetch filter options on mount
	useEffect(() => {
		frappe.call({
			method: 'expenses_management.expenses_management.page.expenses_dashboard.expenses_dashboard.get_filter_options',
			callback: (r) => {
				if (r.message) {
					setFilterOptions(r.message);
					if (r.message.companies.length > 0) {
						setFilters(prev => ({ ...prev, company: r.message.companies[0] }));
					}
				}
			}
		});
	}, []);

	// Fetch dashboard data
	useEffect(() => {
		setLoading(true);
		frappe.call({
			method: 'expenses_management.expenses_management.page.expenses_dashboard.expenses_dashboard.get_dashboard_data',
			args: filters,
			callback: (r) => {
				setLoading(false);
				if (r.message) {
					setDashboardData(r.message);
				} else {
					setError('No data available');
				}
			},
			error: (r) => {
				setLoading(false);
				setError('Error loading dashboard data');
			}
		});
	}, [filters]);

	const handleFilterChange = (field, value) => {
		setFilters(prev => ({ ...prev, [field]: value }));
	};

	const formatCurrency = (value) => {
		if (!value) value = 0;
		const currency = frappe.boot.sysdefaults.currency || 'USD';
		const formatted = parseFloat(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		return `${currency} ${formatted}`;
	};

	if (loading) {
		return (
			<div className="text-center" style={{ padding: '50px' }}>
				<i className="fa fa-spinner fa-spin fa-3x"></i>
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center text-danger" style={{ padding: '50px' }}>
				{error}
			</div>
		);
	}

	if (!dashboardData) {
		return (
			<div className="text-center text-muted" style={{ padding: '50px' }}>
				No data available
			</div>
		);
	}

	return (
		<div className="expenses-dashboard-react" style={{ padding: '15px' }}>
			{/* Filter Section */}
			<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
				<h5 style={{ marginBottom: '15px' }}>Filters</h5>
				<div className="row">
					<div className="col-sm-3">
						<label>Company</label>
						<select
							className="form-control"
							value={filters.company || ''}
							onChange={(e) => handleFilterChange('company', e.target.value)}
						>
							{filterOptions.companies.map(company => (
								<option key={company} value={company}>{company}</option>
							))}
						</select>
					</div>
					<div className="col-sm-2">
						<label>From Date</label>
						<input
							type="date"
							className="form-control"
							value={filters.from_date || ''}
							onChange={(e) => handleFilterChange('from_date', e.target.value)}
						/>
					</div>
					<div className="col-sm-2">
						<label>To Date</label>
						<input
							type="date"
							className="form-control"
							value={filters.to_date || ''}
							onChange={(e) => handleFilterChange('to_date', e.target.value)}
						/>
					</div>
					<div className="col-sm-2">
						<label>Cost Center</label>
						<select
							className="form-control"
							value={filters.cost_center || ''}
							onChange={(e) => handleFilterChange('cost_center', e.target.value || null)}
						>
							<option value="">All</option>
							{filterOptions.cost_centers.map(cc => (
								<option key={cc} value={cc}>{cc}</option>
							))}
						</select>
					</div>
					<div className="col-sm-2">
						<label>Expense Type</label>
						<select
							className="form-control"
							value={filters.expense_type || ''}
							onChange={(e) => handleFilterChange('expense_type', e.target.value || null)}
						>
							<option value="">All</option>
							{filterOptions.expense_types.map(type => (
								<option key={type} value={type}>{type}</option>
							))}
						</select>
					</div>
					<div className="col-sm-1" style={{ paddingTop: '24px' }}>
						<button
							className="btn btn-primary btn-sm"
							onClick={() => setFilters(prev => ({ ...prev }))}
						>
							<i className="fa fa-refresh"></i>
						</button>
					</div>
				</div>
			</div>

			{/* Summary Cards */}
			<div className="row">
				<div className="col-sm-3">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h6 style={{ marginBottom: '10px', color: '#6c757d' }}>Total Expenses</h6>
						<h3 style={{ marginBottom: '5px', color: '#2c3e50' }}>{formatCurrency(dashboardData.current_period.total)}</h3>
						<div style={{ color: dashboardData.current_period.change >= 0 ? '#28a745' : '#dc3545', fontSize: '12px' }}>
							<i className={`fa fa-arrow-${dashboardData.current_period.change >= 0 ? 'up' : 'down'}`}></i>
							{' '}{Math.abs(dashboardData.current_period.change).toFixed(1)}% vs previous
						</div>
					</div>
				</div>
				<div className="col-sm-3">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h6 style={{ marginBottom: '10px', color: '#6c757d' }}>Year to Date</h6>
						<h3 style={{ marginBottom: '5px', color: '#2c3e50' }}>{formatCurrency(dashboardData.year_to_date.total)}</h3>
						<div style={{ color: '#6c757d', fontSize: '12px' }}>Total this year</div>
					</div>
				</div>
				<div className="col-sm-3">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h6 style={{ marginBottom: '10px', color: '#6c757d' }}>Expense Count</h6>
						<h3 style={{ marginBottom: '5px', color: '#2c3e50' }}>{dashboardData.stats.count}</h3>
						<div style={{ color: '#6c757d', fontSize: '12px' }}>Total entries</div>
					</div>
				</div>
				<div className="col-sm-3">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h6 style={{ marginBottom: '10px', color: '#6c757d' }}>Average Expense</h6>
						<h3 style={{ marginBottom: '5px', color: '#2c3e50' }}>{formatCurrency(dashboardData.stats.average)}</h3>
						<div style={{ color: '#6c757d', fontSize: '12px' }}>Per entry</div>
					</div>
				</div>
			</div>

			{/* Monthly Trend Chart */}
			<div className="row">
				<div className="col-sm-12">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h5 style={{ marginBottom: '15px' }}>Monthly Trend</h5>
						{dashboardData.monthly_trend && dashboardData.monthly_trend.length > 0 ? (
							<ReactFrappeChart
								type="line"
								data={{
									labels: dashboardData.monthly_trend.map(d => d.month),
									datasets: [{
										name: 'Total Expenses',
										values: dashboardData.monthly_trend.map(d => d.total)
									}]
								}}
								height={250}
								colors={['#2490ef']}
							/>
						) : (
							<p className="text-muted text-center">No data available</p>
						)}
					</div>
				</div>
			</div>

			{/* Charts Row */}
			<div className="row">
				<div className="col-sm-6">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h5 style={{ marginBottom: '15px' }}>Top Expenses by Type</h5>
						{dashboardData.expenses_by_type && dashboardData.expenses_by_type.length > 0 ? (
							<ReactFrappeChart
								type="pie"
								data={{
									labels: dashboardData.expenses_by_type.map(d => d.expense_type || 'Unspecified'),
									datasets: [{
										values: dashboardData.expenses_by_type.map(d => d.total)
									}]
								}}
								height={250}
								colors={['#2490ef', '#7cd6fd', '#ff6384', '#36a2eb', '#ffcd56', '#4bc0c0', '#9966ff', '#ff9f40', '#ff6384', '#c9cbcf']}
							/>
						) : (
							<p className="text-muted text-center">No data available</p>
						)}
					</div>
				</div>
				<div className="col-sm-6">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h5 style={{ marginBottom: '15px' }}>Expenses by Cost Center</h5>
						{dashboardData.expenses_by_cost_center && dashboardData.expenses_by_cost_center.length > 0 ? (
							<ReactFrappeChart
								type="bar"
								data={{
									labels: dashboardData.expenses_by_cost_center.map(d => d.cost_center || 'Unspecified'),
									datasets: [{
										name: 'Expenses',
										values: dashboardData.expenses_by_cost_center.map(d => d.total)
									}]
								}}
								height={250}
								colors={['#2490ef']}
							/>
						) : (
							<p className="text-muted text-center">No data available</p>
						)}
					</div>
				</div>
			</div>

			{/* Top Expenses Table */}
			<div className="row">
				<div className="col-sm-12">
					<div className="card" style={{ border: '1px solid #d1d8dd', borderRadius: '4px', padding: '20px', marginBottom: '15px' }}>
						<h5 style={{ marginBottom: '15px' }}>Top 10 Expenses</h5>
						{dashboardData.top_expenses && dashboardData.top_expenses.length > 0 ? (
							<table className="table table-bordered">
								<thead>
									<tr>
										<th>Entry</th>
										<th>Date</th>
										<th>Amount</th>
										<th>Cost Center</th>
										<th>Remarks</th>
									</tr>
								</thead>
								<tbody>
									{dashboardData.top_expenses.map((expense, idx) => (
										<tr key={idx}>
											<td>
												<a href={`/app/expense-entry/${expense.name}`} target="_blank" rel="noopener noreferrer">
													{expense.name}
												</a>
											</td>
											<td>{expense.posting_date}</td>
											<td>{formatCurrency(expense.total_amount)}</td>
											<td>{expense.cost_center || '-'}</td>
											<td>{expense.remarks || '-'}</td>
										</tr>
									))}
								</tbody>
							</table>
						) : (
							<p className="text-muted text-center">No data available</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ExpensesDashboard;
