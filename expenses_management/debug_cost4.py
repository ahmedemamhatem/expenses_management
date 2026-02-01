import frappe
from frappe.utils import flt

def run():
    result = frappe.db.sql("""
        SELECT
            COALESCE(SUM(sii.base_net_amount), 0) as net_sales,
            COALESCE(SUM(
                sii.stock_qty *
                CASE WHEN COALESCE(item.is_stock_item, 0) = 1 THEN
                    COALESCE(
                        NULLIF((
                            SELECT sle_pr.incoming_rate
                            FROM `tabStock Ledger Entry` sle_pr
                            WHERE sle_pr.item_code = sii.item_code
                            AND sle_pr.voucher_type IN ('Purchase Receipt', 'Purchase Invoice')
                            AND sle_pr.is_cancelled = 0
                            AND sle_pr.actual_qty > 0
                            AND sle_pr.incoming_rate > 0
                            ORDER BY sle_pr.posting_date DESC, sle_pr.creation DESC
                            LIMIT 1
                        ), 0),
                        NULLIF((
                            SELECT COALESCE(SUM(b.actual_qty * b.valuation_rate) / NULLIF(SUM(b.actual_qty), 0), 0)
                            FROM `tabBin` b
                            WHERE b.item_code = sii.item_code
                            AND b.actual_qty > 0
                        ), 0),
                        0
                    )
                ELSE 0
                END
            ), 0) as cost_of_goods
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
        LEFT JOIN `tabItem` item ON item.name = sii.item_code
        WHERE si.docstatus = 1
        AND si.is_return = 0
        AND si.status != 'Credit Note Issued'
        AND si.customer = 'CUST-2025-00053'
    """, as_dict=1)

    net = flt(result[0].net_sales)
    cost = flt(result[0].cost_of_goods)
    profit = net - cost
    margin = (profit / net * 100) if net else 0
    print("Net sales: %s" % net)
    print("Cost of goods: %s" % cost)
    print("Profit: %s" % profit)
    print("Margin: %s%%" % round(margin, 1))

run()
