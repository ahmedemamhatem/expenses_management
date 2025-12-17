# Expenses Management Installation Guide

## Installation Steps

### 1. Install the Frappe app

```bash
# From the frappe-bench directory
bench get-app /path/to/expenses_management
bench --site your-site.local install-app expenses_management
```

### 2. Install Node.js dependencies and build React dashboard

After installing the app, you need to install the React dependencies and build the dashboard:

```bash
cd apps/expenses_management
npm install
npm run build
```

This will:
- Install React, ReactDOM, and react-frappe-charts
- Install build tools (esbuild, Babel)
- Build the React dashboard bundle to `expenses_management/public/js/expenses_dashboard_react.bundle.js`

### 3. Clear cache and rebuild assets

```bash
# From the frappe-bench directory
bench --site your-site.local clear-cache
bench build --app expenses_management
```

## Usage

After installation, you can access:

1. **Classic Dashboard** (JavaScript): Navigate to `/app/expenses-dashboard`
2. **React Dashboard** (with react-frappe-charts): Navigate to `/app/expenses-dashboard-react`

The React dashboard includes:
- Interactive filters (Company, Date Range, Cost Center, Expense Type)
- Real-time chart updates
- Modern React components with react-frappe-charts
- Top expenses table
- Multiple visualization types (line, pie, bar charts)

## Development

### Watch mode for React development

If you're developing the React dashboard:

```bash
cd apps/expenses_management
npm run watch
```

This will automatically rebuild the bundle when you make changes to the React components.

### File Structure

```
expenses_management/
├── package.json                          # Node.js dependencies
├── build.js                              # esbuild configuration
├── expenses_management/
│   └── public/
│       └── js/
│           ├── react_dashboard/
│           │   ├── ExpensesDashboard.jsx # Main React component
│           │   └── index.jsx             # Entry point
│           └── expenses_dashboard_react.bundle.js  # Built bundle
└── expenses_management/
    └── page/
        ├── expenses_dashboard/           # Classic dashboard
        └── expenses_dashboard_react/     # React dashboard
```

## Dependencies

### Node.js Packages
- `react`: ^19.2.3
- `react-dom`: ^19.2.3
- `react-frappe-charts`: ^4.1.0
- `esbuild`: ^0.27.2 (dev)
- `@babel/core`: ^7.28.5 (dev)
- `@babel/preset-env`: ^7.28.5 (dev)
- `@babel/preset-react`: ^7.28.5 (dev)

All dependencies are automatically installed when you run `npm install`.
