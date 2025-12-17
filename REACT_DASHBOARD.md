# React Dashboard with react-frappe-charts

This document explains the React-based dashboard implementation for the Expenses Management app.

## Overview

The Expenses Management app now includes **two dashboard options**:

1. **Classic Dashboard** (`/app/expenses-dashboard`) - Vanilla JavaScript with Frappe Charts
2. **React Dashboard** (`/app/expenses-dashboard-react`) - Modern React with react-frappe-charts

## Features

The React dashboard includes:

### Interactive Filters
- **Company**: Select which company to view expenses for
- **Date Range**: Filter by From Date and To Date
- **Cost Center**: Filter expenses by cost center
- **Expense Type**: Filter by specific expense types
- **Real-time Updates**: Charts and data update automatically when filters change

### Summary Cards
1. **Total Expenses** - Shows current period total with percentage change vs previous period
2. **Year to Date** - Total expenses for the current year
3. **Expense Count** - Number of expense entries
4. **Average Expense** - Average amount per entry

### Visualizations (using react-frappe-charts)
1. **Monthly Trend** - Line chart showing expense trends over the last 12 months
2. **Top Expenses by Type** - Pie chart showing distribution by expense type
3. **Expenses by Cost Center** - Bar chart showing expenses per cost center
4. **Top 10 Expenses Table** - Clickable table with highest expense entries

## Technical Implementation

### Architecture

```
React Component (ExpensesDashboard.jsx)
    ↓
Uses react-frappe-charts for visualizations
    ↓
Fetches data from Python backend API
    ↓
Backend returns filtered dashboard data
```

### File Structure

```
expenses_management/
├── package.json                              # Node.js dependencies
├── build.js                                  # esbuild bundler config
├── expenses_management/
│   ├── public/
│   │   └── js/
│   │       ├── react_dashboard/
│   │       │   ├── ExpensesDashboard.jsx     # Main React component
│   │       │   └── index.jsx                 # Entry point & mount logic
│   │       └── expenses_dashboard_react.bundle.js  # Compiled bundle
│   └── expenses_management/
│       └── page/
│           └── expenses_dashboard_react/
│               ├── __init__.py
│               ├── expenses_dashboard_react.json  # Page config
│               └── expenses_dashboard_react.js    # Page loader
```

### Build Process

The build process uses **esbuild** for fast bundling:

1. Source: `ExpensesDashboard.jsx` (React component)
2. Bundler: esbuild with JSX transform
3. Output: `expenses_dashboard_react.bundle.js` (IIFE format for browser)

### React 18+ API

The implementation uses React 18's new `createRoot()` API:

```javascript
import { createRoot } from 'react-dom/client';

let root = createRoot(container);
root.render(<ExpensesDashboard />);
```

This replaces the deprecated `ReactDOM.render()` method.

## Dependencies

### Production Dependencies
- `react@^19.2.3` - React library
- `react-dom@^19.2.3` - React DOM rendering
- `react-frappe-charts@^4.1.0` - React wrapper for Frappe Charts

### Development Dependencies
- `esbuild@^0.27.2` - Fast JavaScript bundler
- `@babel/core@^7.28.5` - Babel compiler core
- `@babel/preset-env@^7.28.5` - Babel preset for modern JS
- `@babel/preset-react@^7.28.5` - Babel preset for React/JSX

## Installation

### Automatic (Recommended)

When you install the `expenses_management` app, the post-install hook automatically:
1. Runs `npm install` to install dependencies
2. Runs `npm run build` to build the React bundle

```bash
bench --site your-site.local install-app expenses_management
```

### Manual

If automatic installation fails, manually run:

```bash
cd apps/expenses_management
npm install
npm run build
```

## Development

### Watch Mode

For development with auto-rebuild on file changes:

```bash
cd apps/expenses_management
npm run watch
```

(Note: Watch mode script needs to be implemented with `--watch` flag in build.js)

### Making Changes

1. Edit `expenses_management/public/js/react_dashboard/ExpensesDashboard.jsx`
2. Run `npm run build` to rebuild the bundle
3. Refresh the browser to see changes

### Adding New Charts

To add a new chart using react-frappe-charts:

```jsx
<ReactFrappeChart
  type="bar"  // line, bar, pie, percentage, heatmap
  data={{
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{
      name: 'Sales',
      values: [100, 200, 150]
    }]
  }}
  height={250}
  colors={['#2490ef']}
/>
```

## API Endpoints

The React dashboard uses these backend methods:

### get_dashboard_data
```python
@frappe.whitelist()
def get_dashboard_data(company=None, from_date=None, to_date=None,
                       cost_center=None, expense_type=None)
```

Returns:
- `current_period`: {total, change, from_date, to_date}
- `year_to_date`: {total}
- `stats`: {count, average, total_tax}
- `expenses_by_type`: [{expense_type, total, count}]
- `expenses_by_cost_center`: [{cost_center, total, count}]
- `monthly_trend`: [{month, total}]
- `top_expenses`: [{name, posting_date, total_amount, cost_center, remarks}]

### get_filter_options
```python
@frappe.whitelist()
def get_filter_options()
```

Returns:
- `companies`: [list of company names]
- `cost_centers`: [list of cost center names]
- `expense_types`: [list of expense type names]

## Benefits of React Implementation

1. **Component Reusability** - React components can be reused across the app
2. **State Management** - Efficient handling of filters and data updates
3. **Modern Development** - Leverages React ecosystem and tooling
4. **Better UX** - Smooth updates without full page reloads
5. **Maintainability** - Clear component structure and separation of concerns
6. **Type Safety** - Can be extended with TypeScript in the future

## Comparison: Classic vs React Dashboard

| Feature | Classic Dashboard | React Dashboard |
|---------|------------------|-----------------|
| Technology | Vanilla JS + jQuery | React + JSX |
| Charts | Frappe Charts (direct) | react-frappe-charts |
| Filters | Not implemented | Fully functional |
| State | DOM-based | React state |
| Bundle Size | Smaller | Larger (~600KB) |
| Development | Simple | Modern workflow |
| Performance | Good | Excellent |

## Troubleshooting

### Bundle not loading
- Ensure `npm run build` completed successfully
- Check browser console for errors
- Verify bundle exists at `/assets/expenses_management/js/expenses_dashboard_react.bundle.js`

### Charts not rendering
- Check that data is being fetched (Network tab)
- Verify react-frappe-charts is installed: `npm list react-frappe-charts`
- Check console for React errors

### Build errors
- Delete `node_modules` and run `npm install` again
- Ensure Node.js version is 14+ and npm is 6+
- Check for syntax errors in JSX files

## Future Enhancements

Potential improvements for the React dashboard:

1. **TypeScript** - Add type safety
2. **Export Features** - Export charts as PNG/PDF
3. **Drill-down** - Click on charts to see detailed data
4. **Date Range Presets** - Quick filters like "Last 7 Days", "This Month"
5. **Saved Filters** - Remember user's filter preferences
6. **Real-time Updates** - WebSocket updates for live data
7. **Responsive Design** - Better mobile experience
8. **Dark Mode** - Theme support
9. **Chart Customization** - User-configurable colors and styles
10. **CSV Export** - Export table data

## License

MIT License - Same as the Expenses Management app
