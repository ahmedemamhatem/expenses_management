// Copyright (c) 2025, Administrator and contributors
// For license information, please see license.txt

frappe.ui.form.on('Ton Rate Update', {
	setup: function(frm) {
		// Filter item_group to show only non-group item groups
		frm.set_query("item_group", function() {
			return {
				filters: {
					"is_group": 0
				}
			};
		});

		// Filter price_list to show only selling price lists
		frm.set_query("price_list", function() {
			return {
				filters: {
					"selling": 1
				}
			};
		});
	},

	refresh: function(frm) {
		// Add custom buttons based on document state
		if (frm.doc.docstatus === 0) {
			// Draft state - show action buttons
			if (frm.doc.item_group && frm.doc.price_list) {
				frm.add_custom_button(__('Get Items'), function() {
					frm.trigger('get_items');
				}).addClass('btn-primary');
			}

			if (frm.doc.items && frm.doc.items.length > 0 && frm.doc.ton_rate) {
				frm.add_custom_button(__('Calculate Rates'), function() {
					frm.trigger('calculate_rates');
				}).addClass('btn-success');
			}
		}

		// Show summary when submitted
		if (frm.doc.docstatus === 1) {
			show_summary(frm);
		}
	},

	item_group: function(frm) {
		// Clear items when item group changes
		if (frm.doc.items && frm.doc.items.length > 0) {
			frappe.confirm(
				__('Changing Item Group will clear the existing items. Continue?'),
				function() {
					frm.clear_table('items');
					frm.refresh_field('items');
				},
				function() {
					// Revert to previous value if user cancels
					frm.reload_doc();
				}
			);
		}
	},

	price_list: function(frm) {
		// Fetch currency from price list
		if (frm.doc.price_list) {
			frappe.db.get_value('Price List', frm.doc.price_list, 'currency', function(r) {
				if (r && r.currency) {
					frm.set_value('currency', r.currency);
				}
			});
		}

		// Clear items when price list changes
		if (frm.doc.items && frm.doc.items.length > 0) {
			frappe.confirm(
				__('Changing Price List will clear the existing items. Continue?'),
				function() {
					frm.clear_table('items');
					frm.refresh_field('items');
				},
				function() {
					// Revert to previous value if user cancels
					frm.reload_doc();
				}
			);
		}
	},

	ton_rate: function(frm) {
		// Auto-recalculate rates when ton rate changes
		if (frm.doc.items && frm.doc.items.length > 0 && frm.doc.ton_rate) {
			frm.trigger('calculate_rates');
		}
	},

	minimum_ton_rate: function(frm) {
		// Auto-recalculate rates when minimum ton rate changes
		if (frm.doc.items && frm.doc.items.length > 0 && frm.doc.ton_rate) {
			frm.trigger('calculate_rates');
		}
	},

	maximum_ton_rate: function(frm) {
		// Auto-recalculate rates when maximum ton rate changes
		if (frm.doc.items && frm.doc.items.length > 0 && frm.doc.ton_rate) {
			frm.trigger('calculate_rates');
		}
	},

	get_items: function(frm) {
		if (!frm.doc.item_group) {
			frappe.msgprint(__('Please select an Item Group first'));
			return;
		}

		if (!frm.doc.price_list) {
			frappe.msgprint(__('Please select a Price List first'));
			return;
		}

		frappe.call({
			method: 'expenses_management.expenses_management.doctype.ton_rate_update.ton_rate_update.get_items_by_group',
			args: {
				item_group: frm.doc.item_group,
				price_list: frm.doc.price_list,
				company: frm.doc.company
			},
			freeze: true,
			freeze_message: __('Fetching Items...'),
			callback: function(r) {
				if (r.message && r.message.length > 0) {
					// Clear existing items
					frm.clear_table('items');

					// Add fetched items
					r.message.forEach(function(item) {
						let row = frm.add_child('items');
						row.item_code = item.item_code;
						row.item_name = item.item_name;
						row.stock_uom = item.stock_uom;
						row.weight_per_unit = item.weight_per_unit || 0;
						row.weight_uom = item.weight_uom || 'Kg';
						row.old_rate = item.old_rate || 0;
						row.item_price_name = item.item_price_name || '';
						row.new_rate = 0;
						row.rate_difference = 0;
					});

					frm.refresh_field('items');

					// Show summary
					let with_weight = r.message.filter(i => i.weight_per_unit > 0).length;
					let without_weight = r.message.length - with_weight;

					let msg = __('Loaded {0} items', [r.message.length]);
					if (without_weight > 0) {
						msg += '<br><span class="text-warning">' +
							__('Warning: {0} items have no weight defined', [without_weight]) +
							'</span>';
					}
					frappe.msgprint({
						title: __('Items Loaded'),
						indicator: 'green',
						message: msg
					});

					// Auto-calculate if ton rate is set
					if (frm.doc.ton_rate) {
						frm.trigger('calculate_rates');
					}
				} else {
					frappe.msgprint({
						title: __('No Items Found'),
						indicator: 'orange',
						message: __('No items found under the selected Item Group')
					});
				}
			}
		});
	},

	calculate_rates: function(frm) {
		if (!frm.doc.ton_rate) {
			frappe.msgprint(__('Please enter Ton Rate first'));
			return;
		}

		if (!frm.doc.items || frm.doc.items.length === 0) {
			frappe.msgprint(__('Please get items first'));
			return;
		}

		// Prepare items data
		let items_data = frm.doc.items.map(function(item) {
			return {
				item_code: item.item_code,
				weight_per_unit: item.weight_per_unit,
				weight_uom: item.weight_uom,
				old_rate: item.old_rate
			};
		});

		frappe.call({
			method: 'expenses_management.expenses_management.doctype.ton_rate_update.ton_rate_update.calculate_item_rates',
			args: {
				items: JSON.stringify(items_data),
				ton_rate: frm.doc.ton_rate,
				minimum_ton_rate: frm.doc.minimum_ton_rate || 0,
				maximum_ton_rate: frm.doc.maximum_ton_rate || 0
			},
			freeze: true,
			freeze_message: __('Calculating Rates...'),
			callback: function(r) {
				if (r.message) {
					// Update items with calculated rates
					r.message.forEach(function(calc_item, idx) {
						if (idx < frm.doc.items.length) {
							frm.doc.items[idx].new_rate = calc_item.new_rate;
							frm.doc.items[idx].rate_difference = calc_item.rate_difference;
							frm.doc.items[idx].minimum_rate = calc_item.minimum_rate;
							frm.doc.items[idx].maximum_rate = calc_item.maximum_rate;
						}
					});

					frm.refresh_field('items');

					// Show summary
					let total_items = frm.doc.items.length;
					let items_with_new_rate = frm.doc.items.filter(i => i.new_rate > 0).length;
					let items_with_increase = frm.doc.items.filter(i => i.rate_difference > 0).length;
					let items_with_decrease = frm.doc.items.filter(i => i.rate_difference < 0).length;

					frappe.msgprint({
						title: __('Rates Calculated'),
						indicator: 'green',
						message: __('Calculated rates for {0} out of {1} items', [items_with_new_rate, total_items]) +
							'<br>' + __('Price Increases: {0}', [items_with_increase]) +
							'<br>' + __('Price Decreases: {0}', [items_with_decrease])
					});
				}
			}
		});
	}
});

// Child table events
frappe.ui.form.on('Ton Rate Update Item', {
	// No specific events needed as all fields are read-only
});

function show_summary(frm) {
	// Show a summary section for submitted documents
	let items_updated = frm.doc.items.filter(i => i.updated).length;
	let total_items = frm.doc.items.length;

	let summary_html = `
		<div class="row">
			<div class="col-sm-6">
				<div class="stat-box">
					<span class="stat-label">${__('Items Updated')}</span>
					<span class="stat-value text-success">${items_updated} / ${total_items}</span>
				</div>
			</div>
			<div class="col-sm-6">
				<div class="stat-box">
					<span class="stat-label">${__('Ton Rate')}</span>
					<span class="stat-value">${format_currency(frm.doc.ton_rate, frm.doc.currency)}</span>
				</div>
			</div>
		</div>
	`;

	// Add summary above items section if not already present
	if (!frm.fields_dict.items_section.$wrapper.find('.ton-rate-summary').length) {
		frm.fields_dict.items_section.$wrapper.prepend(
			`<div class="ton-rate-summary" style="margin-bottom: 15px;">${summary_html}</div>`
		);
	}
}
