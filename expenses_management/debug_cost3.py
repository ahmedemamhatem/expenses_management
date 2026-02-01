import frappe
from frappe.utils import flt

def run():
    # Compare approaches for item 21110
    # Approach 1: valuation_rate from SLE (current - broken)
    # Approach 2: stock_value_difference / actual_qty from SLE
    # Approach 3: Bin weighted average
    # Approach 4: Latest Purchase Receipt valuation_rate

    items_to_check = ['21110', '21131', '21108']

    for item_code in items_to_check:
        print("=== Item %s ===" % item_code)

        # Bin rate
        bv = frappe.db.sql("SELECT COALESCE(SUM(actual_qty * valuation_rate) / NULLIF(SUM(actual_qty), 0), 0) as v FROM `tabBin` WHERE item_code=%s AND actual_qty > 0", item_code)
        bin_rate = flt(bv[0][0]) if bv else 0
        print("  Bin weighted avg rate: %s" % bin_rate)

        # Latest purchase receipt SLE
        pr_sle = frappe.db.sql("""
            SELECT valuation_rate, incoming_rate, stock_value_difference, actual_qty
            FROM `tabStock Ledger Entry`
            WHERE item_code=%s AND voucher_type='Purchase Receipt' AND is_cancelled=0 AND actual_qty > 0
            ORDER BY posting_date DESC, creation DESC LIMIT 1
        """, item_code, as_dict=1)
        if pr_sle:
            print("  Latest PR SLE: val_rate=%s, incoming_rate=%s, svd=%s, qty=%s" % (pr_sle[0].valuation_rate, pr_sle[0].incoming_rate, pr_sle[0].stock_value_difference, pr_sle[0].actual_qty))

        # DN SLE entries - check valuation_rate vs svd/qty
        dn_sle = frappe.db.sql("""
            SELECT sle.valuation_rate, sle.actual_qty, sle.stock_value_difference,
                ABS(sle.stock_value_difference / NULLIF(sle.actual_qty, 0)) as implied_rate
            FROM `tabDelivery Note Item` dni
            INNER JOIN `tabStock Ledger Entry` sle
                ON sle.voucher_type = 'Delivery Note'
                AND sle.voucher_no = dni.parent
                AND sle.voucher_detail_no = dni.name
                AND sle.is_cancelled = 0
            INNER JOIN `tabSales Invoice Item` sii ON dni.si_detail = sii.name
            INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
            WHERE dni.item_code = %s
            AND dni.docstatus = 1
            AND si.customer = 'CUST-2025-00053'
            AND si.docstatus = 1
        """, item_code, as_dict=1)

        total_svd = 0
        total_qty = 0
        for d in dn_sle:
            total_svd += abs(flt(d.stock_value_difference))
            total_qty += abs(flt(d.actual_qty))
            if flt(d.valuation_rate) > 100:
                print("  BAD DN SLE: val_rate=%s, qty=%s, svd=%s, implied=%s" % (d.valuation_rate, d.actual_qty, d.stock_value_difference, d.implied_rate))

        if total_qty:
            print("  Avg implied rate from DN SVD: %s" % (total_svd / total_qty))
        print("")

run()
