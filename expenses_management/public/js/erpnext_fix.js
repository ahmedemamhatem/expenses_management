// ERPNext Bundle Fix - Provides fallback if erpnext.bundle.js fails to load
// This ensures the namespaces exist before doctype JS files run

(function() {
    // Ensure all required namespaces exist
    frappe.provide("erpnext");
    frappe.provide("erpnext.accounts");
    frappe.provide("erpnext.accounts.taxes");
    frappe.provide("erpnext.accounts.payment_triggers");
    frappe.provide("erpnext.accounts.pos");
    frappe.provide("erpnext.accounts.dimensions");
    frappe.provide("erpnext.selling");
    frappe.provide("erpnext.sales_common");
    frappe.provide("erpnext.buying");
    frappe.provide("erpnext.utils");
    frappe.provide("erpnext.taxes");

    // Helper to create stub function
    function createStub(name) {
        return function() {
            console.warn("ERPNext bundle not loaded - " + name + " stub called", arguments);
        };
    }

    // Stub functions - these will be overwritten when real bundle loads
    // Using Object.defineProperty to allow overwriting

    var taxStubs = {
        setup_tax_validations: createStub("setup_tax_validations"),
        setup_tax_filters: createStub("setup_tax_filters"),
        set_conditional_mandatory_rate_or_amount: createStub("set_conditional_mandatory_rate_or_amount"),
        validate_taxes_and_charges: createStub("validate_taxes_and_charges"),
        validate_inclusive_tax: createStub("validate_inclusive_tax")
    };

    for (var key in taxStubs) {
        if (!erpnext.accounts.taxes[key]) {
            erpnext.accounts.taxes[key] = taxStubs[key];
        }
    }

    if (!erpnext.accounts.payment_triggers.setup) {
        erpnext.accounts.payment_triggers.setup = createStub("payment_triggers.setup");
    }

    if (!erpnext.accounts.pos.setup) {
        erpnext.accounts.pos.setup = createStub("pos.setup");
    }

    if (!erpnext.accounts.pos.get_payment_mode_account) {
        erpnext.accounts.pos.get_payment_mode_account = createStub("pos.get_payment_mode_account");
    }

    if (!erpnext.accounts.dimensions) {
        erpnext.accounts.dimensions = {};
    }
    if (!erpnext.accounts.dimensions.update_dimension) {
        erpnext.accounts.dimensions.update_dimension = createStub("dimensions.update_dimension");
    }

    if (!erpnext.sales_common.setup_selling_controller) {
        erpnext.sales_common.setup_selling_controller = createStub("setup_selling_controller");
    }

    if (!erpnext.buying.setup_buying_controller) {
        erpnext.buying.setup_buying_controller = createStub("setup_buying_controller");
    }

    // Mark that fix was loaded
    erpnext._fix_loaded = true;
    console.log("ERPNext namespace fix loaded");
})();
