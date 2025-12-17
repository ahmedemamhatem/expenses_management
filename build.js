const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
	entryPoints: ['expenses_management/public/js/react_dashboard/index.jsx'],
	bundle: true,
	outfile: 'expenses_management/public/js/expenses_dashboard_react.bundle.js',
	format: 'iife',
	platform: 'browser',
	target: ['es2015'],
	loader: {
		'.jsx': 'jsx',
		'.js': 'jsx'
	},
	jsx: 'transform',
	jsxFactory: 'React.createElement',
	jsxFragment: 'React.Fragment',
	external: [],
	minify: false,
	sourcemap: true,
	define: {
		'process.env.NODE_ENV': '"production"'
	}
}).then(() => {
	console.log('✓ React dashboard bundle built successfully');
}).catch((error) => {
	console.error('Build failed:', error);
	process.exit(1);
});
