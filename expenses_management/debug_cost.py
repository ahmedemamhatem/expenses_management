import frappe
from frappe.utils import flt

def run():
    items = frappe.db.sql("""
        SELECT
            sii.name as sii_name, sii.item_code, sii.stock_qty, sii.base_net_amount,
            sii.stock_uom, sii.uom, sii.qty, sii.conversion_factor,
            COALESCE(item.is_stock_item, 0) as is_stock_item
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` item ON item.name = sii.item_code
        WHERE si.docstatus = 1
        AND si.is_return = 0
        AND si.status != 'Credit Note Issued'
        AND si.customer = 'CUST-2025-00053'
    """, as_dict=1)

    total_net = 0
    total_cost = 0
    big_items = []

    for i in items:
        total_net += flt(i.base_net_amount)
        if not i.is_stock_item:
            pass
        else:
            bv = frappe.db.sql("SELECT COALESCE(SUM(actual_qty * valuation_rate) / NULLIF(SUM(actual_qty), 0), 0) as v FROM `tabBin` WHERE item_code=%s AND actual_qty > 0", i.item_code)
            bin_rate = flt(bv[0][0]) if bv else 0
            sv = frappe.db.sql("SELECT sle.valuation_rate FROM `tabDelivery Note Item` dni INNER JOIN `tabStock Ledger Entry` sle ON sle.voucher_type = 'Delivery Note' AND sle.voucher_no = dni.parent AND sle.voucher_detail_no = dni.name AND sle.is_cancelled = 0 WHERE dni.si_detail = %s AND dni.docstatus = 1 ORDER BY sle.posting_date DESC, sle.creation DESC LIMIT 1", i.sii_name)
            sle_rate = flt(sv[0][0]) if sv else 0
            rate = sle_rate if sle_rate else bin_rate
            cost = flt(i.stock_qty) * rate
            total_cost += cost
            if cost > flt(i.base_net_amount) * 5:
                big_items.append({"item_code": i.item_code, "stock_qty": i.stock_qty, "stock_uom": i.stock_uom, "uom": i.uom, "qty": i.qty, "cf": i.conversion_factor, "net_amt": i.base_net_amount, "sle_rate": sle_rate, "bin_rate": bin_rate, "cost": cost})

    print("Total net sales: " + str(total_net))
    print("Total cost (stock items only): " + str(total_cost))
    print("Profit: " + str(total_net - total_cost))
    print("Items where cost > 5x sale (" + str(len(big_items)) + "):")
    big_items.sort(key=lambda x: x["cost"], reverse=True)
    for b in big_items[:20]:
        print("  " + str(b["item_code"]) + ": qty=" + str(b["qty"]) + " " + str(b["uom"]) + ", stock_qty=" + str(b["stock_qty"]) + " " + str(b["stock_uom"]) + ", cf=" + str(b["cf"]) + ", net=" + str(b["net_amt"]) + ", sle_rate=" + str(b["sle_rate"]) + ", bin_rate=" + str(b["bin_rate"]) + ", cost=" + str(round(b["cost"], 2)))

run()
