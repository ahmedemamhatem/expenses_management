frappe.pages['expenses-dashboard-react'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Expenses Dashboard',
		single_column: true
	});

	// Create main container for React app
	page.main = $('<div class="expenses-dashboard-react-container"></div>').appendTo(page.body);

	// Add refresh button
	page.set_secondary_action('Refresh', function() {
		// Unmount and remount React component
		if (window.unmountExpensesDashboard) {
			window.unmountExpensesDashboard(page.main[0]);
		}
		if (window.mountExpensesDashboard) {
			window.mountExpensesDashboard(page.main[0]);
		}
	}, 'octicon octicon-sync');

	// Add button to create new expense
	page.add_inner_button(__('New Expense Entry'), function() {
		frappe.new_doc('Expense Entry');
	});

	// Load the React bundle
	frappe.require('/assets/expenses_management/js/expenses_dashboard_react.bundle.js', function() {
		// Mount the React dashboard
		if (window.mountExpensesDashboard) {
			window.mountExpensesDashboard(page.main[0]);
		} else {
			page.main.html('<div class="text-center text-danger" style="padding: 50px;">Error: React dashboard bundle not loaded properly</div>');
		}
	});
};

frappe.pages['expenses-dashboard-react'].on_page_show = function(wrapper) {
	// Optional: refresh data when page is shown
};
