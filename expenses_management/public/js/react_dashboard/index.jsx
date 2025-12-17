import React from 'react';
import { createRoot } from 'react-dom/client';
import ExpensesDashboard from './ExpensesDashboard.jsx';

// Store the root instance
let root = null;

// Export function to mount the React dashboard
window.mountExpensesDashboard = function(container) {
	if (root) {
		root.unmount();
	}
	root = createRoot(container);
	root.render(<ExpensesDashboard />);
};

// Export function to unmount the React dashboard
window.unmountExpensesDashboard = function(container) {
	if (root) {
		root.unmount();
		root = null;
	}
};
