frappe.pages['purchase-requirements-report'].on_page_load = function(wrapper) {
	new PurchaseRequirementsReport(wrapper);
}

class PurchaseRequirementsReport {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});

		this.filters = {
			company: frappe.defaults.get_user_default('Company'),
			from_date: this.get_last_month_start(),
			to_date: this.get_last_month_end(),
			item_groups: [],
			warehouses: [],
			lengths: []
		};

		this.filter_options = {};
		this.data = null;

		this.setup_page();
		this.render_content();
	}

	get_last_month_start() {
		let date = frappe.datetime.add_months(frappe.datetime.get_today(), -1);
		return frappe.datetime.month_start(date);
	}

	get_last_month_end() {
		let date = frappe.datetime.add_months(frappe.datetime.get_today(), -1);
		return frappe.datetime.month_end(date);
	}

	setup_page() {
		this.page.clear_actions();
		this.page.wrapper.find('.page-head').hide();
		$('#floating-gear-btn').remove();
		$('#floating-buttons-container').remove();
	}

	show_settings_dialog() {
		let me = this;

		if (this.settings_dialog) {
			this.settings_dialog.set_values({
				company: me.filters.company,
				from_date: me.filters.from_date,
				to_date: me.filters.to_date
			});
			this.settings_dialog.show();
			return;
		}

		this.settings_dialog = new frappe.ui.Dialog({
			title: '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0634\u064a\u062a \u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'date_presets_html',
					options: `
						<div class="filter-presets-section">
							<div class="preset-label">\u0627\u062e\u062a\u064a\u0627\u0631 \u0633\u0631\u064a\u0639 \u0644\u0644\u0641\u062a\u0631\u0629</div>
							<div class="preset-buttons-grid">
								<button type="button" class="preset-btn" data-preset="today">\u0627\u0644\u064a\u0648\u0645</button>
								<button type="button" class="preset-btn" data-preset="yesterday">\u0623\u0645\u0633</button>
								<button type="button" class="preset-btn" data-preset="this_week">\u0647\u0630\u0627 \u0627\u0644\u0623\u0633\u0628\u0648\u0639</button>
								<button type="button" class="preset-btn" data-preset="last_week">\u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u0645\u0627\u0636\u064a</button>
								<button type="button" class="preset-btn" data-preset="this_month">\u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631</button>
								<button type="button" class="preset-btn" data-preset="last_month">\u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u0627\u0636\u064a</button>
								<button type="button" class="preset-btn" data-preset="this_quarter">\u0647\u0630\u0627 \u0627\u0644\u0631\u0628\u0639</button>
								<button type="button" class="preset-btn" data-preset="last_quarter">\u0627\u0644\u0631\u0628\u0639 \u0627\u0644\u0645\u0627\u0636\u064a</button>
								<button type="button" class="preset-btn" data-preset="this_year">\u0647\u0630\u0647 \u0627\u0644\u0633\u0646\u0629</button>
							</div>
						</div>
					`
				},
				{ fieldtype: 'Section Break' },
				{ label: __('\u0627\u0644\u0634\u0631\u0643\u0629'), fieldname: 'company', fieldtype: 'Link', options: 'Company', default: me.filters.company, reqd: 1,
					change: function() {
						let company = me.settings_dialog.get_value('company');
						if (company) {
							me.load_warehouses_for_company(company);
						}
					}
				},
				{ fieldtype: 'Column Break' },
				{ label: __('\u0645\u0646 \u062a\u0627\u0631\u064a\u062e'), fieldname: 'from_date', fieldtype: 'Date', default: me.filters.from_date, reqd: 1 },
				{ fieldtype: 'Column Break' },
				{ label: __('\u0625\u0644\u0649 \u062a\u0627\u0631\u064a\u062e'), fieldname: 'to_date', fieldtype: 'Date', default: me.filters.to_date, reqd: 1 },
				{ fieldtype: 'Section Break', label: '\u0627\u0644\u0641\u0644\u0627\u062a\u0631' },
				{ fieldtype: 'HTML', fieldname: 'item_groups_html' },
				{ fieldtype: 'Column Break' },
				{ fieldtype: 'HTML', fieldname: 'warehouses_html' },
				{ fieldtype: 'Column Break' },
				{ fieldtype: 'HTML', fieldname: 'lengths_html' }
			],
			primary_action_label: '\u0639\u0631\u0636 \u0627\u0644\u062a\u0642\u0631\u064a\u0631',
			primary_action: function() {
				me.collect_dialog_filters();
				me.settings_dialog.hide();
				me.generate_report();
			}
		});

		this.settings_dialog.$wrapper.find('.modal-dialog').css({ 'max-width': '1100px', 'margin': '15px auto' });
		this.settings_dialog.$wrapper.find('.modal-content').css({ 'border-radius': '16px', 'box-shadow': '0 25px 80px rgba(0, 0, 0, 0.35)', 'border': 'none', 'overflow': 'visible' });
		this.settings_dialog.$wrapper.find('.modal-header').css({ 'background': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 'color': '#fff', 'border-bottom': '4px solid #6366f1', 'padding': '14px 24px' });
		this.settings_dialog.$wrapper.find('.modal-title').css({ 'font-size': '20px', 'font-weight': '900' });
		this.settings_dialog.$wrapper.find('.btn-modal-close').css({ 'color': '#94a3b8', 'font-size': '22px' });
		this.settings_dialog.$wrapper.find('.modal-body').css({ 'padding': '16px 24px', 'background': '#f8fafc', 'max-height': '80vh', 'overflow-y': 'auto' });
		this.settings_dialog.$wrapper.find('.modal-footer').css({ 'padding': '16px 24px', 'background': '#f8fafc', 'border-top': '3px solid #e2e8f0', 'display': 'flex', 'justify-content': 'center' });
		this.settings_dialog.$wrapper.find('.btn-primary').css({ 'font-size': '18px', 'padding': '12px 50px', 'font-weight': '900', 'border-radius': '10px', 'background': 'linear-gradient(135deg, #6366f1, #8b5cf6)', 'border': 'none', 'box-shadow': '0 6px 20px rgba(99, 102, 241, 0.5)' });

		const presetStyles = `
			<style>
				.filter-presets-section { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
				.preset-label { color: #e2e8f0; font-size: 16px; font-weight: 900; text-align: center; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 1px; }
				.preset-buttons-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
				.preset-btn { background: rgba(99, 102, 241, 0.25); border: 2px solid rgba(99, 102, 241, 0.5); color: #c7d2fe; padding: 12px 16px; border-radius: 8px; font-size: 16px; font-weight: 800; cursor: pointer; transition: all 0.3s; white-space: nowrap; text-align: center; }
				.preset-btn:hover { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-color: #6366f1; transform: translateY(-3px); box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5); }
				.preset-btn.active { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-color: #6366f1; }
				.modal-body .section-head { font-size: 15px !important; font-weight: 900 !important; color: #1e293b !important; }
				.modal-body .form-column { padding: 0 10px !important; }
				.modal-body .control-label { font-size: 14px !important; font-weight: 800 !important; color: #1e293b !important; }
				.modal-body .form-control { height: 44px !important; font-size: 16px !important; font-weight: 700 !important; border: 2px solid #cbd5e1 !important; border-radius: 10px !important; }
				.modal-body .form-control:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2) !important; }
				.filter-dropdown { position: relative; }
				.filter-dropdown .fd-label { font-size: 13px; font-weight: 900; color: #1e293b; margin-bottom: 4px; }
				.filter-dropdown .fd-toggle { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; background: #fff; font-size: 13px; font-weight: 700; color: #64748b; transition: all 0.2s; }
				.filter-dropdown .fd-toggle:hover { border-color: #6366f1; }
				.filter-dropdown .fd-toggle .fd-badge { background: #6366f1; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: 900; margin-right: 6px; }
				.filter-dropdown .fd-panel { border: 2px solid #e2e8f0; border-radius: 8px; background: #fff; margin-top: 4px; padding: 8px; max-height: 220px; overflow-y: auto; }
				.filter-dropdown .fd-panel::-webkit-scrollbar { width: 5px; }
				.filter-dropdown .fd-panel::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 3px; }
				.filter-dropdown .fd-search { width: 100%; padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; font-weight: 700; margin-bottom: 6px; direction: rtl; }
				.filter-dropdown .fd-search:focus { border-color: #6366f1; outline: none; }
				.filter-dropdown .fd-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding: 0 2px; }
				.filter-dropdown .fd-select-all { font-size: 12px; font-weight: 800; color: #6366f1; cursor: pointer; }
				.filter-dropdown .fd-select-all input { margin-left: 4px; accent-color: #6366f1; }
				.filter-dropdown .fd-items { display: flex; flex-direction: column; gap: 2px; }
				.filter-dropdown .fd-item { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
				.filter-dropdown .fd-item:hover { background: #eef2ff; }
				.filter-dropdown .fd-item input { accent-color: #6366f1; min-width: 15px; height: 15px; }
			</style>
		`;
		this.settings_dialog.$wrapper.find('.modal-content').prepend(presetStyles);

		this.settings_dialog.$wrapper.find('.preset-btn').on('click', (e) => {
			const preset = $(e.target).data('preset');
			const dates = this.get_preset_dates(preset);
			if (dates) {
				this.settings_dialog.set_value('from_date', dates.from_date);
				this.settings_dialog.set_value('to_date', dates.to_date);
				this.settings_dialog.$wrapper.find('.preset-btn').removeClass('active');
				$(e.target).addClass('active');
			}
		});

		this.load_filter_options();
		this.settings_dialog.show();
	}

	load_filter_options() {
		frappe.call({
			method: 'expenses_management.expenses_management.page.purchase_requirements_report.purchase_requirements_report.get_filter_options',
			callback: (r) => {
				if (r.message) {
					this.filter_options = r.message;
					this.render_filter_dropdown(
						this.settings_dialog.fields_dict.item_groups_html.$wrapper,
						'\u0645\u062c\u0645\u0648\u0639\u0627\u062a \u0627\u0644\u0623\u0635\u0646\u0627\u0641', r.message.item_groups, 'ig-cb', this.filters.item_groups, true
					);
					this.render_length_checkboxes(r.message.lengths);
					if (this.filters.company) {
						this.load_warehouses_for_company(this.filters.company);
					}
				}
			}
		});
	}

	load_warehouses_for_company(company) {
		frappe.call({
			method: 'expenses_management.expenses_management.page.purchase_requirements_report.purchase_requirements_report.get_warehouses_for_company',
			args: { company: company },
			callback: (r) => {
				if (r.message) {
					this.render_warehouse_checkboxes(r.message);
				}
			}
		});
	}

	render_filter_dropdown(container, label, items, cbClass, selectedItems, showSearch) {
		let me = this;
		let html = '<div class="filter-dropdown">';
		html += '<div class="fd-label">' + label + '</div>';
		html += '<div class="fd-panel">';
		if (showSearch) {
			html += '<input type="text" class="fd-search" placeholder="\u0628\u062d\u062b...">';
		}
		html += '<div class="fd-actions"><label class="fd-select-all"><input type="checkbox" checked class="fd-sa-' + cbClass + '"> \u0627\u0644\u0643\u0644</label></div>';
		html += '<div class="fd-items">';
		items.forEach(item => {
			let val = typeof item === 'object' ? item.value : item;
			let display = typeof item === 'object' ? item.display : item;
			let checked = selectedItems.length === 0 || selectedItems.includes(val) ? 'checked' : '';
			html += '<label class="fd-item"><input type="checkbox" ' + checked + ' value="' + val + '" class="' + cbClass + '"> ' + display + '</label>';
		});
		html += '</div></div></div>';
		container.html(html);

		if (showSearch) {
			container.find('.fd-search').on('input', function() {
				let q = $(this).val().toLowerCase();
				container.find('.fd-item').each(function() {
					$(this).toggle($(this).text().toLowerCase().indexOf(q) !== -1);
				});
			});
		}

		container.find('.fd-sa-' + cbClass).on('change', function() {
			container.find('.fd-item:visible .' + cbClass).prop('checked', $(this).is(':checked'));
		});
	}

	render_warehouse_checkboxes(warehouses) {
		if (!this.settings_dialog) return;
		let items = warehouses.map(wh => ({ value: wh, display: wh.replace(/ - \u0645$/, '') }));
		this.render_filter_dropdown(
			this.settings_dialog.fields_dict.warehouses_html.$wrapper,
			'\u0627\u0644\u0645\u0633\u062a\u0648\u062f\u0639\u0627\u062a', items, 'wh-cb', this.filters.warehouses, false
		);
	}

	render_length_checkboxes(lengths) {
		if (!this.settings_dialog) return;
		let items = lengths.map(l => ({ value: String(l), display: l + ' \u0645' }));
		this.render_filter_dropdown(
			this.settings_dialog.fields_dict.lengths_html.$wrapper,
			'\u0627\u0644\u0623\u0637\u0648\u0627\u0644', items, 'len-cb', this.filters.lengths.map(String), false
		);
	}

	collect_dialog_filters() {
		let me = this;
		let values = this.settings_dialog.get_values();
		this.filters.company = values.company;
		this.filters.from_date = values.from_date;
		this.filters.to_date = values.to_date;

		this.filters.item_groups = [];
		this.settings_dialog.$wrapper.find('.ig-cb:checked').each(function() {
			me.filters.item_groups.push($(this).val());
		});

		this.filters.warehouses = [];
		this.settings_dialog.$wrapper.find('.wh-cb:checked').each(function() {
			me.filters.warehouses.push($(this).val());
		});

		this.filters.lengths = [];
		this.settings_dialog.$wrapper.find('.len-cb:checked').each(function() {
			me.filters.lengths.push(parseFloat($(this).val()));
		});
	}

	get_preset_dates(preset) {
		const today = frappe.datetime.get_today();
		const d = new Date(today);
		let from_date, to_date;

		switch(preset) {
			case 'today':
				from_date = to_date = today;
				break;
			case 'yesterday':
				from_date = to_date = frappe.datetime.add_days(today, -1);
				break;
			case 'this_week':
				from_date = frappe.datetime.week_start(today);
				to_date = frappe.datetime.week_end(today);
				break;
			case 'last_week':
				let lw = frappe.datetime.add_days(today, -7);
				from_date = frappe.datetime.week_start(lw);
				to_date = frappe.datetime.week_end(lw);
				break;
			case 'this_month':
				from_date = frappe.datetime.month_start(today);
				to_date = frappe.datetime.month_end(today);
				break;
			case 'last_month':
				let lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
				let lme = new Date(d.getFullYear(), d.getMonth(), 0);
				from_date = lm.toISOString().split('T')[0];
				to_date = lme.toISOString().split('T')[0];
				break;
			case 'this_quarter':
				from_date = frappe.datetime.quarter_start(today);
				to_date = frappe.datetime.quarter_end(today);
				break;
			case 'last_quarter':
				let cq = Math.floor(d.getMonth() / 3);
				let lqs = new Date(d.getFullYear(), (cq - 1) * 3, 1);
				if (cq === 0) lqs = new Date(d.getFullYear() - 1, 9, 1);
				let lqe = new Date(lqs.getFullYear(), lqs.getMonth() + 3, 0);
				from_date = lqs.toISOString().split('T')[0];
				to_date = lqe.toISOString().split('T')[0];
				break;
			case 'this_year':
				from_date = frappe.datetime.year_start(today);
				to_date = frappe.datetime.year_end(today);
				break;
			default:
				from_date = to_date = today;
		}
		return { from_date, to_date };
	}

	generate_report() {
		if (!this.filters.company || !this.filters.from_date || !this.filters.to_date) {
			frappe.msgprint({title: __('\u062e\u0637\u0623'), indicator: 'red', message: __('\u0627\u0644\u0631\u062c\u0627\u0621 \u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0634\u0631\u0643\u0629 \u0648\u0627\u0644\u0641\u062a\u0631\u0629')});
			this.show_settings_dialog();
			return;
		}

		$('#report-content').html(`<div class="loading-box"><div class="spinner"></div><div class="loading-txt">\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a...</div></div>`);

		frappe.call({
			method: 'expenses_management.expenses_management.page.purchase_requirements_report.purchase_requirements_report.get_purchase_requirements_data',
			args: {
				company: this.filters.company,
				from_date: this.filters.from_date,
				to_date: this.filters.to_date,
				item_groups: JSON.stringify(this.filters.item_groups),
				warehouses: JSON.stringify(this.filters.warehouses),
				lengths: JSON.stringify(this.filters.lengths)
			},
			callback: (r) => {
				if (r.message && r.message.items && r.message.items.length > 0) {
					this.data = r.message;
					this.render_report(r.message);
				} else {
					$('#report-content').html(`<div class="empty-box"><i class="fa fa-inbox"></i><h4>\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a</h4><p>\u0644\u0627 \u064a\u0648\u062c\u062f \u0623\u0635\u0646\u0627\u0641 \u0644\u0644\u0641\u0644\u0627\u062a\u0631 \u0627\u0644\u0645\u062d\u062f\u062f\u0629</p></div>`);
				}
			}
		});
	}

	render_report(data) {
		let html = this.render_summary_header(data);
		html += this.render_table(data);
		$('#report-content').html(html);

		// Wire up input change handlers for grand total calculation
		$('.actual-req-input').off('input').on('input', (e) => {
			let itemCode = $(e.target).data('item');
			this.update_grand_actual_required(itemCode);
		});
	}

	update_grand_actual_required(itemCode) {
		let total = 0;
		$(`.actual-req-input[data-item="${itemCode}"]`).each(function() {
			total += parseFloat($(this).val()) || 0;
		});
		$(`.grand-actual-req[data-item="${itemCode}"]`).text(total > 0 ? this.num(total, 0) : '\u2014');
	}

	render_summary_header(data) {
		let filters = data.filters;
		let itemCount = data.items.length;
		let whCount = data.warehouses.length;

		return `
			<div class="summary-header">
				<div class="summary-title">\u0634\u064a\u062a \u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a</div>
				<div class="summary-filters">
					<span class="filter-tag"><i class="fa fa-building"></i> ${filters.company}</span>
					<span class="filter-tag"><i class="fa fa-calendar"></i> ${filters.from_date} \u2192 ${filters.to_date}</span>
					<span class="filter-tag"><i class="fa fa-cubes"></i> ${itemCount} \u0635\u0646\u0641</span>
					<span class="filter-tag"><i class="fa fa-warehouse"></i> ${whCount} \u0645\u0633\u062a\u0648\u062f\u0639</span>
				</div>
			</div>
		`;
	}

	render_table(data) {
		let thead = this.render_table_header(data.warehouses);
		let tbody = this.render_table_body(data.items, data.warehouses);

		return `
			<div class="report-table-container">
				<div class="table-scroll-wrapper">
					<table class="purchase-req-table" id="purchase-req-table">
						${thead}
						${tbody}
					</table>
				</div>
			</div>
		`;
	}

	render_table_header(warehouses) {
		let row1 = '<tr class="header-group-row">';
		row1 += '<th colspan="3" class="fixed-right-header group-header item-details-group">\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0635\u0646\u0641</th>';
		row1 += '<th colspan="3" class="group-header item-details-scroll">\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644</th>';
				warehouses.forEach((wh, idx) => {
			let whShort = wh.replace(/ - \u0645$/, '');
			let bgClass = idx % 2 === 0 ? 'wh-header-even' : 'wh-header-odd';
			row1 += `<th colspan="7" class="wh-group-header ${bgClass}">${whShort}</th>`;
		});
		row1 += '<th colspan="5" class="fixed-left-header group-header totals-group">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a\u0627\u062a</th>';
		row1 += '</tr>';

		let row2 = '<tr class="header-detail-row">';
		const stickyItemCols = ['#', '\u0631\u0642\u0645 \u0627\u0644\u0635\u0646\u0641', '\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641'];
		stickyItemCols.forEach((col, i) => {
			row2 += `<th class="fixed-right-col fixed-right-col-${i}">${col}</th>`;
		});
		const scrollItemCols = ['\u0627\u0644\u0648\u0632\u0646', '\u0627\u0644\u0637\u0648\u0644', '\u0646\u0648\u0639 \u0627\u0644\u062c\u0633\u0631'];
		scrollItemCols.forEach(col => {
			row2 += `<th class="scroll-item-header">${col}</th>`;
		});

		const whSubCols = ['\u0627\u0644\u0645\u062e\u0632\u0648\u0646', '\u0627\u0644\u0645\u062a\u0628\u0642\u0649', '\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u0649', '\u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a', '\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u062d\u0628\u0629', '\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0637\u0646', '\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0627\u0644\u0641\u0639\u0644\u0649'];
		warehouses.forEach((wh, whIdx) => {
			let bgClass = whIdx % 2 === 0 ? 'wh-col-even' : 'wh-col-odd';
			whSubCols.forEach(sub => {
				row2 += `<th class="wh-sub-header ${bgClass}">${sub}</th>`;
			});
		});

		const totalCols = ['\u0627\u062c\u0645\u0627\u0644\u0649 \u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u062d\u0628\u0629', '\u0627\u062c\u0645\u0627\u0644\u0649 \u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u0637\u0646', '\u0627\u062c\u0645\u0627\u0644\u0649 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u062d\u0628\u0629', '\u0627\u062c\u0645\u0627\u0644\u0649 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u0637\u0646', '\u0627\u062c\u0645\u0627\u0644\u0649 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0627\u0644\u0641\u0639\u0644\u0649'];
		totalCols.forEach((col, i) => {
			row2 += `<th class="fixed-left-col fixed-left-col-${i}">${col}</th>`;
		});
		row2 += '</tr>';

		return `<thead>${row1}${row2}</thead>`;
	}

	render_table_body(items, warehouses) {
		let rows = '';
		let currentGroup = '';
		let totalColSpan = 6 + (warehouses.length * 7) + 5;

		let visibleIdx = 0;
		items.forEach((item, rowIdx) => {
			// Skip items where ALL data = 0 across all warehouses
			let hasAnyData = false;
			for (let wh of warehouses) {
				let sd = (item.stock_data && item.stock_data[wh]) || {};
				let sl = (item.sales_data && item.sales_data[wh]) || 0;
				if ((sd.actual_qty || 0) !== 0 || (sd.ordered_qty || 0) !== 0 || sl !== 0) {
					hasAnyData = true;
					break;
				}
			}
			if (!hasAnyData) return;

			// Add group separator row when item_group changes
			if (item.item_group !== currentGroup) {
				currentGroup = item.item_group;
				rows += `<tr class="group-separator-row"><td colspan="3" class="group-name-cell">${currentGroup}</td><td colspan="${totalColSpan - 3}" class="group-fill-cell"></td></tr>`;
			}

			let rowClass = visibleIdx % 2 === 0 ? 'row-even' : 'row-odd';
			visibleIdx++;
			rows += `<tr class="data-row ${rowClass}">`;

			rows += `<td class="fixed-right-col fixed-right-col-0">${visibleIdx}</td>`;
			rows += `<td class="fixed-right-col fixed-right-col-1">${item.item_code}</td>`;
			rows += `<td class="fixed-right-col fixed-right-col-2">${item.item_name}</td>`;
			rows += `<td class="scroll-item-cell">${this.num(item.weight_per_unit, 1)}</td>`;
			rows += `<td class="scroll-item-cell">${this.num(item.custom_length, 1)}</td>`;
			rows += `<td class="scroll-item-cell">${item.item_group}</td>`;

			let grandTotalStock = 0;
			let grandTotalOrdered = 0;
			let grandTotalSales = 0;

			warehouses.forEach((wh, whIdx) => {
				let bgClass = whIdx % 2 === 0 ? 'wh-col-even' : 'wh-col-odd';
				let stockData = (item.stock_data && item.stock_data[wh]) || {};
				let actualQty = stockData.actual_qty || 0;
				let orderedQty = stockData.ordered_qty || 0;
				let totalQty = actualQty + orderedQty;
				let salesQty = (item.sales_data && item.sales_data[wh]) || 0;
				let requiredPcs = Math.max(0, (salesQty - totalQty)) * 1.1;
				let requiredTons = requiredPcs * (item.weight_per_unit || 0) / 1000;

				grandTotalStock += actualQty;
				grandTotalOrdered += orderedQty;
				grandTotalSales += salesQty;

				rows += `<td class="${bgClass}">${this.num(actualQty, 0)}</td>`;
				rows += `<td class="${bgClass}">${this.num(orderedQty, 0)}</td>`;
				rows += `<td class="${bgClass} total-col">${this.num(totalQty, 0)}</td>`;
				rows += `<td class="${bgClass} sales-col">${this.num(salesQty, 0)}</td>`;
				rows += `<td class="${bgClass} req-col">${this.num(requiredPcs, 0)}</td>`;
				rows += `<td class="${bgClass} req-col">${this.num(requiredTons, 2)}</td>`;
				rows += `<td class="${bgClass} actual-req-cell"><input type="number" class="actual-req-input" data-item="${item.item_code}" data-warehouse="${wh}" min="0" step="1" value="" placeholder="\u2014"></td>`;
			});

			let grandTotal = grandTotalStock + grandTotalOrdered;
			let grandTotalStockTons = grandTotal * (item.weight_per_unit || 0) / 1000;
			let grandTotalSalesTons = grandTotalSales * (item.weight_per_unit || 0) / 1000;

			rows += `<td class="fixed-left-col fixed-left-col-0 total-cell">${this.num(grandTotal, 0)}</td>`;
			rows += `<td class="fixed-left-col fixed-left-col-1 total-cell">${this.num(grandTotalStockTons, 2)}</td>`;
			rows += `<td class="fixed-left-col fixed-left-col-2 total-cell">${this.num(grandTotalSales, 0)}</td>`;
			rows += `<td class="fixed-left-col fixed-left-col-3 total-cell">${this.num(grandTotalSalesTons, 2)}</td>`;
			rows += `<td class="fixed-left-col fixed-left-col-4 total-cell grand-actual-req" data-item="${item.item_code}">\u2014</td>`;
			rows += '</tr>';
		});

		return `<tbody>${rows}</tbody>`;
	}

	handle_export_excel() {
		if (!this.data || !this.data.items || this.data.items.length === 0) {
			frappe.msgprint({title: __('خطأ'), indicator: 'red', message: __('لا توجد بيانات للتصدير')});
			return;
		}

		// Show freeze overlay
		frappe.dom.freeze('جاري تجهيز ملف Excel...');

		// Collect actual required input values
		let actualRequired = {};
		$('.actual-req-input').each(function() {
			let val = parseFloat($(this).val()) || 0;
			if (val > 0) {
				let key = $(this).data('item') + '|' + $(this).data('warehouse');
				actualRequired[key] = val;
			}
		});

		let params = {
			company: this.filters.company,
			from_date: this.filters.from_date,
			to_date: this.filters.to_date,
			item_groups: JSON.stringify(this.filters.item_groups),
			warehouses: JSON.stringify(this.filters.warehouses),
			lengths: JSON.stringify(this.filters.lengths),
			actual_required: JSON.stringify(actualRequired)
		};

		let xhr = new XMLHttpRequest();
		let url = '/api/method/expenses_management.expenses_management.page.purchase_requirements_report.purchase_requirements_report.export_excel';
		xhr.open('POST', url, true);
		xhr.responseType = 'blob';
		xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xhr.setRequestHeader('X-Frappe-CSRF-Token', frappe.csrf_token);

		xhr.onload = function() {
			frappe.dom.unfreeze();
			if (xhr.status === 200) {
				let blob = xhr.response;
				// Check if response is actually JSON error (not xlsx)
				let contentType = xhr.getResponseHeader('Content-Type') || '';
				if (contentType.indexOf('json') !== -1) {
					// Server returned JSON error
					let reader = new FileReader();
					reader.onload = function() {
						try {
							let err = JSON.parse(reader.result);
							frappe.msgprint({title: __('\u062e\u0637\u0623'), indicator: 'red', message: err._server_messages || err.message || '\u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641'});
						} catch(e) {
							frappe.msgprint({title: __('\u062e\u0637\u0623'), indicator: 'red', message: reader.result});
						}
					};
					reader.readAsText(blob);
					return;
				}
				let filename = '\u0634\u064a\u062a_\u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a.xlsx';
				let cd = xhr.getResponseHeader('Content-Disposition');
				if (cd) {
					let match = cd.match(/filename[^;=\n]*=(['\'\"]?)([^\'\"\n]*?)\1(;|$)/);
					if (match && match[2]) filename = decodeURIComponent(match[2]);
				}
				let link = document.createElement('a');
				link.href = URL.createObjectURL(blob);
				link.download = filename;
				link.click();
				URL.revokeObjectURL(link.href);
			} else {
				// Try to read error from blob
				let reader = new FileReader();
				reader.onload = function() {
					try {
						let err = JSON.parse(reader.result);
						let msg = err._server_messages || err.message || '\u0641\u0634\u0644 \u062a\u0635\u062f\u064a\u0631 \u0627\u0644\u0645\u0644\u0641';
						if (err._server_messages) {
							try { msg = JSON.parse(err._server_messages); } catch(e2) {}
						}
						frappe.msgprint({title: __('\u062e\u0637\u0623'), indicator: 'red', message: JSON.stringify(msg)});
					} catch(e) {
						frappe.msgprint({title: __('\u062e\u0637\u0623'), indicator: 'red', message: '\u0641\u0634\u0644 \u062a\u0635\u062f\u064a\u0631 \u0627\u0644\u0645\u0644\u0641 (HTTP ' + xhr.status + ')'});
					}
				};
				reader.readAsText(xhr.response);
			}
		};

		xhr.onerror = function() {
			frappe.dom.unfreeze();
			frappe.msgprint({title: __('خطأ'), indicator: 'red', message: __('خطأ في الاتصال')});
		};

		let body = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
		xhr.send(body);
	}

	fmt(v) {
		return parseFloat(v || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	num(v, p) {
		p = p !== undefined ? p : 2;
		return parseFloat(v || 0).toFixed(p).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	render_content() {
		this.page.main.html(`
			<style>
				@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
				@keyframes spin { to { transform: rotate(360deg); } }

				.floating-actions { position: fixed; bottom: 30px; right: 30px; z-index: 9999; display: flex; flex-direction: column-reverse; gap: 12px; animation: fadeInUp 0.5s ease-out; }
				.float-btn { width: 50px; height: 50px; border-radius: 50%; border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
				.float-btn:hover { transform: scale(1.15); box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
				.float-btn:active { transform: scale(0.95); }
				.float-btn.settings-btn { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
				.float-btn.settings-btn:hover { transform: scale(1.15) rotate(180deg); }
				.float-btn.reload-btn { background: linear-gradient(135deg, #059669, #10b981); }
				.float-btn.reload-btn:hover i { animation: spin 0.6s ease-in-out; }
				.float-btn.excel-btn { background: linear-gradient(135deg, #059669, #10b981); }
				.float-btn i { font-size: 18px; font-weight: 900; }
				.float-btn .btn-tooltip { position: absolute; left: 60px; background: #1e293b; color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; opacity: 0; visibility: hidden; transition: all 0.3s ease; pointer-events: none; }
				.float-btn:hover .btn-tooltip { opacity: 1; visibility: visible; left: 65px; }

				.purchase-requirements-report { direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; min-height: 100vh; padding: 0; margin: 0 -15px 0 -15px; }

				.summary-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 0; padding: 6px 16px; margin-bottom: 0; color: #fff; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }
				.summary-title { font-size: 16px; font-weight: 900; }
				
				.filter-tag { display: inline-flex; align-items: center; gap: 4px; background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 14px; padding: 3px 10px; font-size: 12px; font-weight: 700; color: #c7d2fe; }
				.filter-tag i { font-size: 12px; }

				.report-table-container { border-radius: 0; overflow: visible; box-shadow: none; background: #fff; }
				.table-scroll-wrapper { overflow-x: auto; overflow-y: auto; max-height: calc(100vh - 120px); direction: rtl; }
				.table-scroll-wrapper::-webkit-scrollbar { height: 12px; width: 10px; }
				.table-scroll-wrapper::-webkit-scrollbar-track { background: #f1f5f9; }
				.table-scroll-wrapper::-webkit-scrollbar-thumb { background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 6px; }

				.purchase-req-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 13px; font-weight: 900; direction: rtl; }
				.purchase-req-table th, .purchase-req-table td { padding: 7px 5px; text-align: center; white-space: nowrap; border: 1px solid #e2e8f0; }

				.header-group-row th { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; font-weight: 900; font-size: 13px; padding: 10px 8px; border-bottom: 3px solid #6366f1; position: sticky; top: 0; z-index: 20; }
				.header-detail-row th { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #e2e8f0; font-weight: 800; font-size: 11px; padding: 8px 4px; position: sticky; top: 43px; z-index: 19; }

				.wh-header-even { background: linear-gradient(135deg, #1e3a5f 0%, #1e293b 100%) !important; }
				.wh-header-odd { background: linear-gradient(135deg, #2d1b69 0%, #1e293b 100%) !important; }
				.wh-col-even { background-color: #f8fafc; }
				.wh-col-odd { background-color: #f0f4ff; }
				.wh-sub-header.wh-col-even { background: linear-gradient(135deg, #1e3a5f 0%, #334155 100%) !important; color: #e2e8f0 !important; }
				.wh-sub-header.wh-col-odd { background: linear-gradient(135deg, #2d1b69 0%, #334155 100%) !important; color: #e2e8f0 !important; }

				.fixed-right-col-0 { position: sticky; right: 0; z-index: 11; min-width: 40px; max-width: 40px; background: #fff; }
				.fixed-right-col-1 { position: sticky; right: 40px; z-index: 11; min-width: 80px; background: #fff; }
				.fixed-right-col-2 { position: sticky; right: 120px; z-index: 11; min-width: 180px; background: #fff; text-align: right; padding-right: 10px !important; border-left: 3px solid #6366f1; }
				.scroll-item-header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; text-align: center; }
				.scroll-item-cell { text-align: center; }
				.item-details-scroll { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; font-weight: 900; }

				.header-group-row .fixed-right-header { position: sticky; right: 0; z-index: 30; }
				.header-detail-row .fixed-right-col-0 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; right: 0; z-index: 25; min-width: 40px; max-width: 40px; }
				.header-detail-row .fixed-right-col-1 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; right: 40px; z-index: 25; }
				.header-detail-row .fixed-right-col-2 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; right: 120px; z-index: 25; border-left: 3px solid #6366f1; }

				.row-even .fixed-right-col-0, .row-even .fixed-right-col-1, .row-even .fixed-right-col-2 { background: #eef2ff !important; }
				.row-odd .fixed-right-col-0, .row-odd .fixed-right-col-1, .row-odd .fixed-right-col-2 { background: #e0e7ff !important; }

				.fixed-left-col-4 { min-width: 80px; background: #fff; }
				.fixed-left-col-3 { min-width: 75px; background: #fff; }
				.fixed-left-col-2 { min-width: 75px; background: #fff; }
				.fixed-left-col-1 { min-width: 75px; background: #fff; }
				.fixed-left-col-0 { min-width: 75px; background: #fff; border-right: 3px solid #6366f1; }

				.header-group-row .fixed-left-header { }
				.header-detail-row .fixed-left-col-4 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; }
				.header-detail-row .fixed-left-col-3 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; }
				.header-detail-row .fixed-left-col-2 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; }
				.header-detail-row .fixed-left-col-1 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; }
				.header-detail-row .fixed-left-col-0 { background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important; color: #e2e8f0; border-right: 3px solid #6366f1; }

				.row-even .fixed-left-col-0, .row-even .fixed-left-col-1, .row-even .fixed-left-col-2, .row-even .fixed-left-col-3, .row-even .fixed-left-col-4 { background: #fff; }
				.row-odd .fixed-left-col-0, .row-odd .fixed-left-col-1, .row-odd .fixed-left-col-2, .row-odd .fixed-left-col-3, .row-odd .fixed-left-col-4 { background: #f8fafc; }

				.total-cell { font-weight: 900; color: #1e293b; font-size: 14px; }
				.total-col { font-weight: 900; color: #0f766e; }
				.sales-col { font-weight: 900; color: #7c3aed; }
				.req-col { font-weight: 900; color: #dc2626; }

				.group-separator-row td { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #fff; font-weight: 900; font-size: 14px; padding: 8px 16px; text-align: right; }
				.group-separator-row .group-name-cell { position: sticky; right: 0; z-index: 12; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); }

				.actual-req-input { width: 60px; height: 26px; border: 2px solid #cbd5e1; border-radius: 6px; text-align: center; font-size: 11px; font-weight: 800; background: #fff; transition: border-color 0.3s; direction: ltr; }
				.actual-req-input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
				.actual-req-input::placeholder { color: #cbd5e1; }

				.group-fill-cell { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; }
				.data-row td { font-size: 13px; font-weight: 900; color: #1e293b; }
				.data-row:hover td { background-color: #eef2ff !important; }
				.data-row:hover .fixed-right-col-0, .data-row:hover .fixed-right-col-1, .data-row:hover .fixed-right-col-2 { background-color: #c7d2fe !important; }
				.data-row:hover .fixed-left-col { background-color: #eef2ff !important; }

				.empty-box { text-align: center; padding: 80px 20px; color: #64748b; }
				.empty-box i { font-size: 60px; margin-bottom: 20px; color: #cbd5e1; }
				.empty-box h4 { font-size: 22px; font-weight: 900; margin-bottom: 10px; }
				.empty-box p { font-size: 16px; }

				.loading-box { text-align: center; padding: 80px 20px; }
				.loading-box .spinner { width: 50px; height: 50px; border: 5px solid #e2e8f0; border-top: 5px solid #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
				.loading-box .loading-txt { font-size: 18px; font-weight: 800; color: #64748b; }
			</style>
			<div class="floating-actions">
				<button class="float-btn settings-btn" id="settings-btn">
					<i class="fa fa-cog"></i>
					<span class="btn-tooltip">\u0625\u0639\u062f\u0627\u062f\u0627\u062a</span>
				</button>
				<button class="float-btn reload-btn" id="reload-btn">
					<i class="fa fa-refresh"></i>
					<span class="btn-tooltip">\u062a\u062d\u062f\u064a\u062b</span>
				</button>
				<button class="float-btn excel-btn" id="excel-btn">
					<i class="fa fa-file-excel-o"></i>
					<span class="btn-tooltip">\u0637\u0628\u0627\u0639\u0629</span>
				</button>
			</div>
			<div class="purchase-requirements-report">
				<div id="report-content">
					<div class="empty-box">
						<i class="fa fa-inbox"></i>
						<h4>\u0634\u064a\u062a \u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a</h4>
						<p>\u0627\u0636\u063a\u0637 \u0639\u0644\u0649 \u0632\u0631 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0644\u062a\u062d\u062f\u064a\u062f \u0645\u0639\u0627\u064a\u064a\u0631 \u0627\u0644\u0628\u062d\u062b</p>
					</div>
				</div>
			</div>
		`);

		$('#settings-btn').off('click').on('click', () => this.show_settings_dialog());
		$('#reload-btn').off('click').on('click', () => this.generate_report());
		$('#excel-btn').off('click').on('click', () => this.handle_export_excel());
	}
}
