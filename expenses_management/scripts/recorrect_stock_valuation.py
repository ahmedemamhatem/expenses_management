#!/usr/bin/env python3
"""
Stock Valuation Correction Script
==================================
This script corrects incoming_rate and valuation_rate across all related documents:
- Stock Ledger Entries (SLE)
- Sales Invoice Items
- Delivery Note Items
- Purchase Invoice Items
- Purchase Receipt Items
- Stock Entry Details
- GL Entries (reposted)

Usage:
    # Correct single item
    bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['20001', 'Warehouse Name', '2025-05-01']"

    # Correct all items in a warehouse
    bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_warehouse_valuation --args "['Warehouse Name', '2025-05-01']"

    # Correct all items in all warehouses
    bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_all_valuation --args "['2025-05-01']"

    # Dry run (preview changes without applying)
    bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['20001', 'Warehouse Name', '2025-05-01', True]"
"""

import frappe
from frappe import _
from frappe.utils import flt, cint, now_datetime, get_datetime
from collections import defaultdict
import json


class StockValuationCorrector:
    """
    Main class to handle stock valuation corrections across all documents
    """

    def __init__(self, item_code=None, warehouse=None, from_date=None, dry_run=False, company=None):
        self.item_code = item_code
        self.warehouse = warehouse
        self.from_date = from_date or "2020-01-01"
        self.dry_run = dry_run
        self.company = company

        self.precision = cint(frappe.db.get_single_value("System Settings", "float_precision")) or 2
        self.currency_precision = cint(frappe.db.get_single_value("System Settings", "currency_precision")) or 2

        # Statistics
        self.stats = {
            "sle_updated": 0,
            "si_items_updated": 0,
            "dn_items_updated": 0,
            "pi_items_updated": 0,
            "pr_items_updated": 0,
            "se_items_updated": 0,
            "gl_reposted": 0,
            "errors": []
        }

        # Cache for valuation rates
        self.valuation_cache = {}

    def log(self, message, level="info"):
        """Log message with timestamp"""
        timestamp = now_datetime().strftime("%Y-%m-%d %H:%M:%S")
        prefix = "🔍 [DRY RUN]" if self.dry_run else "✓"
        if level == "error":
            prefix = "✗"
        elif level == "warning":
            prefix = "⚠"
        print(f"[{timestamp}] {prefix} {message}")

    def get_correct_valuation_rate(self, item_code, warehouse, posting_date, posting_time):
        """
        Get the correct valuation rate for an item at a specific point in time
        """
        cache_key = f"{item_code}|{warehouse}|{posting_date}|{posting_time}"

        if cache_key in self.valuation_cache:
            return self.valuation_cache[cache_key]

        # Get valuation rate from the last SLE before this date/time
        result = frappe.db.sql("""
            SELECT valuation_rate, qty_after_transaction
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND warehouse = %s
            AND is_cancelled = 0
            AND posting_datetime <= CONCAT(%s, ' ', %s)
            ORDER BY posting_datetime DESC, creation DESC
            LIMIT 1
        """, (item_code, warehouse, posting_date, posting_time), as_dict=1)

        rate = result[0].valuation_rate if result else 0
        self.valuation_cache[cache_key] = rate

        return rate

    def get_items_to_correct(self):
        """Get list of items that need correction"""
        query = """
            SELECT DISTINCT item_code, warehouse
            FROM `tabStock Ledger Entry`
            WHERE is_cancelled = 0
            AND posting_date >= %(from_date)s
        """
        params = {"from_date": self.from_date}

        if self.item_code:
            query += " AND item_code = %(item_code)s"
            params["item_code"] = self.item_code

        if self.warehouse:
            query += " AND warehouse = %(warehouse)s"
            params["warehouse"] = self.warehouse

        items = frappe.db.sql(query, params, as_dict=1)
        return items

    def correct_sales_invoice_items(self, item_code, warehouse):
        """Correct incoming_rate on Sales Invoice Items"""
        self.log(f"Correcting Sales Invoice Items for {item_code}...")

        si_items = frappe.db.sql("""
            SELECT
                sii.name, sii.parent, sii.incoming_rate,
                si.posting_date, si.posting_time
            FROM `tabSales Invoice Item` sii
            JOIN `tabSales Invoice` si ON si.name = sii.parent
            WHERE sii.item_code = %s
            AND si.docstatus = 1
            AND si.posting_date >= %s
            ORDER BY si.posting_date, si.posting_time
        """, (item_code, self.from_date), as_dict=1)

        updated = 0
        for si_item in si_items:
            correct_rate = self.get_correct_valuation_rate(
                item_code, warehouse, si_item.posting_date, si_item.posting_time
            )

            if abs(flt(correct_rate, self.precision) - flt(si_item.incoming_rate, self.precision)) > 0.01:
                if not self.dry_run:
                    frappe.db.set_value(
                        "Sales Invoice Item", si_item.name,
                        "incoming_rate", correct_rate,
                        update_modified=False
                    )
                self.log(f"  SI {si_item.parent}: {si_item.incoming_rate} -> {correct_rate}")
                updated += 1

        self.stats["si_items_updated"] += updated
        return updated

    def correct_delivery_note_items(self, item_code, warehouse):
        """Correct incoming_rate on Delivery Note Items"""
        self.log(f"Correcting Delivery Note Items for {item_code}...")

        dn_items = frappe.db.sql("""
            SELECT
                dni.name, dni.parent, dni.incoming_rate,
                dn.posting_date, dn.posting_time
            FROM `tabDelivery Note Item` dni
            JOIN `tabDelivery Note` dn ON dn.name = dni.parent
            WHERE dni.item_code = %s
            AND dn.docstatus = 1
            AND dn.posting_date >= %s
            ORDER BY dn.posting_date, dn.posting_time
        """, (item_code, self.from_date), as_dict=1)

        updated = 0
        for dn_item in dn_items:
            correct_rate = self.get_correct_valuation_rate(
                item_code, warehouse, dn_item.posting_date, dn_item.posting_time
            )

            if abs(flt(correct_rate, self.precision) - flt(dn_item.incoming_rate, self.precision)) > 0.01:
                if not self.dry_run:
                    frappe.db.set_value(
                        "Delivery Note Item", dn_item.name,
                        "incoming_rate", correct_rate,
                        update_modified=False
                    )
                self.log(f"  DN {dn_item.parent}: {dn_item.incoming_rate} -> {correct_rate}")
                updated += 1

        self.stats["dn_items_updated"] += updated
        return updated

    def correct_purchase_receipt_items(self, item_code, warehouse):
        """Correct valuation_rate on Purchase Receipt Items"""
        self.log(f"Correcting Purchase Receipt Items for {item_code}...")

        pr_items = frappe.db.sql("""
            SELECT
                pri.name, pri.parent, pri.valuation_rate,
                pr.posting_date, pr.posting_time
            FROM `tabPurchase Receipt Item` pri
            JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
            WHERE pri.item_code = %s
            AND pri.warehouse = %s
            AND pr.docstatus = 1
            AND pr.posting_date >= %s
            ORDER BY pr.posting_date, pr.posting_time
        """, (item_code, warehouse, self.from_date), as_dict=1)

        updated = 0
        for pr_item in pr_items:
            # For purchase receipts, we check if the rate needs adjustment
            # based on landed cost or other factors
            current_rate = pr_item.valuation_rate

            # Get the SLE rate for this specific transaction
            sle_rate = frappe.db.get_value(
                "Stock Ledger Entry",
                {
                    "voucher_type": "Purchase Receipt",
                    "voucher_no": pr_item.parent,
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "is_cancelled": 0
                },
                "incoming_rate"
            )

            if sle_rate and abs(flt(sle_rate, self.precision) - flt(current_rate, self.precision)) > 0.01:
                if not self.dry_run:
                    frappe.db.set_value(
                        "Purchase Receipt Item", pr_item.name,
                        "valuation_rate", sle_rate,
                        update_modified=False
                    )
                self.log(f"  PR {pr_item.parent}: {current_rate} -> {sle_rate}")
                updated += 1

        self.stats["pr_items_updated"] += updated
        return updated

    def correct_purchase_invoice_items(self, item_code, warehouse):
        """Correct valuation_rate on Purchase Invoice Items (with update_stock)"""
        self.log(f"Correcting Purchase Invoice Items for {item_code}...")

        pi_items = frappe.db.sql("""
            SELECT
                pii.name, pii.parent, pii.valuation_rate,
                pi.posting_date, pi.posting_time
            FROM `tabPurchase Invoice Item` pii
            JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
            WHERE pii.item_code = %s
            AND pii.warehouse = %s
            AND pi.docstatus = 1
            AND pi.update_stock = 1
            AND pi.posting_date >= %s
            ORDER BY pi.posting_date, pi.posting_time
        """, (item_code, warehouse, self.from_date), as_dict=1)

        updated = 0
        for pi_item in pi_items:
            sle_rate = frappe.db.get_value(
                "Stock Ledger Entry",
                {
                    "voucher_type": "Purchase Invoice",
                    "voucher_no": pi_item.parent,
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "is_cancelled": 0
                },
                "incoming_rate"
            )

            if sle_rate and abs(flt(sle_rate, self.precision) - flt(pi_item.valuation_rate, self.precision)) > 0.01:
                if not self.dry_run:
                    frappe.db.set_value(
                        "Purchase Invoice Item", pi_item.name,
                        "valuation_rate", sle_rate,
                        update_modified=False
                    )
                self.log(f"  PI {pi_item.parent}: {pi_item.valuation_rate} -> {sle_rate}")
                updated += 1

        self.stats["pi_items_updated"] += updated
        return updated

    def correct_stock_entry_items(self, item_code, warehouse):
        """Correct basic_rate/valuation_rate on Stock Entry Details"""
        self.log(f"Correcting Stock Entry Items for {item_code}...")

        se_items = frappe.db.sql("""
            SELECT
                sed.name, sed.parent, sed.basic_rate, sed.valuation_rate,
                sed.s_warehouse, sed.t_warehouse,
                se.posting_date, se.posting_time, se.stock_entry_type
            FROM `tabStock Entry Detail` sed
            JOIN `tabStock Entry` se ON se.name = sed.parent
            WHERE sed.item_code = %s
            AND (sed.s_warehouse = %s OR sed.t_warehouse = %s)
            AND se.docstatus = 1
            AND se.posting_date >= %s
            ORDER BY se.posting_date, se.posting_time
        """, (item_code, warehouse, warehouse, self.from_date), as_dict=1)

        updated = 0
        for se_item in se_items:
            # Get the SLE rate for this transaction
            sle_rate = frappe.db.get_value(
                "Stock Ledger Entry",
                {
                    "voucher_type": "Stock Entry",
                    "voucher_no": se_item.parent,
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "is_cancelled": 0
                },
                ["incoming_rate", "valuation_rate"],
                as_dict=1
            )

            if sle_rate:
                needs_update = False
                updates = {}

                if sle_rate.incoming_rate and abs(flt(sle_rate.incoming_rate, self.precision) - flt(se_item.basic_rate, self.precision)) > 0.01:
                    updates["basic_rate"] = sle_rate.incoming_rate
                    needs_update = True

                if sle_rate.valuation_rate and abs(flt(sle_rate.valuation_rate, self.precision) - flt(se_item.valuation_rate, self.precision)) > 0.01:
                    updates["valuation_rate"] = sle_rate.valuation_rate
                    needs_update = True

                if needs_update:
                    if not self.dry_run:
                        frappe.db.set_value(
                            "Stock Entry Detail", se_item.name,
                            updates,
                            update_modified=False
                        )
                    self.log(f"  SE {se_item.parent}: updated rates")
                    updated += 1

        self.stats["se_items_updated"] += updated
        return updated

    def correct_stock_ledger_entries(self, item_code, warehouse):
        """
        Correct incoming_rate on Stock Ledger Entries for outgoing transactions
        This updates the incoming_rate field which is used for reporting
        """
        self.log(f"Correcting Stock Ledger Entries for {item_code}...")

        # Get all outgoing SLEs (negative qty) that might have wrong incoming_rate
        sles = frappe.db.sql("""
            SELECT
                name, voucher_type, voucher_no, posting_date, posting_time,
                actual_qty, incoming_rate, valuation_rate
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND warehouse = %s
            AND is_cancelled = 0
            AND actual_qty < 0
            AND posting_date >= %s
            ORDER BY posting_datetime, creation
        """, (item_code, warehouse, self.from_date), as_dict=1)

        updated = 0
        for sle in sles:
            # For outgoing transactions, incoming_rate should match the valuation_rate
            # at the time of transaction (cost of goods sold)
            correct_rate = self.get_correct_valuation_rate(
                item_code, warehouse, sle.posting_date, sle.posting_time
            )

            if abs(flt(correct_rate, self.precision) - flt(sle.incoming_rate, self.precision)) > 0.01:
                if not self.dry_run:
                    frappe.db.set_value(
                        "Stock Ledger Entry", sle.name,
                        "incoming_rate", correct_rate,
                        update_modified=False
                    )
                self.log(f"  SLE {sle.name} ({sle.voucher_type}): {sle.incoming_rate} -> {correct_rate}")
                updated += 1

        self.stats["sle_updated"] += updated
        return updated

    def create_repost_entry(self, item_code, warehouse):
        """Create Repost Item Valuation entry for the item"""
        self.log(f"Creating Repost Item Valuation entry for {item_code}...")

        if self.dry_run:
            self.log("  Would create Repost Item Valuation entry")
            return None

        # Check if similar repost already exists
        existing = frappe.db.exists("Repost Item Valuation", {
            "item_code": item_code,
            "warehouse": warehouse,
            "posting_date": self.from_date,
            "status": ["in", ["Queued", "In Progress"]]
        })

        if existing:
            self.log(f"  Repost entry already exists: {existing}")
            return existing

        try:
            repost = frappe.new_doc("Repost Item Valuation")
            repost.based_on = "Item and Warehouse"
            repost.item_code = item_code
            repost.warehouse = warehouse
            repost.posting_date = self.from_date
            repost.posting_time = "00:00:00"
            repost.allow_negative_stock = 1
            repost.allow_zero_rate = 0
            repost.save()
            repost.submit()

            self.log(f"  Created Repost Item Valuation: {repost.name}")
            return repost.name
        except Exception as e:
            self.log(f"  Error creating repost entry: {str(e)}", level="error")
            self.stats["errors"].append(f"Repost creation failed for {item_code}: {str(e)}")
            return None

    def repost_gl_entries(self, item_code, warehouse):
        """Repost GL entries for affected vouchers"""
        self.log(f"Reposting GL entries for {item_code}...")

        if self.dry_run:
            # Count vouchers that would be reposted
            voucher_count = frappe.db.sql("""
                SELECT COUNT(DISTINCT voucher_no) as cnt
                FROM `tabStock Ledger Entry`
                WHERE item_code = %s
                AND warehouse = %s
                AND is_cancelled = 0
                AND posting_date >= %s
            """, (item_code, warehouse, self.from_date), as_dict=1)
            self.log(f"  Would repost GL entries for {voucher_count[0].cnt} vouchers")
            return 0

        # Get affected vouchers
        vouchers = frappe.db.sql("""
            SELECT DISTINCT voucher_type, voucher_no
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s
            AND warehouse = %s
            AND is_cancelled = 0
            AND posting_date >= %s
            ORDER BY posting_datetime
        """, (item_code, warehouse, self.from_date), as_dict=1)

        reposted = 0
        for voucher in vouchers:
            try:
                self.repost_voucher_gl(voucher.voucher_type, voucher.voucher_no)
                reposted += 1
            except Exception as e:
                self.log(f"  Error reposting GL for {voucher.voucher_no}: {str(e)}", level="warning")
                self.stats["errors"].append(f"GL repost failed for {voucher.voucher_no}: {str(e)}")

        self.stats["gl_reposted"] += reposted
        return reposted

    def repost_voucher_gl(self, voucher_type, voucher_no):
        """Repost GL entries for a single voucher"""
        from erpnext.accounts.general_ledger import make_reverse_gl_entries, make_gl_entries
        from erpnext.stock.stock_ledger import get_stock_value_difference

        # Get the document
        doc = frappe.get_doc(voucher_type, voucher_no)

        # Delete existing GL entries for stock accounts
        self.delete_stock_gl_entries(voucher_type, voucher_no)

        # Recreate GL entries if the document has the method
        if hasattr(doc, "get_gl_entries"):
            gl_entries = doc.get_gl_entries()
            if gl_entries:
                make_gl_entries(gl_entries, merge_entries=False)
                self.log(f"  Reposted GL for {voucher_type}: {voucher_no}")

    def delete_stock_gl_entries(self, voucher_type, voucher_no):
        """Delete GL entries related to stock for a voucher"""
        # Get stock related accounts
        stock_accounts = frappe.db.sql("""
            SELECT DISTINCT account
            FROM `tabGL Entry`
            WHERE voucher_type = %s
            AND voucher_no = %s
            AND is_cancelled = 0
            AND account IN (
                SELECT name FROM `tabAccount`
                WHERE account_type IN ('Stock', 'Stock Received But Not Billed',
                                       'Stock Adjustment', 'Expenses Included In Valuation',
                                       'Cost of Goods Sold')
            )
        """, (voucher_type, voucher_no), as_dict=1)

        if stock_accounts:
            # Cancel the existing GL entries for stock accounts
            frappe.db.sql("""
                UPDATE `tabGL Entry`
                SET is_cancelled = 1
                WHERE voucher_type = %s
                AND voucher_no = %s
                AND account IN (
                    SELECT name FROM `tabAccount`
                    WHERE account_type IN ('Stock', 'Stock Received But Not Billed',
                                           'Stock Adjustment', 'Expenses Included In Valuation',
                                           'Cost of Goods Sold')
                )
            """, (voucher_type, voucher_no))

    def correct_gl_entries_directly(self, item_code, warehouse):
        """
        Directly correct GL entries for stock transactions
        This updates the debit/credit amounts based on corrected stock values
        """
        self.log(f"Correcting GL entries directly for {item_code}...")

        # Get all SLEs with their stock value differences
        sles = frappe.db.sql("""
            SELECT
                sle.name, sle.voucher_type, sle.voucher_no,
                sle.stock_value_difference, sle.posting_date,
                sle.actual_qty, sle.valuation_rate
            FROM `tabStock Ledger Entry` sle
            WHERE sle.item_code = %s
            AND sle.warehouse = %s
            AND sle.is_cancelled = 0
            AND sle.posting_date >= %s
            ORDER BY sle.posting_datetime
        """, (item_code, warehouse, self.from_date), as_dict=1)

        if self.dry_run:
            self.log(f"  Would check/correct GL entries for {len(sles)} SLEs")
            return 0

        corrected = 0
        for sle in sles:
            try:
                # Recalculate correct stock_value_difference
                correct_svd = flt(sle.actual_qty) * flt(sle.valuation_rate)

                if abs(flt(correct_svd) - flt(sle.stock_value_difference)) > 0.01:
                    # Update SLE stock_value_difference
                    frappe.db.set_value(
                        "Stock Ledger Entry", sle.name,
                        "stock_value_difference", correct_svd,
                        update_modified=False
                    )

                    # Update corresponding GL entries
                    self.update_gl_entry_amounts(
                        sle.voucher_type, sle.voucher_no,
                        sle.stock_value_difference, correct_svd
                    )

                    self.log(f"  Corrected SVD for {sle.voucher_no}: {sle.stock_value_difference} -> {correct_svd}")
                    corrected += 1

            except Exception as e:
                self.log(f"  Error correcting GL for {sle.voucher_no}: {str(e)}", level="warning")

        return corrected

    def update_gl_entry_amounts(self, voucher_type, voucher_no, old_amount, new_amount):
        """Update GL entry amounts for a voucher"""
        # Get GL entries for this voucher that match the old amount
        gl_entries = frappe.db.sql("""
            SELECT name, account, debit, credit
            FROM `tabGL Entry`
            WHERE voucher_type = %s
            AND voucher_no = %s
            AND is_cancelled = 0
            AND (ABS(debit - %s) < 0.01 OR ABS(credit - %s) < 0.01)
        """, (voucher_type, voucher_no, abs(old_amount), abs(old_amount)), as_dict=1)

        for gl in gl_entries:
            if abs(gl.debit - abs(old_amount)) < 0.01:
                frappe.db.set_value("GL Entry", gl.name, "debit", abs(new_amount), update_modified=False)
                frappe.db.set_value("GL Entry", gl.name, "debit_in_account_currency", abs(new_amount), update_modified=False)
            if abs(gl.credit - abs(old_amount)) < 0.01:
                frappe.db.set_value("GL Entry", gl.name, "credit", abs(new_amount), update_modified=False)
                frappe.db.set_value("GL Entry", gl.name, "credit_in_account_currency", abs(new_amount), update_modified=False)

    def correct_item(self, item_code, warehouse):
        """Correct all documents for a single item-warehouse combination"""
        self.log(f"\n{'='*60}")
        self.log(f"Processing Item: {item_code} | Warehouse: {warehouse}")
        self.log(f"{'='*60}")

        try:
            # Step 1: Correct source documents first (incoming_rate on transaction items)
            self.correct_sales_invoice_items(item_code, warehouse)
            self.correct_delivery_note_items(item_code, warehouse)
            self.correct_purchase_receipt_items(item_code, warehouse)
            self.correct_purchase_invoice_items(item_code, warehouse)
            self.correct_stock_entry_items(item_code, warehouse)

            # Step 2: Correct Stock Ledger Entries (incoming_rate for outgoing transactions)
            self.correct_stock_ledger_entries(item_code, warehouse)

            # Step 3: Correct GL entries directly (stock_value_difference based corrections)
            self.correct_gl_entries_directly(item_code, warehouse)

            # Step 4: Repost GL entries for affected vouchers (full GL recalculation)
            self.repost_gl_entries(item_code, warehouse)

            # Step 5: Create Repost Entry for full recalculation (handles future SLE and GL)
            self.create_repost_entry(item_code, warehouse)

            if not self.dry_run:
                frappe.db.commit()

            self.log(f"Completed processing for {item_code}")

        except Exception as e:
            self.log(f"Error processing {item_code}: {str(e)}", level="error")
            self.stats["errors"].append(f"{item_code}: {str(e)}")
            if not self.dry_run:
                frappe.db.rollback()

    def run(self):
        """Main execution method"""
        self.log(f"\n{'='*80}")
        self.log("Stock Valuation Correction Script")
        self.log(f"{'='*80}")
        self.log(f"Item Code: {self.item_code or 'All Items'}")
        self.log(f"Warehouse: {self.warehouse or 'All Warehouses'}")
        self.log(f"From Date: {self.from_date}")
        self.log(f"Dry Run: {self.dry_run}")
        self.log(f"{'='*80}\n")

        # Get items to process
        items = self.get_items_to_correct()
        self.log(f"Found {len(items)} item-warehouse combinations to process\n")

        # Process each item
        for i, item in enumerate(items):
            self.log(f"\nProgress: {i+1}/{len(items)}")
            self.correct_item(item.item_code, item.warehouse)

            # Commit every 10 items to avoid long transactions
            if not self.dry_run and (i + 1) % 10 == 0:
                frappe.db.commit()
                self.log(f"Committed batch {i+1}")

        # Final commit
        if not self.dry_run:
            frappe.db.commit()

        # Print summary
        self.print_summary()

        return self.stats

    def print_summary(self):
        """Print summary of corrections"""
        self.log(f"\n{'='*80}")
        self.log("SUMMARY")
        self.log(f"{'='*80}")
        self.log(f"Stock Ledger Entries Updated: {self.stats['sle_updated']}")
        self.log(f"Sales Invoice Items Updated: {self.stats['si_items_updated']}")
        self.log(f"Delivery Note Items Updated: {self.stats['dn_items_updated']}")
        self.log(f"Purchase Invoice Items Updated: {self.stats['pi_items_updated']}")
        self.log(f"Purchase Receipt Items Updated: {self.stats['pr_items_updated']}")
        self.log(f"Stock Entry Items Updated: {self.stats['se_items_updated']}")
        self.log(f"GL Entries Reposted: {self.stats['gl_reposted']}")

        if self.stats["errors"]:
            self.log(f"\nErrors ({len(self.stats['errors'])}):", level="error")
            for error in self.stats["errors"][:10]:
                self.log(f"  - {error}", level="error")
            if len(self.stats["errors"]) > 10:
                self.log(f"  ... and {len(self.stats['errors']) - 10} more errors", level="error")

        self.log(f"{'='*80}\n")


# ============================================================================
# Public API Functions
# ============================================================================

def correct_item_valuation(item_code, warehouse, from_date="2025-01-01", dry_run=False):
    """
    Correct valuation for a single item in a warehouse

    Args:
        item_code: Item code to correct
        warehouse: Warehouse name
        from_date: Start date for corrections
        dry_run: If True, only preview changes without applying

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['20001', 'مستودع الصناعية  - م', '2025-05-01']"
    """
    corrector = StockValuationCorrector(
        item_code=item_code,
        warehouse=warehouse,
        from_date=from_date,
        dry_run=dry_run
    )
    return corrector.run()


def correct_warehouse_valuation(warehouse, from_date="2025-01-01", dry_run=False):
    """
    Correct valuation for all items in a warehouse

    Args:
        warehouse: Warehouse name
        from_date: Start date for corrections
        dry_run: If True, only preview changes without applying

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_warehouse_valuation --args "['مستودع الصناعية  - م', '2025-05-01']"
    """
    corrector = StockValuationCorrector(
        warehouse=warehouse,
        from_date=from_date,
        dry_run=dry_run
    )
    return corrector.run()


def correct_all_valuation(from_date="2025-01-01", dry_run=False, company=None):
    """
    Correct valuation for all items in all warehouses

    Args:
        from_date: Start date for corrections
        dry_run: If True, only preview changes without applying
        company: Optional company filter

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_all_valuation --args "['2025-05-01']"
    """
    corrector = StockValuationCorrector(
        from_date=from_date,
        dry_run=dry_run,
        company=company
    )
    return corrector.run()


def process_repost_entries():
    """
    Process all queued Repost Item Valuation entries

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.process_repost_entries
    """
    from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost_entries
    repost_entries()
    print("Repost entries processed successfully!")


def repost_gl_for_item(item_code, warehouse, from_date="2025-01-01", dry_run=False):
    """
    Repost GL entries for a specific item in a warehouse

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.repost_gl_for_item --args "['20001', 'مستودع الصناعية  - م', '2025-05-01']"
    """
    from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost_gl_entries

    print(f"\nReposting GL entries for {item_code} in {warehouse} from {from_date}")

    # Get affected vouchers
    vouchers = frappe.db.sql("""
        SELECT DISTINCT voucher_type, voucher_no
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s
        AND warehouse = %s
        AND is_cancelled = 0
        AND posting_date >= %s
        ORDER BY posting_datetime
    """, (item_code, warehouse, from_date), as_dict=1)

    print(f"Found {len(vouchers)} vouchers to repost")

    if dry_run:
        print("[DRY RUN] Would repost the following vouchers:")
        for v in vouchers[:20]:
            print(f"  - {v.voucher_type}: {v.voucher_no}")
        if len(vouchers) > 20:
            print(f"  ... and {len(vouchers) - 20} more")
        return

    # Repost GL entries
    affected_transactions = set()
    for v in vouchers:
        affected_transactions.add((v.voucher_type, v.voucher_no))

    if affected_transactions:
        repost_gl_entries(list(affected_transactions))
        frappe.db.commit()
        print(f"Successfully reposted GL entries for {len(affected_transactions)} vouchers")


def check_gl_discrepancies(item_code=None, warehouse=None, from_date="2025-01-01"):
    """
    Check GL entries for discrepancies with stock values

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.check_gl_discrepancies --args "['20001', 'مستودع الصناعية  - م']"
    """
    print("\n" + "="*80)
    print("GL Entry Discrepancy Check")
    print("="*80)

    query = """
        SELECT
            sle.voucher_type, sle.voucher_no, sle.posting_date,
            sle.item_code, sle.warehouse,
            sle.stock_value_difference as sle_svd,
            sle.actual_qty, sle.valuation_rate,
            (sle.actual_qty * sle.valuation_rate) as calculated_svd
        FROM `tabStock Ledger Entry` sle
        WHERE sle.is_cancelled = 0
        AND sle.posting_date >= %s
        AND ABS(sle.stock_value_difference - (sle.actual_qty * sle.valuation_rate)) > 1
    """
    params = [from_date]

    if item_code:
        query += " AND sle.item_code = %s"
        params.append(item_code)
    if warehouse:
        query += " AND sle.warehouse = %s"
        params.append(warehouse)

    query += " ORDER BY sle.posting_datetime DESC LIMIT 50"

    discrepancies = frappe.db.sql(query, params, as_dict=1)

    print(f"\nStock Value Difference Discrepancies: {len(discrepancies)}")
    print("-" * 120)
    for d in discrepancies:
        diff = flt(d.sle_svd) - flt(d.calculated_svd)
        print(f"  {d.posting_date} | {d.voucher_type[:15]:15} | {d.voucher_no:25} | SVD: {d.sle_svd:12.2f} | Calc: {d.calculated_svd:12.2f} | Diff: {diff:10.2f}")

    # Check GL entries that don't match SLE
    print("\n" + "-"*80)
    print("Checking GL entries vs SLE stock_value_difference...")

    gl_check = frappe.db.sql("""
        SELECT
            sle.voucher_type, sle.voucher_no, sle.posting_date,
            sle.stock_value_difference as sle_svd,
            COALESCE(gl_debit.total_debit, 0) as gl_debit,
            COALESCE(gl_credit.total_credit, 0) as gl_credit
        FROM `tabStock Ledger Entry` sle
        LEFT JOIN (
            SELECT voucher_type, voucher_no, SUM(debit) as total_debit
            FROM `tabGL Entry`
            WHERE is_cancelled = 0
            AND account IN (SELECT name FROM `tabAccount` WHERE account_type = 'Stock')
            GROUP BY voucher_type, voucher_no
        ) gl_debit ON sle.voucher_type = gl_debit.voucher_type AND sle.voucher_no = gl_debit.voucher_no
        LEFT JOIN (
            SELECT voucher_type, voucher_no, SUM(credit) as total_credit
            FROM `tabGL Entry`
            WHERE is_cancelled = 0
            AND account IN (SELECT name FROM `tabAccount` WHERE account_type = 'Stock')
            GROUP BY voucher_type, voucher_no
        ) gl_credit ON sle.voucher_type = gl_credit.voucher_type AND sle.voucher_no = gl_credit.voucher_no
        WHERE sle.is_cancelled = 0
        AND sle.posting_date >= %s
        {item_filter}
        {warehouse_filter}
        HAVING ABS(sle_svd - (gl_debit - gl_credit)) > 1
        ORDER BY sle.posting_datetime DESC
        LIMIT 30
    """.format(
        item_filter=f"AND sle.item_code = '{item_code}'" if item_code else "",
        warehouse_filter=f"AND sle.warehouse = '{warehouse}'" if warehouse else ""
    ), (from_date,), as_dict=1)

    print(f"\nGL vs SLE Discrepancies: {len(gl_check)}")
    for g in gl_check:
        gl_net = flt(g.gl_debit) - flt(g.gl_credit)
        diff = flt(g.sle_svd) - gl_net
        print(f"  {g.posting_date} | {g.voucher_type[:15]:15} | {g.voucher_no:25} | SLE SVD: {g.sle_svd:12.2f} | GL Net: {gl_net:12.2f} | Diff: {diff:10.2f}")

    print("\n" + "="*80)


def check_valuation_status(item_code=None, warehouse=None):
    """
    Check current valuation status and identify discrepancies

    Usage:
        bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.check_valuation_status --args "['20001', 'مستودع الصناعية  - م']"
    """
    print("\n" + "="*80)
    print("Valuation Status Check")
    print("="*80)

    filters = {}
    if item_code:
        filters["item_code"] = item_code
    if warehouse:
        filters["warehouse"] = warehouse

    # Check pending reposts
    pending_reposts = frappe.db.sql("""
        SELECT name, item_code, warehouse, posting_date, status, modified
        FROM `tabRepost Item Valuation`
        WHERE status IN ('Queued', 'In Progress')
        {item_filter}
        {warehouse_filter}
        ORDER BY creation DESC
        LIMIT 20
    """.format(
        item_filter="AND item_code = %(item_code)s" if item_code else "",
        warehouse_filter="AND warehouse = %(warehouse)s" if warehouse else ""
    ), filters, as_dict=1)

    print(f"\nPending Repost Entries: {len(pending_reposts)}")
    for r in pending_reposts:
        print(f"  - {r.name} | {r.item_code} | {r.status}")

    # Check items with potential valuation issues
    if item_code and warehouse:
        discrepancies = frappe.db.sql("""
            SELECT
                sle.voucher_type, sle.voucher_no,
                sle.incoming_rate as sle_rate,
                sle.valuation_rate,
                sle.posting_date
            FROM `tabStock Ledger Entry` sle
            WHERE sle.item_code = %s
            AND sle.warehouse = %s
            AND sle.is_cancelled = 0
            AND sle.actual_qty < 0
            AND ABS(sle.incoming_rate - sle.valuation_rate) > 1
            ORDER BY sle.posting_datetime DESC
            LIMIT 20
        """, (item_code, warehouse), as_dict=1)

        print(f"\nPotential Discrepancies (incoming_rate vs valuation_rate): {len(discrepancies)}")
        for d in discrepancies:
            print(f"  - {d.posting_date} | {d.voucher_type}: {d.voucher_no} | SLE Rate: {d.sle_rate} | Val Rate: {d.valuation_rate}")

        # Check SI/DN rate mismatches
        si_dn_mismatch = frappe.db.sql("""
            SELECT
                dni.parent as dn, dni.incoming_rate as dn_rate,
                sii.parent as si, sii.incoming_rate as si_rate,
                dn.posting_date
            FROM `tabDelivery Note Item` dni
            JOIN `tabDelivery Note` dn ON dn.name = dni.parent
            LEFT JOIN `tabSales Invoice Item` sii ON dni.si_detail = sii.name
            WHERE dni.item_code = %s
            AND dn.docstatus = 1
            AND sii.name IS NOT NULL
            AND ABS(dni.incoming_rate - sii.incoming_rate) > 0.1
            ORDER BY dn.posting_date DESC
            LIMIT 20
        """, (item_code,), as_dict=1)

        print(f"\nDN vs SI Rate Mismatches: {len(si_dn_mismatch)}")
        for m in si_dn_mismatch:
            print(f"  - {m.posting_date} | DN: {m.dn} ({m.dn_rate}) | SI: {m.si} ({m.si_rate})")

    print("\n" + "="*80)


# ============================================================================
# CLI Interface
# ============================================================================

if __name__ == "__main__":
    import sys

    print("""
Stock Valuation Correction Script
=================================

Usage:
    1. Correct single item:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['ITEM_CODE', 'WAREHOUSE', 'FROM_DATE', dry_run]"

    2. Correct all items in warehouse:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_warehouse_valuation --args "['WAREHOUSE', 'FROM_DATE', dry_run]"

    3. Correct all items:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_all_valuation --args "['FROM_DATE', dry_run]"

    4. Process repost entries:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.process_repost_entries

    5. Check status:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.check_valuation_status --args "['ITEM_CODE', 'WAREHOUSE']"

Examples:
    # Dry run for item 20001
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['20001', 'مستودع الصناعية  - م', '2025-05-01', True]"

    # Actually correct item 20001
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['20001', 'مستودع الصناعية  - م', '2025-05-01', False]"

    # Correct entire warehouse
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.correct_warehouse_valuation --args "['مستودع الصناعية  - م', '2025-05-01', False]"
""")
