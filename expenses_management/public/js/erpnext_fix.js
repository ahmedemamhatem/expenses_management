// ERPNext Bundle Fix - Provides fallback if erpnext.bundle.js fails to load
// This ensures the namespaces exist before doctype JS files run

frappe.provide("erpnext");
frappe.provide("erpnext.accounts");
frappe.provide("erpnext.accounts.taxes");
frappe.provide("erpnext.accounts.payment_triggers");
frappe.provide("erpnext.accounts.pos");
frappe.provide("erpnext.selling");
frappe.provide("erpnext.sales_common");
frappe.provide("erpnext.buying");

// Stub functions - these will be overwritten if the real bundle loads
if (!erpnext.accounts.taxes.setup_tax_validations) {
    erpnext.accounts.taxes.setup_tax_validations = function(doctype) {
        console.warn("ERPNext bundle not loaded - setup_tax_validations stub called for", doctype);
    };
}

if (!erpnext.accounts.taxes.setup_tax_filters) {
    erpnext.accounts.taxes.setup_tax_filters = function(doctype) {
        console.warn("ERPNext bundle not loaded - setup_tax_filters stub called for", doctype);
    };
}

if (!erpnext.accounts.payment_triggers.setup) {
    erpnext.accounts.payment_triggers.setup = function(doctype) {
        console.warn("ERPNext bundle not loaded - payment_triggers.setup stub called for", doctype);
    };
}

if (!erpnext.accounts.pos.setup) {
    erpnext.accounts.pos.setup = function(doctype) {
        console.warn("ERPNext bundle not loaded - pos.setup stub called for", doctype);
    };
}

if (!erpnext.sales_common.setup_selling_controller) {
    erpnext.sales_common.setup_selling_controller = function() {
        console.warn("ERPNext bundle not loaded - setup_selling_controller stub called");
    };
}

if (!erpnext.buying.setup_buying_controller) {
    erpnext.buying.setup_buying_controller = function() {
        console.warn("ERPNext bundle not loaded - setup_buying_controller stub called");
    };
}

console.log("ERPNext fix loaded - namespaces provided");
