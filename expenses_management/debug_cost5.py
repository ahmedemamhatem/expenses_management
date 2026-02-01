import frappe
from frappe.utils import flt

def run():
    items = frappe.db.sql("""
        SELECT
            sii.item_code, sii.stock_qty, sii.base_net_amount,
            sii.stock_uom, sii.uom, sii.qty,
            COALESCE(item.is_stock_item, 0) as is_stock_item,
            (
                SELECT sle_pr.incoming_rate
                FROM `tabStock Ledger Entry` sle_pr
                WHERE sle_pr.item_code = sii.item_code
                AND sle_pr.voucher_type IN ('Purchase Receipt', 'Purchase Invoice')
                AND sle_pr.is_cancelled = 0
                AND sle_pr.actual_qty > 0
                AND sle_pr.incoming_rate > 0
                ORDER BY sle_pr.posting_date DESC, sle_pr.creation DESC
                LIMIT 1
            ) as pr_rate
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` item ON item.name = sii.item_code
        WHERE si.docstatus = 1
        AND si.is_return = 0
        AND si.status != 'Credit Note Issued'
        AND si.customer = 'CUST-2025-00053'
        AND COALESCE(item.is_stock_item, 0) = 1
    """, as_dict=1)

    big = []
    for i in items:
        pr_rate = flt(i.pr_rate)
        cost = flt(i.stock_qty) * pr_rate
        amt = flt(i.base_net_amount)
        if cost > amt * 3 and cost > 1000:
            big.append({"item_code": i.item_code, "qty": i.qty, "stock_qty": i.stock_qty, "uom": i.uom, "stock_uom": i.stock_uom, "amt": amt, "pr_rate": pr_rate, "cost": cost})

    big.sort(key=lambda x: x["cost"], reverse=True)
    print("Items where cost > 3x amount (%s items):" % len(big))
    for b in big[:30]:
        print("  %s: qty=%s %s, stock_qty=%s %s, amt=%s, pr_rate=%s, cost=%s" % (b["item_code"], b["qty"], b["uom"], b["stock_qty"], b["stock_uom"], b["amt"], b["pr_rate"], round(b["cost"], 2)))

run()
