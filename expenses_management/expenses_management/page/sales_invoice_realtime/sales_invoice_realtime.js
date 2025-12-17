frappe.pages['sales-invoice-realtime'].on_page_load = function(wrapper) {
	// Remove default Frappe page styling
	$(wrapper).find('.layout-main-section-wrapper').css({
		'padding': '0',
		'margin': '0'
	});

	$(wrapper).find('.page-head').hide();

	new SalesInvoiceRealtimeDashboard(wrapper);
};

class SalesInvoiceRealtimeDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.container = $('<div class="realtime-dashboard-container"></div>');
		this.container.css({
			'padding': '0',
			'margin': '0',
			'width': '100vw',
			'height': '100vh',
			'position': 'fixed',
			'top': '0',
			'left': '0',
			'z-index': '999',
			'overflow': 'hidden'
		});

		// Append to body for full screen
		$('body').append(this.container);

		this.popup_timer = null;
		this.current_popup_invoice = null;
		this.popup_show_time = null;
		this.polling_interval = null;
		this.last_checked_invoice = null;

		this.init();
	}

	init() {
		console.log('Sales Invoice Realtime Dashboard initializing...');
		this.inject_styles();
		this.setup_layout();
		console.log('Layout setup complete');
		this.load_invoices();
		this.start_polling();
	}

	inject_styles() {
		if ($('#realtime-dashboard-styles').length) return;

		const styleContent = `
			/* Arabic RTL Support */
			* {
				font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
			}

			body, .realtime-dashboard-container {
				direction: rtl;
			}

			/* Hide navbar */
			.navbar, .desk-sidebar, .page-head, header {
				display: none !important;
			}

			/* Remove Frappe default styles */
			.page-container { padding: 0 !important; margin: 0 !important; }
			.layout-main-section { padding: 0 !important; margin: 0 !important; }

			/* Animated gradient background */
			@keyframes gradientShift {
				0% { background-position: 0% 50%; }
				50% { background-position: 100% 50%; }
				100% { background-position: 0% 50%; }
			}

			/* Full screen layout */
			.sales-realtime-wrapper {
				position: fixed;
				top: 0;
				left: 0;
				width: 100vw;
				height: 100vh;
				background: #f8f9fa;
				z-index: 999;
				overflow: hidden;
			}

			/* Floating particles effect - Removed */
			.sales-realtime-wrapper::before {
				display: none;
			}

			@keyframes float {
				0%, 100% { transform: translateY(0px); }
				50% { transform: translateY(-30px); }
			}

			/* Popup Card - Ultra Advanced Design */
			.popup-invoice-card {
				position: fixed;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%) scale(0.85);
				width: 95%;
				max-width: 1600px;
				max-height: 92vh;
				background: linear-gradient(145deg, #ffffff 0%, #f5f7ff 100%);
				border-radius: 32px;
				box-shadow:
					0 60px 120px rgba(0, 0, 0, 0.35),
					0 0 0 2px rgba(255, 255, 255, 0.6) inset,
					0 0 100px rgba(102, 126, 234, 0.4);
				padding: 0;
				z-index: 1001;
				animation: popupEntrance 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
				opacity: 0;
				overflow: hidden;
				direction: rtl;
				display: flex;
				flex-direction: column;
			}

			@keyframes popupEntrance {
				0% {
					opacity: 0;
					transform: translate(-50%, -50%) scale(0.85) rotateX(15deg);
				}
				100% {
					opacity: 1;
					transform: translate(-50%, -50%) scale(1) rotateX(0deg);
				}
			}

			.popup-invoice-card.hiding {
				animation: popupExit 0.6s cubic-bezier(0.6, -0.28, 0.735, 0.045) forwards;
			}

			@keyframes popupExit {
				to {
					opacity: 0;
					transform: translate(-50%, -50%) scale(0.8) rotateY(15deg);
				}
			}

			/* Rainbow glowing border */
			.popup-invoice-card::before {
				content: '';
				position: absolute;
				inset: -3px;
				border-radius: 40px;
				background: linear-gradient(135deg,
					#667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #667eea 100%);
				background-size: 300% 300%;
				animation: borderFlow 6s ease infinite;
				opacity: 0.7;
				filter: blur(8px);
				z-index: -1;
			}

			@keyframes borderFlow {
				0%, 100% { background-position: 0% 50%; }
				50% { background-position: 100% 50%; }
			}

			/* Popup Header - Professional */
			.popup-header {
				background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%);
				color: white;
				padding: 40px 50px 35px 50px;
				position: relative;
				overflow: hidden;
			}

			@keyframes headerFlow {
				0% { background-position: 0% 50%; }
				50% { background-position: 100% 50%; }
				100% { background-position: 0% 50%; }
			}

			/* Decorative shapes */
			.popup-header::before,
			.popup-header::after {
				content: '';
				position: absolute;
				border-radius: 50%;
				background: radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%);
			}

			.popup-header::before {
				width: 500px;
				height: 500px;
				top: -250px;
				right: -150px;
				animation: pulse 5s ease-in-out infinite;
			}

			.popup-header::after {
				width: 400px;
				height: 400px;
				bottom: -200px;
				left: -100px;
				animation: pulse 6s ease-in-out infinite reverse;
			}

			@keyframes pulse {
				0%, 100% { transform: scale(1); opacity: 0.15; }
				50% { transform: scale(1.15); opacity: 0.25; }
			}

			.popup-header h2 {
				margin: 0;
				font-size: 28px;
				font-weight: 700;
				color: white;
				position: relative;
				z-index: 1;
				letter-spacing: -0.5px;
				text-align: center;
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 15px;
			}

			.return-badge {
				background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
				color: white;
				padding: 8px 20px;
				border-radius: 20px;
				font-size: 16px;
				font-weight: 800;
				border: 2px solid rgba(255, 255, 255, 0.5);
				box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
				text-transform: uppercase;
				letter-spacing: 1px;
			}

			.popup-header .invoice-number {
				font-size: 18px;
				opacity: 0.95;
				margin-top: 8px;
				font-weight: 600;
				position: relative;
				z-index: 1;
				display: inline-block;
				padding: 8px 18px;
				background: rgba(255, 255, 255, 0.2);
				border-radius: 8px;
				backdrop-filter: blur(10px);
				border: 1px solid rgba(255, 255, 255, 0.3);
			}

			/* Timer - Professional */
			.popup-timer {
				position: absolute;
				top: 40px;
				right: 50px;
				background: rgba(255, 255, 255, 0.25);
				padding: 8px 16px;
				border-radius: 8px;
				font-size: 16px;
				font-weight: 700;
				z-index: 2;
				color: white;
				backdrop-filter: blur(10px);
				display: flex;
				align-items: center;
				gap: 8px;
				border: 1px solid rgba(255, 255, 255, 0.3);
			}

			.popup-timer i {
				font-size: 16px;
			}

			/* Popup Body */
			.popup-body {
				padding: 15px 30px;
				position: relative;
				width: 100%;
				box-sizing: border-box;
				overflow: hidden;
				flex: 1;
			}

			/* Customer Section - Professional */
			.customer-section {
				background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
				color: white;
				padding: 12px 20px;
				border-radius: 12px;
				margin-bottom: 12px;
				box-shadow: 0 4px 16px rgba(14, 165, 233, 0.3);
				position: relative;
			}

			.customer-info-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
			}

			.customer-name {
				font-size: 22px;
				font-weight: 700;
			}

			.date-time-info {
				font-size: 18px;
				font-weight: 700;
			}

			.customer-section h3 {
				margin: 0 0 16px 0;
				font-size: 22px;
				font-weight: 700;
				position: relative;
				z-index: 1;
			}

			.customer-details {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
				gap: 12px;
				position: relative;
				z-index: 1;
			}

			.customer-detail-item {
				background: rgba(255, 255, 255, 0.15);
				padding: 12px 18px;
				border-radius: 8px;
				backdrop-filter: blur(10px);
				border: 1px solid rgba(255, 255, 255, 0.25);
			}

			.customer-detail-item .label {
				font-size: 11px;
				opacity: 0.9;
				margin-bottom: 4px;
				text-transform: uppercase;
				letter-spacing: 0.5px;
				font-weight: 600;
			}

			.customer-detail-item .value {
				font-size: 16px;
				font-weight: 700;
			}

			/* Items Section */
			.items-section {
				margin-bottom: 10px;
				padding-right: 5px;
			}

			.items-section h4 {
				font-size: 18px;
				font-weight: 700;
				color: #1e293b;
				margin-bottom: 12px;
				padding-left: 12px;
				border-left: 3px solid #3b82f6;
				position: sticky;
				top: 0;
				background: white;
				z-index: 10;
				padding-top: 5px;
				padding-bottom: 5px;
			}

			.items-table {
				width: 100%;
				border-collapse: separate;
				border-spacing: 0;
				background: white;
				border-radius: 12px;
				overflow: hidden;
				box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
				border: 2px solid #e0f2fe;
				display: block;
			}

			.items-table thead,
			.items-table tbody {
				display: block;
				width: 100%;
			}

			.items-table tbody {
				max-height: calc(3 * 55px);
				overflow-y: auto;
			}

			.items-table tr {
				display: table;
				width: 100%;
				table-layout: fixed;
			}

			.items-table thead {
				background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
				position: sticky;
				top: 0;
				z-index: 5;
			}

			.items-table thead th {
				color: white !important;
			}

			.items-table th {
				padding: 12px 16px;
				text-align: center;
				font-size: 18px;
				font-weight: 800;
				text-transform: uppercase;
				letter-spacing: 0.5px;
				border-bottom: 2px solid rgba(255, 255, 255, 0.3);
			}

			.items-table td {
				padding: 10px 16px;
				border-bottom: 1px solid #f1f5f9;
				font-size: 19px;
				color: #1e293b;
				font-weight: 700;
				text-align: center;
			}

			.items-table tbody tr {
				transition: all 0.3s ease;
				position: relative;
			}

			.items-table tbody tr:hover {
				background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%);
				transform: scale(1.01);
				box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
			}

			.item-name {
				font-weight: 900;
				color: #0f172a;
				font-size: 20px;
			}

			/* Financial Cards - Professional */
			.totals-section {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 8px;
				margin-bottom: 10px;
			}

			.total-card {
				padding: 10px 15px;
				border-radius: 10px;
				position: relative;
				color: white;
				box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
				transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
				overflow: hidden;
			}

			.total-card::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%);
				opacity: 0;
				transition: opacity 0.3s ease;
			}

			.total-card:hover::before {
				opacity: 1;
			}

			.total-card:hover {
				transform: translateY(-4px) scale(1.02);
				box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
			}

			.total-card.subtotal {
				background: linear-gradient(135deg, #059669 0%, #047857 100%);
			}

			.total-card.discount {
				background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
			}

			.total-card.tax {
				background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
			}

			.total-card.grand-total {
				background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
				border: 3px solid rgba(255, 255, 255, 0.4);
				box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
			}

			.total-card-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
			}

			.total-card .label {
				font-size: 24px;
				opacity: 0.95;
				text-transform: uppercase;
				letter-spacing: 0.5px;
				font-weight: 900;
				position: relative;
				z-index: 1;
			}

			.total-card .value {
				font-size: 24px;
				font-weight: 900;
				position: relative;
				z-index: 1;
				text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
			}

			/* History Cards */
			.history-section {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
				gap: 10px;
			}

			.history-card {
				padding: 12px 18px;
				border-radius: 10px;
				position: relative;
				color: white;
				box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
				transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
				overflow: hidden;
			}

			.history-card::before {
				content: '';
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%);
				opacity: 0;
				transition: opacity 0.3s ease;
			}

			.history-card:hover::before {
				opacity: 1;
			}

			.history-card:hover {
				transform: translateY(-4px) scale(1.02);
				box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
			}

			.history-card.last-invoice {
				background: linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);
			}

			.history-card.balance {
				background: linear-gradient(135deg, #db2777 0%, #be185d 100%);
			}

			.history-card h5 {
				margin: 0;
				font-size: 16px;
				opacity: 0.95;
				text-transform: uppercase;
				letter-spacing: 0.5px;
				font-weight: 700;
				position: relative;
				z-index: 1;
			}

			.history-card .info-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 6px;
				font-size: 14px;
				position: relative;
				z-index: 1;
			}

			.history-card .info-row .label {
				opacity: 0.95;
				font-weight: 700;
			}

			.history-card .info-row .value {
				font-weight: 800;
			}

			.history-card .title-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 10px;
			}

			.history-card .title-row h5 {
				margin: 0;
				font-size: 26px;
				font-weight: 900;
			}

			.history-card .title-row .big-value {
				font-size: 26px;
				font-weight: 900;
				margin: 0;
				text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
			}

			.history-card .big-value {
				font-size: 26px;
				font-weight: 900;
				margin-top: 8px;
				position: relative;
				z-index: 1;
				text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
			}

			/* Close Button */
			.popup-close-btn {
				position: absolute;
				top: 20px;
				left: 20px;
				width: 40px;
				height: 40px;
				border-radius: 50%;
				background: rgba(255, 255, 255, 0.3);
				backdrop-filter: blur(10px);
				border: 2px solid rgba(255, 255, 255, 0.5);
				display: flex;
				align-items: center;
				justify-content: center;
				cursor: pointer;
				transition: all 0.3s ease;
				z-index: 10;
				color: white;
				font-size: 22px;
			}

			.popup-close-btn:hover {
				background: rgba(255, 255, 255, 0.5);
				transform: scale(1.15) rotate(90deg);
				box-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
			}

			/* Invoice List - Bottom */
			.invoice-list {
				position: fixed;
				bottom: 0;
				left: 0;
				right: 0;
				background: transparent;
				overflow-y: auto;
				z-index: 1000;
				padding: 0 30px 10px 30px;
			}

			.invoice-list h3 {
				display: none;
			}

			.invoice-list-items {
				display: flex;
				flex-direction: column;
				gap: 12px;
			}

			.invoice-list-card {
				display: grid;
				grid-template-columns: 2fr 1fr 3fr 1.5fr 2fr;
				align-items: center;
				background: rgba(255, 255, 255, 0.95);
				backdrop-filter: blur(10px);
				padding: 18px 35px;
				border-radius: 14px;
				border-right: 5px solid #3b82f6;
				box-shadow: 0 3px 12px rgba(0, 0, 0, 0.1);
				transition: all 0.3s ease;
				cursor: pointer;
				gap: 25px;
				min-height: 65px;
				direction: rtl;
			}

			.invoice-list-card:hover {
				box-shadow: 0 8px 24px rgba(59, 130, 246, 0.25);
				transform: translateY(-2px);
				border-right-width: 6px;
				background: rgba(255, 255, 255, 1);
			}

			.invoice-list-card .total {
				font-size: 24px;
				font-weight: 900;
				color: #059669;
				text-align: left;
			}

			.invoice-list-card .customer {
				font-size: 20px;
				font-weight: 900;
				color: #1e293b;
				text-align: right;
			}

			.invoice-list-card .date-time {
				font-size: 17px;
				color: #64748b;
				font-weight: 800;
				text-align: left;
			}

			.invoice-list-card .invoice-id {
				font-size: 18px;
				font-weight: 900;
				color: #3b82f6;
				text-align: left;
			}

			.invoice-items-list {
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
				justify-content: flex-start;
				align-items: center;
			}

			.item-badge {
				background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
				color: #1e40af;
				padding: 6px 12px;
				border-radius: 6px;
				font-size: 14px;
				font-weight: 800;
				border: 1px solid #bfdbfe;
				white-space: nowrap;
			}

			.invoice-list.no-popup {
				height: 100vh;
				padding: 60px;
			}

			/* Loading */
			.loading-spinner {
				text-align: center;
				padding: 100px;
				color: white;
				font-size: 24px;
			}

			.loading-spinner i {
				font-size: 72px;
				margin-bottom: 32px;
				animation: spin 1s linear infinite;
			}

			@keyframes spin {
				to { transform: rotate(360deg); }
			}

			/* Custom scrollbar */
			.invoice-list::-webkit-scrollbar,
			.items-table tbody::-webkit-scrollbar {
				width: 10px;
			}

			.invoice-list::-webkit-scrollbar-track,
			.items-table tbody::-webkit-scrollbar-track {
				background: #f1f5f9;
				border-radius: 10px;
			}

			.invoice-list::-webkit-scrollbar-thumb,
			.items-table tbody::-webkit-scrollbar-thumb {
				background: linear-gradient(135deg, #3b82f6, #2563eb);
				border-radius: 10px;
				border: 2px solid #f1f5f9;
			}

			.invoice-list::-webkit-scrollbar-thumb:hover,
			.items-table tbody::-webkit-scrollbar-thumb:hover {
				background: linear-gradient(135deg, #2563eb, #1d4ed8);
			}
		`;

		$('<style id="realtime-dashboard-styles">' + styleContent + '</style>').appendTo('head');
	}

	setup_layout() {
		const html = `
			<div class="sales-realtime-wrapper">
				<div class="popup-container"></div>
				<div class="invoice-list">
					<h3 style="color: white; padding: 20px; background: rgba(0,0,0,0.5);">Recent Invoices</h3>
					<div class="invoice-list-items"></div>
				</div>
			</div>
		`;

		this.container.html(html);
		console.log('HTML injected into container');
		this.$popup_container = this.container.find('.popup-container');
		this.$invoice_list = this.container.find('.invoice-list');
		this.$invoice_list_items = this.container.find('.invoice-list-items');
		console.log('Popup container found:', this.$popup_container.length);
		console.log('Invoice list found:', this.$invoice_list.length);

		// Add click outside handler to popup container
		this.$popup_container.on('click', (e) => {
			// Only hide if clicking the container itself, not the card
			if ($(e.target).hasClass('popup-container')) {
				this.hide_popup();
			}
		});
	}

	async load_invoices() {
		try {
			console.log('Loading invoices...');
			const response = await frappe.call({
				method: 'expenses_management.expenses_management.page.sales_invoice_realtime.sales_invoice_realtime.get_realtime_invoice_data',
				freeze: true,
				freeze_message: __('Loading invoices...')
			});

			console.log('Response received:', response);

			if (response.message && response.message.length > 0) {
				console.log(`Found ${response.message.length} invoices`);
				this.render_invoice_list(response.message);

				const latest = response.message[0];
				if (!this.last_checked_invoice || this.last_checked_invoice !== latest.name) {
					console.log('Showing popup for latest invoice:', latest.name);
					this.show_popup(latest);
					this.last_checked_invoice = latest.name;
				}
			} else {
				console.log('No invoices found in response');
			}
		} catch (error) {
			console.error('Error loading invoices:', error);
		}
	}

	render_invoice_list(invoices) {
		this.$invoice_list_items.empty();

		invoices.forEach(invoice => {
			// Create items badges
			const items_badges = invoice.items && invoice.items.length > 0
				? invoice.items.map(item => `<span class="item-badge">${item.item_name || item.item_code} × ${item.qty}</span>`).join('')
				: '<span class="item-badge">No items</span>';

			// Format time to HH:MM
			let time_formatted = '';
			if (invoice.posting_time) {
				const time_parts = invoice.posting_time.split(':');
				time_formatted = `${time_parts[0]}:${time_parts[1]}`;
			}

			const card_html = `
				<div class="invoice-list-card" data-invoice="${invoice.name}">
					<div class="customer">${invoice.customer_name}</div>
					<div class="total">${format_currency(invoice.grand_total)}</div>
					<div class="invoice-items-list">${items_badges}</div>
					<div class="invoice-id">#${invoice.name}</div>
					<div class="date-time">${frappe.datetime.str_to_user(invoice.posting_date)} ${time_formatted}</div>
				</div>
			`;

			const $card = $(card_html);
			$card.on('click', () => this.show_popup(invoice));
			this.$invoice_list_items.append($card);
		});
	}

	show_popup(invoice) {
		this.hide_popup();

		this.current_popup_invoice = invoice;
		this.popup_show_time = Date.now();

		const popup_html = this.get_popup_html(invoice);
		this.$popup_container.html(popup_html);

		// Attach close button handler
		this.$popup_container.find('.popup-close-btn').on('click', () => {
			this.hide_popup();
		});

		this.$invoice_list.removeClass('no-popup');

		this.start_popup_timer();
	}

	get_popup_html(invoice) {
		const items_html = invoice.items.map(item => `
			<tr>
				<td class="item-name" style="text-align: right;">${item.item_name || item.item_code}</td>
				<td style="text-align: center; font-weight: 800;">${item.uom || 'وحدة'}</td>
				<td style="text-align: center; font-weight: 800;">${format_currency(item.rate)}</td>
				<td style="text-align: center; font-weight: 800;">${item.qty}</td>
				<td style="text-align: center; font-weight: 800;">${format_currency(item.amount)}</td>
			</tr>
		`).join('');

		const returnBadge = invoice.is_return ? '<span class="return-badge">مرتجع</span>' : '';

		// Format time to HH:MM
		let time_formatted = '--:--';
		if (invoice.posting_time) {
			const time_parts = invoice.posting_time.split(':');
			time_formatted = `${time_parts[0]}:${time_parts[1]}`;
		}

		return `
			<div class="popup-invoice-card">
				<div class="popup-header">
					<div class="popup-close-btn">
						<i class="fa fa-times"></i>
					</div>
					<div class="popup-timer">
						<i class="fa fa-clock-o"></i>
						<span class="timer-text">10:00</span>
					</div>
					<h2>
						<span>فاتورة جديدة - #${invoice.name}</span>
						${returnBadge}
					</h2>
				</div>
				<div class="popup-body">
					<div class="customer-section">
						<div class="customer-info-row">
							<div class="customer-name">العميل : ${invoice.customer_name}</div>
							<div class="date-time-info">${frappe.datetime.str_to_user(invoice.posting_date)} - ${time_formatted}</div>
						</div>
					</div>

					<div class="items-section">
						<table class="items-table">
							<thead>
								<tr>
									<th style="text-align: right;">الصنف</th>
									<th style="text-align: center;">الوحدة</th>
									<th style="text-align: center;">السعر</th>
									<th style="text-align: center;">الكمية</th>
									<th style="text-align: center;">المبلغ</th>
								</tr>
							</thead>
							<tbody>
								${items_html}
							</tbody>
						</table>
					</div>

					<div class="totals-section">
						<div class="total-card subtotal">
							<div class="total-card-row">
								<div class="label">💰 المجموع الفرعي</div>
								<div class="value">${format_currency(invoice.total)}</div>
							</div>
						</div>
						<div class="total-card discount">
							<div class="total-card-row">
								<div class="label">🎁 الخصم</div>
								<div class="value">${format_currency(invoice.discount)}</div>
							</div>
						</div>
						<div class="total-card tax">
							<div class="total-card-row">
								<div class="label">📊 ضريبة القيمة المضافة</div>
								<div class="value">${format_currency(invoice.taxes)}</div>
							</div>
						</div>
						<div class="total-card grand-total">
							<div class="total-card-row">
								<div class="label">✨ الإجمالي النهائي</div>
								<div class="value">${format_currency(invoice.grand_total)}</div>
							</div>
						</div>
					</div>

					<div class="history-section">
						<div class="history-card last-invoice">
							<div class="title-row">
								<h5>📋 آخر فاتورة</h5>
								<div class="big-value">${invoice.last_invoice ? format_currency(invoice.last_invoice.grand_total) : '0.00'}</div>
							</div>
							<div class="info-row">
								<span class="label">رقم الفاتورة</span>
								<span class="value">${invoice.last_invoice ? invoice.last_invoice.name : 'لا يوجد'}</span>
							</div>
							<div class="info-row">
								<span class="label">التاريخ</span>
								<span class="value">${invoice.last_invoice ? frappe.datetime.str_to_user(invoice.last_invoice.posting_date) : '--'}</span>
							</div>
						</div>
						<div class="history-card balance">
							<div class="title-row">
								<h5>💳 رصيد العميل</h5>
								<div class="big-value">${format_currency(invoice.customer_balance)}</div>
							</div>
							<div class="info-row">
								<span class="label">المبلغ المستحق</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	start_popup_timer() {
		if (this.popup_timer) {
			clearInterval(this.popup_timer);
		}

		const auto_hide_duration = 10 * 60 * 1000; // 10 minutes for auto-hide
		const start_time = Date.now();

		// Get invoice submission time
		const invoice_time = new Date(this.current_popup_invoice.creation).getTime();

		this.popup_timer = setInterval(() => {
			const elapsed_since_start = Date.now() - start_time;

			// Check if we should auto-hide (10 minutes from popup opening)
			if (elapsed_since_start >= auto_hide_duration) {
				this.hide_popup();
				return;
			}

			// Calculate time since invoice submission
			const elapsed_since_invoice = Date.now() - invoice_time;
			const minutes = Math.floor(elapsed_since_invoice / 60000);
			const seconds = Math.floor((elapsed_since_invoice % 60000) / 1000);
			const timer_text = `${minutes}:${seconds.toString().padStart(2, '0')}`;

			this.container.find('.timer-text').text(timer_text);
		}, 1000);
	}

	hide_popup() {
		if (this.popup_timer) {
			clearInterval(this.popup_timer);
			this.popup_timer = null;
		}

		const $popup = this.container.find('.popup-invoice-card');
		if ($popup.length) {
			$popup.addClass('hiding');
			setTimeout(() => {
				this.$popup_container.empty();
				this.$invoice_list.addClass('no-popup');
				this.current_popup_invoice = null;
			}, 600);
		}
	}

	hide_popup_immediately() {
		if (this.popup_timer) {
			clearInterval(this.popup_timer);
			this.popup_timer = null;
		}

		this.$popup_container.empty();
		this.$invoice_list.addClass('no-popup');
		this.current_popup_invoice = null;
	}

	start_polling() {
		this.polling_interval = setInterval(async () => {
			try {
				const response = await frappe.call({
					method: 'expenses_management.expenses_management.page.sales_invoice_realtime.sales_invoice_realtime.get_latest_invoice',
					freeze: false
				});

				if (response.message) {
					const latest = response.message;

					if (!this.last_checked_invoice || this.last_checked_invoice !== latest.name) {
						// Close current popup immediately and show new one
						if (this.current_popup_invoice) {
							this.hide_popup_immediately();
						}
						this.show_popup(latest);
						this.last_checked_invoice = latest.name;
						this.load_invoices();
					}
				}
			} catch (error) {
				console.error('Polling error:', error);
			}
		}, 5000);
	}

	destroy() {
		if (this.popup_timer) {
			clearInterval(this.popup_timer);
		}
		if (this.polling_interval) {
			clearInterval(this.polling_interval);
		}
	}
}

// Utility function to format currency
function format_currency(value) {
	if (!value) value = 0;

	// Format number with 2 decimal places and thousands separators
	const formatted_number = Number(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

	return formatted_number;
}
