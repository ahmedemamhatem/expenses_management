import frappe
from frappe.utils import flt

def run():
    # Check SLE for item 21110 - what's the valuation rate and UOM?
    sle_data = frappe.db.sql("""
        SELECT sle.name, sle.item_code, sle.warehouse, sle.posting_date,
            sle.actual_qty, sle.qty_after_transaction, sle.valuation_rate,
            sle.stock_value, sle.stock_value_difference, sle.stock_uom,
            sle.voucher_type, sle.voucher_no
        FROM `tabStock Ledger Entry` sle
        WHERE sle.item_code = '21110'
        AND sle.is_cancelled = 0
        ORDER BY sle.posting_date DESC
        LIMIT 5
    """, as_dict=1)
    print("SLE entries for item 21110:")
    for s in sle_data:
        print("  date=%s, qty=%s, val_rate=%s, stock_uom=%s, voucher=%s %s" % (s.posting_date, s.actual_qty, s.valuation_rate, s.stock_uom, s.voucher_type, s.voucher_no))

    # Check item master
    item = frappe.db.sql("SELECT name, stock_uom, weight_per_unit, weight_uom FROM `tabItem` WHERE name='21110'", as_dict=1)
    print("\nItem master 21110:", item)

    # Check what valuation_rate means - is it per stock_uom?
    # The valuation_rate in SLE should always be per stock_uom
    # If stock_uom is kg and valuation_rate is 3550, that's 3550/kg which is wrong
    # It should be 3.55/kg (i.e., 3550/ton)

    # Check a specific DN SLE entry
    dn_sle = frappe.db.sql("""
        SELECT sle.valuation_rate, sle.stock_uom, sle.actual_qty,
            sle.stock_value_difference, sle.incoming_rate,
            dni.qty, dni.stock_qty, dni.uom, dni.stock_uom as dni_stock_uom,
            dni.conversion_factor
        FROM `tabDelivery Note Item` dni
        INNER JOIN `tabStock Ledger Entry` sle
            ON sle.voucher_type = 'Delivery Note'
            AND sle.voucher_no = dni.parent
            AND sle.voucher_detail_no = dni.name
            AND sle.is_cancelled = 0
        WHERE dni.item_code = '21110'
        AND dni.docstatus = 1
        LIMIT 3
    """, as_dict=1)
    print("\nDN SLE for 21110:")
    for d in dn_sle:
        print("  sle_val_rate=%s, sle_stock_uom=%s, sle_actual_qty=%s, svd=%s" % (d.valuation_rate, d.stock_uom, d.actual_qty, d.stock_value_difference))
        print("    dni_qty=%s, dni_stock_qty=%s, dni_uom=%s, dni_stock_uom=%s, dni_cf=%s" % (d.qty, d.stock_qty, d.uom, d.dni_stock_uom, d.conversion_factor))
        if d.actual_qty:
            print("    implied rate per unit = %s" % (abs(flt(d.stock_value_difference) / flt(d.actual_qty))))

run()
