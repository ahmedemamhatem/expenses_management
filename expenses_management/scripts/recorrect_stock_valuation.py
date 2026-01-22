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

def fix_item_complete(item_code, from_date="2025-05-01"):
    """
    Complete fix for a single item across all warehouses.
    This does everything we did manually for item 20001:
    1. Delete cancelled SLE entries
    2. Repost valuation for all warehouses
    3. Fix incoming_rate on outgoing transactions

    Usage:
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.fix_item_complete --args "['20001']"
    """
    from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost

    print(f"\n{'='*70}")
    print(f"COMPLETE FIX FOR ITEM: {item_code}")
    print(f"{'='*70}")

    company = frappe.db.get_single_value("Global Defaults", "default_company")

    # Step 1: Delete cancelled SLE entries
    print("\n[Step 1] Deleting cancelled SLE entries...")
    cancelled_count = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabStock Ledger Entry`
        WHERE item_code = %s AND is_cancelled = 1
    """, item_code)[0][0]

    if cancelled_count > 0:
        frappe.db.sql("""
            DELETE FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND is_cancelled = 1
        """, item_code)
        frappe.db.commit()
        print(f"  Deleted {cancelled_count} cancelled SLE entries")
    else:
        print("  No cancelled SLE entries found")

    # Step 2: Disable accounting freeze temporarily
    print("\n[Step 2] Checking accounting freeze...")
    acc_settings = frappe.get_single("Accounts Settings")
    old_freeze_date = acc_settings.acc_frozen_upto
    if old_freeze_date:
        print(f"  Temporarily disabling freeze (was: {old_freeze_date})")
        frappe.db.set_single_value("Accounts Settings", "acc_frozen_upto", None)
        frappe.db.commit()

    # Step 3: Get all warehouses for this item
    print("\n[Step 3] Getting warehouses...")
    warehouses = frappe.db.sql_list("""
        SELECT DISTINCT warehouse
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s
    """, item_code)
    print(f"  Found {len(warehouses)} warehouses")

    # Step 4: Repost valuation for each warehouse
    print("\n[Step 4] Reposting valuation for each warehouse...")
    errors = []
    for wh in warehouses:
        try:
            # Get first SLE for this item+warehouse
            first_sle = frappe.db.sql("""
                SELECT posting_date, posting_time
                FROM `tabStock Ledger Entry`
                WHERE item_code = %s AND warehouse = %s
                ORDER BY posting_date, posting_time, creation
                LIMIT 1
            """, (item_code, wh), as_dict=1)

            if not first_sle:
                continue

            sle = first_sle[0]
            print(f"  Reposting {wh[:40]}... from {sle.posting_date}")

            # Create and submit Repost Item Valuation
            repost_doc = frappe.new_doc("Repost Item Valuation")
            repost_doc.based_on = "Item and Warehouse"
            repost_doc.item_code = item_code
            repost_doc.warehouse = wh
            repost_doc.posting_date = sle.posting_date
            repost_doc.posting_time = sle.posting_time
            repost_doc.company = company
            repost_doc.allow_negative_stock = 1
            repost_doc.allow_zero_rate = 0
            repost_doc.flags.ignore_links = True
            repost_doc.flags.ignore_permissions = True
            repost_doc.insert()
            repost_doc.submit()

            # Execute immediately
            repost(repost_doc)
            print(f"    Done")

        except Exception as e:
            frappe.db.rollback()
            errors.append({'warehouse': wh, 'error': str(e)})
            print(f"    Error: {e}")

    frappe.db.commit()

    # Step 5: Fix incoming_rate on outgoing transactions
    print("\n[Step 5] Fixing incoming_rate on outgoing transactions...")
    fixed_count = frappe.db.sql("""
        UPDATE `tabStock Ledger Entry`
        SET incoming_rate = valuation_rate
        WHERE item_code = %s
          AND actual_qty < 0
          AND ABS(incoming_rate - valuation_rate) > 0.01
    """, item_code)
    frappe.db.commit()

    # Count how many were fixed
    remaining = frappe.db.sql("""
        SELECT COUNT(*) FROM `tabStock Ledger Entry`
        WHERE item_code = %s
          AND actual_qty < 0
          AND ABS(incoming_rate - valuation_rate) > 0.01
    """, item_code)[0][0]
    print(f"  Remaining mismatches: {remaining}")

    # Step 6: Update bins
    print("\n[Step 6] Updating bins...")
    for wh in warehouses:
        latest_sle = frappe.db.sql("""
            SELECT qty_after_transaction, valuation_rate, stock_value
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            ORDER BY posting_date DESC, posting_time DESC, creation DESC
            LIMIT 1
        """, (item_code, wh), as_dict=1)

        if latest_sle:
            sle = latest_sle[0]
            bin_name = frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": wh})
            if bin_name:
                frappe.db.set_value("Bin", bin_name, {
                    "actual_qty": sle.qty_after_transaction,
                    "valuation_rate": sle.valuation_rate,
                    "stock_value": sle.stock_value
                }, update_modified=False)

    frappe.db.commit()
    print("  Bins updated")

    # Step 7: Restore accounting freeze
    if old_freeze_date:
        print(f"\n[Step 7] Restoring accounting freeze to: {old_freeze_date}")
        frappe.db.set_single_value("Accounts Settings", "acc_frozen_upto", old_freeze_date)
        frappe.db.commit()

    # Final summary
    print(f"\n{'='*70}")
    print("SUMMARY:")
    print(f"  Cancelled SLE deleted: {cancelled_count}")
    print(f"  Warehouses processed: {len(warehouses)}")
    print(f"  Errors: {len(errors)}")

    # Verify final state
    stats = frappe.db.sql("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN valuation_rate = 0 THEN 1 ELSE 0 END) as zero_val,
            SUM(CASE WHEN actual_qty < 0 AND ABS(incoming_rate - valuation_rate) > 0.01 THEN 1 ELSE 0 END) as mismatched
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s
    """, item_code, as_dict=1)[0]

    print(f"\nFinal Stats for {item_code}:")
    print(f"  Total SLE: {stats.total}")
    print(f"  Zero valuation: {stats.zero_val}")
    print(f"  Mismatched incoming_rate: {stats.mismatched}")
    print(f"{'='*70}\n")

    return {"errors": errors, "warehouses_processed": len(warehouses)}


def fix_all_items_complete(from_date="2025-05-01", batch_size=50):
    """
    Complete fix for ALL items across all warehouses.
    Loops through all items and applies the complete fix.

    Usage:
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.fix_all_items_complete
    """
    print(f"\n{'='*70}")
    print("COMPLETE FIX FOR ALL ITEMS")
    print(f"{'='*70}")

    # Get all distinct items
    items = frappe.db.sql_list("""
        SELECT DISTINCT item_code
        FROM `tabStock Ledger Entry`
        ORDER BY item_code
    """)

    print(f"Total items to process: {len(items)}")

    total_errors = []
    processed = 0

    for item_code in items:
        processed += 1
        print(f"\n[{processed}/{len(items)}] Processing {item_code}...")

        try:
            result = fix_item_complete(item_code, from_date)
            if result.get("errors"):
                total_errors.extend(result["errors"])
        except Exception as e:
            print(f"  Error processing {item_code}: {e}")
            total_errors.append({"item_code": item_code, "error": str(e)})
            frappe.db.rollback()

        # Commit every batch_size items
        if processed % batch_size == 0:
            frappe.db.commit()
            print(f"\n--- Committed batch {processed}/{len(items)} ---\n")

    frappe.db.commit()

    # Final summary
    print(f"\n{'='*70}")
    print("FINAL SUMMARY")
    print(f"{'='*70}")
    print(f"Total items processed: {processed}")
    print(f"Total errors: {len(total_errors)}")

    if total_errors:
        print("\nErrors:")
        for e in total_errors[:20]:
            print(f"  - {e}")
        if len(total_errors) > 20:
            print(f"  ... and {len(total_errors) - 20} more")

    # Get overall stats
    stats = frappe.db.sql("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN valuation_rate = 0 THEN 1 ELSE 0 END) as zero_val,
            SUM(CASE WHEN actual_qty < 0 AND ABS(incoming_rate - valuation_rate) > 0.01 THEN 1 ELSE 0 END) as mismatched,
            COUNT(DISTINCT item_code) as items
        FROM `tabStock Ledger Entry`
    """, as_dict=1)[0]

    print(f"\nOverall Stats:")
    print(f"  Total SLE: {stats.total}")
    print(f"  Distinct items: {stats.items}")
    print(f"  Zero valuation: {stats.zero_val}")
    print(f"  Mismatched incoming_rate: {stats.mismatched}")
    print(f"{'='*70}\n")

    return {"processed": processed, "errors": total_errors}


def get_items_needing_fix():
    """
    Get list of items that need fixing (have issues).

    Usage:
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.get_items_needing_fix
    """
    print(f"\n{'='*70}")
    print("ITEMS NEEDING FIX")
    print(f"{'='*70}")

    # Items with zero valuation rate
    zero_val = frappe.db.sql("""
        SELECT DISTINCT item_code, COUNT(*) as cnt
        FROM `tabStock Ledger Entry`
        WHERE valuation_rate = 0
        GROUP BY item_code
        ORDER BY cnt DESC
    """, as_dict=1)

    print(f"\nItems with zero valuation rate: {len(zero_val)}")
    for item in zero_val[:20]:
        print(f"  {item.item_code}: {item.cnt} entries")

    # Items with mismatched incoming_rate
    mismatched = frappe.db.sql("""
        SELECT DISTINCT item_code, COUNT(*) as cnt
        FROM `tabStock Ledger Entry`
        WHERE actual_qty < 0 AND ABS(incoming_rate - valuation_rate) > 0.01
        GROUP BY item_code
        ORDER BY cnt DESC
    """, as_dict=1)

    print(f"\nItems with mismatched incoming_rate: {len(mismatched)}")
    for item in mismatched[:20]:
        print(f"  {item.item_code}: {item.cnt} entries")

    # Items with cancelled entries
    cancelled = frappe.db.sql("""
        SELECT DISTINCT item_code, COUNT(*) as cnt
        FROM `tabStock Ledger Entry`
        WHERE is_cancelled = 1
        GROUP BY item_code
        ORDER BY cnt DESC
    """, as_dict=1)

    print(f"\nItems with cancelled SLE entries: {len(cancelled)}")
    for item in cancelled[:20]:
        print(f"  {item.item_code}: {item.cnt} entries")

    # Combine all unique items
    all_items = set()
    for item in zero_val:
        all_items.add(item.item_code)
    for item in mismatched:
        all_items.add(item.item_code)
    for item in cancelled:
        all_items.add(item.item_code)

    print(f"\n{'='*70}")
    print(f"Total unique items needing fix: {len(all_items)}")
    print(f"{'='*70}\n")

    return list(all_items)


def rebuild_item_valuation(item_code, dry_run=False):
    """
    Complete rebuild of Moving Average valuation for an item.
    This recalculates valuation from scratch based on actual transactions.

    Steps:
    1. Get all SLE entries in chronological order
    2. Recalculate Moving Average for each transaction
    3. Update SLE with correct valuation_rate, stock_value, incoming_rate
    4. Update related documents (DN, SI, SE items)
    5. Rebuild GL entries

    Usage:
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.rebuild_item_valuation --args "['20001']"
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.rebuild_item_valuation --args "['20001', True]"  # Dry run
    """
    from frappe.utils import flt

    print(f"\n{'='*80}")
    print(f"REBUILD MOVING AVERAGE VALUATION FOR ITEM: {item_code}")
    print(f"Dry Run: {dry_run}")
    print(f"{'='*80}")

    # Disable accounting freeze temporarily
    acc_settings = frappe.get_single("Accounts Settings")
    old_freeze_date = acc_settings.acc_frozen_upto
    if old_freeze_date and not dry_run:
        print(f"\n[Step 0] Temporarily disabling accounting freeze (was: {old_freeze_date})")
        frappe.db.set_single_value("Accounts Settings", "acc_frozen_upto", None)
        frappe.db.commit()

    # Get all warehouses for this item
    warehouses = frappe.db.sql_list("""
        SELECT DISTINCT warehouse
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s
        ORDER BY warehouse
    """, item_code)

    print(f"\n[Step 1] Found {len(warehouses)} warehouses for item {item_code}")

    total_sle_updated = 0
    total_docs_updated = 0

    for warehouse in warehouses:
        print(f"\n{'='*60}")
        print(f"Processing Warehouse: {warehouse}")
        print(f"{'='*60}")

        # Get all SLE entries for this item+warehouse in chronological order
        sles = frappe.db.sql("""
            SELECT
                name, posting_date, posting_time, posting_datetime,
                voucher_type, voucher_no, voucher_detail_no,
                actual_qty, incoming_rate, valuation_rate,
                qty_after_transaction, stock_value, stock_value_difference
            FROM `tabStock Ledger Entry`
            WHERE item_code = %s AND warehouse = %s
            ORDER BY posting_datetime, creation
        """, (item_code, warehouse), as_dict=1)

        print(f"  Found {len(sles)} SLE entries")

        if not sles:
            continue

        # Initialize running totals for Moving Average calculation
        running_qty = 0.0
        running_value = 0.0
        current_valuation_rate = 0.0

        sle_updates = []

        for sle in sles:
            qty = flt(sle.actual_qty, 6)
            old_valuation_rate = flt(sle.valuation_rate, 6)
            old_incoming_rate = flt(sle.incoming_rate, 6)

            # Special handling for Stock Reconciliation with qty=0 (rate change only)
            if sle.voucher_type == "Stock Reconciliation" and qty == 0:
                # Get the valuation rate from Stock Reconciliation Item
                recon_rate = frappe.db.get_value(
                    "Stock Reconciliation Item",
                    {"parent": sle.voucher_no, "item_code": item_code, "warehouse": warehouse},
                    "valuation_rate"
                ) or 0

                if recon_rate > 0:
                    # Update running values to new valuation rate (round to 2 decimals)
                    current_valuation_rate = round(flt(recon_rate, 6), 2)
                    if running_qty > 0:
                        running_value = round(running_qty * current_valuation_rate, 2)

                    sle_updates.append({
                        'name': sle.name,
                        'incoming_rate': current_valuation_rate,
                        'valuation_rate': current_valuation_rate,
                        'qty_after_transaction': running_qty,
                        'stock_value': running_value,
                        'stock_value_difference': 0,
                        'old_valuation_rate': old_valuation_rate,
                        'old_incoming_rate': old_incoming_rate,
                        'voucher_type': sle.voucher_type,
                        'voucher_no': sle.voucher_no
                    })
                    continue

            if qty > 0:
                # Incoming transaction - use the incoming_rate from the transaction
                incoming_rate = flt(sle.incoming_rate, 6)

                # For Stock Reconciliation, always use the rate from reconciliation document
                if sle.voucher_type == "Stock Reconciliation":
                    recon_rate = frappe.db.get_value(
                        "Stock Reconciliation Item",
                        {"parent": sle.voucher_no, "item_code": item_code, "warehouse": warehouse},
                        "valuation_rate"
                    ) or 0
                    if recon_rate > 0:
                        incoming_rate = round(flt(recon_rate, 6), 2)

                if incoming_rate <= 0:
                    # If no incoming rate, try to get from source document
                    incoming_rate = get_incoming_rate_from_voucher(
                        sle.voucher_type, sle.voucher_no, sle.voucher_detail_no, item_code, warehouse
                    )

                if incoming_rate <= 0:
                    # Fall back to current valuation rate if still no rate
                    incoming_rate = current_valuation_rate

                # Calculate new Moving Average
                new_qty = running_qty + qty
                new_value = running_value + (qty * incoming_rate)

                # Handle transition from negative to positive stock
                # When stock was negative, use incoming_rate as the new valuation rate
                if running_qty <= 0 and new_qty > 0:
                    # Stock going from negative/zero to positive - use incoming rate
                    new_valuation_rate = incoming_rate
                elif new_qty > 0:
                    new_valuation_rate = new_value / new_qty
                else:
                    new_valuation_rate = incoming_rate

                # Round to 2 decimal places to avoid long decimals
                new_valuation_rate = round(new_valuation_rate, 2)
                incoming_rate = round(incoming_rate, 2)

                # Safety cap - valuation rate should not be much higher than incoming rate
                # This catches edge cases where formula produces unreasonably high rates
                if incoming_rate > 0 and new_valuation_rate > incoming_rate * 3:
                    new_valuation_rate = incoming_rate

                # Safety cap for valuation rate to prevent database overflow
                max_rate = 9999999999.0
                if new_valuation_rate > max_rate:
                    new_valuation_rate = incoming_rate if incoming_rate > 0 and incoming_rate < max_rate else current_valuation_rate
                elif new_valuation_rate < 0:
                    new_valuation_rate = incoming_rate if incoming_rate > 0 else current_valuation_rate

                running_qty = new_qty
                running_value = running_qty * new_valuation_rate  # Recalculate to avoid rounding drift
                current_valuation_rate = new_valuation_rate

                # Stock value difference for incoming
                stock_value_diff = round(qty * incoming_rate, 2)

                sle_updates.append({
                    'name': sle.name,
                    'incoming_rate': incoming_rate,
                    'valuation_rate': new_valuation_rate,
                    'qty_after_transaction': running_qty,
                    'stock_value': running_value,
                    'stock_value_difference': stock_value_diff,
                    'old_valuation_rate': old_valuation_rate,
                    'old_incoming_rate': old_incoming_rate,
                    'voucher_type': sle.voucher_type,
                    'voucher_no': sle.voucher_no
                })

            else:
                # Outgoing transaction - use current valuation rate
                outgoing_rate = round(current_valuation_rate, 2)

                # For outgoing, incoming_rate should equal valuation_rate (COGS)
                new_value = running_value + (qty * outgoing_rate)  # qty is negative
                new_qty = running_qty + qty

                # Handle negative stock scenario
                if new_qty < 0:
                    # Allow negative but keep valuation rate
                    new_valuation_rate = current_valuation_rate
                elif new_qty > 0:
                    new_valuation_rate = new_value / new_qty
                else:
                    new_valuation_rate = current_valuation_rate

                # Round to 2 decimal places
                new_valuation_rate = round(new_valuation_rate, 2)

                # Safety cap for valuation rate to prevent database overflow
                max_rate = 9999999999.0
                if new_valuation_rate > max_rate:
                    new_valuation_rate = current_valuation_rate
                elif new_valuation_rate < 0:
                    new_valuation_rate = current_valuation_rate

                running_qty = new_qty
                if new_qty <= 0:
                    running_value = 0
                else:
                    running_value = running_qty * new_valuation_rate

                # Stock value difference for outgoing
                stock_value_diff = round(qty * outgoing_rate, 2)  # This will be negative

                sle_updates.append({
                    'name': sle.name,
                    'incoming_rate': outgoing_rate,  # For outgoing, incoming_rate = valuation_rate at time of transaction
                    'valuation_rate': new_valuation_rate,
                    'qty_after_transaction': running_qty,
                    'stock_value': running_value,
                    'stock_value_difference': stock_value_diff,
                    'old_valuation_rate': old_valuation_rate,
                    'old_incoming_rate': old_incoming_rate,
                    'voucher_type': sle.voucher_type,
                    'voucher_no': sle.voucher_no
                })

        # Apply updates
        print(f"\n  Applying updates to {len(sle_updates)} SLE entries...")

        changes_made = 0
        for upd in sle_updates:
            # Check if values changed
            val_changed = abs(flt(upd['valuation_rate'], 4) - flt(upd['old_valuation_rate'], 4)) > 0.001
            inc_changed = abs(flt(upd['incoming_rate'], 4) - flt(upd['old_incoming_rate'], 4)) > 0.001

            if val_changed or inc_changed:
                changes_made += 1
                if not dry_run:
                    frappe.db.sql("""
                        UPDATE `tabStock Ledger Entry`
                        SET
                            incoming_rate = %s,
                            valuation_rate = %s,
                            qty_after_transaction = %s,
                            stock_value = %s,
                            stock_value_difference = %s
                        WHERE name = %s
                    """, (
                        upd['incoming_rate'],
                        upd['valuation_rate'],
                        upd['qty_after_transaction'],
                        upd['stock_value'],
                        upd['stock_value_difference'],
                        upd['name']
                    ))

        print(f"  SLE entries updated: {changes_made}")
        total_sle_updated += changes_made

        # Update Bin
        if not dry_run and sle_updates:
            last_sle = sle_updates[-1]
            bin_name = frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse})
            if bin_name:
                frappe.db.set_value("Bin", bin_name, {
                    "actual_qty": last_sle['qty_after_transaction'],
                    "valuation_rate": last_sle['valuation_rate'],
                    "stock_value": last_sle['stock_value']
                }, update_modified=False)
                print(f"  Bin updated: qty={last_sle['qty_after_transaction']}, rate={last_sle['valuation_rate']:.4f}")

    # Step 2: Update related documents
    print(f"\n[Step 2] Updating related documents...")

    # Update Delivery Note Items
    dn_updated = update_delivery_note_items(item_code, dry_run)
    print(f"  Delivery Note Items updated: {dn_updated}")

    # Update Sales Invoice Items
    si_updated = update_sales_invoice_items(item_code, dry_run)
    print(f"  Sales Invoice Items updated: {si_updated}")

    # Update Stock Entry Details
    se_updated = update_stock_entry_details(item_code, dry_run)
    print(f"  Stock Entry Details updated: {se_updated}")

    total_docs_updated = dn_updated + si_updated + se_updated

    # Step 3: Rebuild GL entries
    print(f"\n[Step 3] Rebuilding GL entries...")
    if not dry_run:
        gl_updated = rebuild_gl_entries_for_item(item_code)
        print(f"  GL entries rebuilt for {gl_updated} vouchers")
    else:
        print(f"  [DRY RUN] Would rebuild GL entries")

    # Commit changes
    if not dry_run:
        frappe.db.commit()

    # Restore accounting freeze
    if old_freeze_date and not dry_run:
        print(f"\n[Step 4] Restoring accounting freeze to: {old_freeze_date}")
        frappe.db.set_single_value("Accounts Settings", "acc_frozen_upto", old_freeze_date)
        frappe.db.commit()

    # Final summary
    print(f"\n{'='*80}")
    print(f"REBUILD COMPLETE FOR ITEM: {item_code}")
    print(f"{'='*80}")
    print(f"  SLE entries updated: {total_sle_updated}")
    print(f"  Related documents updated: {total_docs_updated}")

    # Verify final state
    final_stats = frappe.db.sql("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN valuation_rate = 0 AND actual_qty > 0 THEN 1 ELSE 0 END) as zero_val,
            SUM(CASE WHEN actual_qty < 0 AND ABS(incoming_rate - valuation_rate) > 0.01 THEN 1 ELSE 0 END) as mismatched
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s
    """, item_code, as_dict=1)[0]

    print(f"\nFinal Stats:")
    print(f"  Total SLE: {final_stats.total}")
    print(f"  Zero valuation (incoming): {final_stats.zero_val}")
    print(f"  Mismatched incoming_rate: {final_stats.mismatched}")
    print(f"{'='*80}\n")

    return {
        "sle_updated": total_sle_updated,
        "docs_updated": total_docs_updated,
        "final_stats": final_stats
    }


def get_incoming_rate_from_voucher(voucher_type, voucher_no, voucher_detail_no, item_code, warehouse):
    """Get the incoming rate from the source voucher document"""
    from frappe.utils import flt

    rate = 0

    if voucher_type == "Purchase Receipt":
        rate = frappe.db.get_value("Purchase Receipt Item", voucher_detail_no, "valuation_rate") or 0
        if not rate:
            rate = frappe.db.get_value("Purchase Receipt Item", voucher_detail_no, "rate") or 0

    elif voucher_type == "Purchase Invoice":
        rate = frappe.db.get_value("Purchase Invoice Item", voucher_detail_no, "valuation_rate") or 0
        if not rate:
            rate = frappe.db.get_value("Purchase Invoice Item", voucher_detail_no, "rate") or 0

    elif voucher_type == "Stock Entry":
        rate = frappe.db.get_value("Stock Entry Detail", voucher_detail_no, "valuation_rate") or 0
        if not rate:
            rate = frappe.db.get_value("Stock Entry Detail", voucher_detail_no, "basic_rate") or 0

    elif voucher_type == "Stock Reconciliation":
        rate = frappe.db.get_value("Stock Reconciliation Item", voucher_detail_no, "valuation_rate") or 0

    return flt(rate, 6)


def update_delivery_note_items(item_code, dry_run=False):
    """Update incoming_rate on Delivery Note Items to match SLE valuation_rate"""
    from frappe.utils import flt

    # Get all DN items with their SLE valuation rates
    dn_items = frappe.db.sql("""
        SELECT
            dni.name, dni.parent, dni.incoming_rate as current_rate,
            sle.valuation_rate as correct_rate, sle.incoming_rate as sle_incoming
        FROM `tabDelivery Note Item` dni
        JOIN `tabDelivery Note` dn ON dn.name = dni.parent
        JOIN `tabStock Ledger Entry` sle ON
            sle.voucher_type = 'Delivery Note'
            AND sle.voucher_no = dni.parent
            AND sle.voucher_detail_no = dni.name
        WHERE dni.item_code = %s
        AND dn.docstatus = 1
        AND ABS(dni.incoming_rate - sle.incoming_rate) > 0.01
    """, item_code, as_dict=1)

    updated = 0
    for item in dn_items:
        if not dry_run:
            frappe.db.set_value("Delivery Note Item", item.name,
                               "incoming_rate", item.sle_incoming, update_modified=False)
        updated += 1

    return updated


def update_sales_invoice_items(item_code, dry_run=False):
    """Update incoming_rate on Sales Invoice Items"""
    from frappe.utils import flt

    si_items = frappe.db.sql("""
        SELECT
            sii.name, sii.parent, sii.incoming_rate as current_rate,
            sle.incoming_rate as correct_rate
        FROM `tabSales Invoice Item` sii
        JOIN `tabSales Invoice` si ON si.name = sii.parent
        JOIN `tabStock Ledger Entry` sle ON
            sle.voucher_type = 'Sales Invoice'
            AND sle.voucher_no = sii.parent
            AND sle.voucher_detail_no = sii.name
        WHERE sii.item_code = %s
        AND si.docstatus = 1
        AND si.update_stock = 1
        AND ABS(sii.incoming_rate - sle.incoming_rate) > 0.01
    """, item_code, as_dict=1)

    updated = 0
    for item in si_items:
        if not dry_run:
            frappe.db.set_value("Sales Invoice Item", item.name,
                               "incoming_rate", item.correct_rate, update_modified=False)
        updated += 1

    return updated


def update_stock_entry_details(item_code, dry_run=False):
    """Update valuation_rate on Stock Entry Details"""
    from frappe.utils import flt

    se_items = frappe.db.sql("""
        SELECT
            sed.name, sed.parent, sed.valuation_rate as current_rate,
            sle.valuation_rate as correct_rate
        FROM `tabStock Entry Detail` sed
        JOIN `tabStock Entry` se ON se.name = sed.parent
        JOIN `tabStock Ledger Entry` sle ON
            sle.voucher_type = 'Stock Entry'
            AND sle.voucher_no = sed.parent
            AND sle.voucher_detail_no = sed.name
        WHERE sed.item_code = %s
        AND se.docstatus = 1
        AND ABS(sed.valuation_rate - sle.valuation_rate) > 0.01
    """, item_code, as_dict=1)

    updated = 0
    for item in se_items:
        if not dry_run:
            frappe.db.set_value("Stock Entry Detail", item.name,
                               "valuation_rate", item.correct_rate, update_modified=False)
        updated += 1

    return updated


def rebuild_gl_entries_for_item(item_code):
    """Rebuild GL entries for all vouchers related to this item"""
    from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost_gl_entries

    # Get all vouchers for this item
    vouchers = frappe.db.sql("""
        SELECT DISTINCT voucher_type, voucher_no
        FROM `tabStock Ledger Entry`
        WHERE item_code = %s
        ORDER BY posting_datetime
    """, item_code, as_dict=1)

    # Build set of affected transactions
    affected = set()
    for v in vouchers:
        affected.add((v.voucher_type, v.voucher_no))

    if affected:
        try:
            repost_gl_entries(list(affected))
            return len(affected)
        except Exception as e:
            print(f"  Warning: GL repost failed: {e}")
            return 0

    return 0


def rebuild_all_items_valuation(dry_run=False, batch_size=50):
    """
    Rebuild Moving Average valuation for ALL items.

    Usage:
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.rebuild_all_items_valuation
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.rebuild_all_items_valuation --args "[True]"  # Dry run
    """
    print(f"\n{'='*80}")
    print("REBUILD MOVING AVERAGE VALUATION FOR ALL ITEMS")
    print(f"Dry Run: {dry_run}")
    print(f"{'='*80}")

    # Get all distinct items
    items = frappe.db.sql_list("""
        SELECT DISTINCT item_code
        FROM `tabStock Ledger Entry`
        ORDER BY item_code
    """)

    print(f"\nTotal items to process: {len(items)}")

    total_sle = 0
    total_docs = 0
    errors = []

    for i, item_code in enumerate(items, 1):
        print(f"\n[{i}/{len(items)}] Processing {item_code}...")

        try:
            result = rebuild_item_valuation(item_code, dry_run)
            total_sle += result.get("sle_updated", 0)
            total_docs += result.get("docs_updated", 0)
        except Exception as e:
            print(f"  ERROR: {e}")
            errors.append({"item": item_code, "error": str(e)})
            frappe.db.rollback()

        # Commit every batch
        if not dry_run and i % batch_size == 0:
            frappe.db.commit()
            print(f"\n--- Committed batch {i}/{len(items)} ---")

    if not dry_run:
        frappe.db.commit()

    # Final summary
    print(f"\n{'='*80}")
    print("FINAL SUMMARY")
    print(f"{'='*80}")
    print(f"Total items processed: {len(items)}")
    print(f"Total SLE updated: {total_sle}")
    print(f"Total documents updated: {total_docs}")
    print(f"Errors: {len(errors)}")

    if errors:
        print("\nErrors:")
        for e in errors[:20]:
            print(f"  - {e['item']}: {e['error']}")

    return {"items": len(items), "sle_updated": total_sle, "docs_updated": total_docs, "errors": errors}


def fix_zero_valuation_items():
    """
    Fix items that have zero valuation because source documents have zero rate.
    This function:
    1. Finds items with zero valuation on incoming transactions
    2. Looks for any valid purchase rate for the item
    3. Updates the source documents and SLE with the valid rate
    4. Rebuilds valuation for those items

    Usage:
        bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.fix_zero_valuation_items
    """
    from frappe.utils import flt

    print(f"\n{'='*80}")
    print("FIX ZERO VALUATION ITEMS")
    print(f"{'='*80}")

    # Find items with zero valuation on incoming transactions
    zero_val_items = frappe.db.sql("""
        SELECT DISTINCT item_code
        FROM `tabStock Ledger Entry`
        WHERE valuation_rate = 0
        AND actual_qty > 0
        AND is_cancelled = 0
    """, as_list=1)

    zero_val_items = [x[0] for x in zero_val_items]
    print(f"\nFound {len(zero_val_items)} items with zero valuation incoming entries")

    fixed = 0
    for item_code in zero_val_items:
        print(f"\n{'='*60}")
        print(f"Processing: {item_code}")
        print(f"{'='*60}")

        # Try to find a valid purchase rate for this item
        valid_rate = frappe.db.sql("""
            SELECT rate FROM (
                SELECT pri.rate
                FROM `tabPurchase Receipt Item` pri
                JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
                WHERE pri.item_code = %s AND pr.docstatus = 1 AND pri.rate > 0
                UNION ALL
                SELECT pii.rate
                FROM `tabPurchase Invoice Item` pii
                JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
                WHERE pii.item_code = %s AND pi.docstatus = 1 AND pii.rate > 0
                UNION ALL
                SELECT sed.basic_rate as rate
                FROM `tabStock Entry Detail` sed
                JOIN `tabStock Entry` se ON se.name = sed.parent
                WHERE sed.item_code = %s AND se.docstatus = 1 AND sed.basic_rate > 0
                UNION ALL
                SELECT sri.valuation_rate as rate
                FROM `tabStock Reconciliation Item` sri
                JOIN `tabStock Reconciliation` sr ON sr.name = sri.parent
                WHERE sri.item_code = %s AND sr.docstatus = 1 AND sri.valuation_rate > 0
            ) rates
            ORDER BY rate DESC
            LIMIT 1
        """, (item_code, item_code, item_code, item_code))

        if not valid_rate or not valid_rate[0][0]:
            print(f"  WARNING: No valid rate found for {item_code}. Skipping.")
            continue

        rate = flt(valid_rate[0][0], 6)
        print(f"  Found valid rate: {rate}")

        # Find and update zero-rate source documents
        # Update Purchase Receipt Items
        pr_updated = frappe.db.sql("""
            UPDATE `tabPurchase Receipt Item` pri
            JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
            SET pri.rate = %s, pri.valuation_rate = %s, pri.amount = pri.qty * %s
            WHERE pri.item_code = %s
            AND pr.docstatus = 1
            AND pri.rate = 0
        """, (rate, rate, rate, item_code))
        pr_count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
        print(f"  Purchase Receipt Items updated: {pr_count}")

        # Update Purchase Invoice Items
        pi_updated = frappe.db.sql("""
            UPDATE `tabPurchase Invoice Item` pii
            JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
            SET pii.rate = %s, pii.valuation_rate = %s, pii.amount = pii.qty * %s
            WHERE pii.item_code = %s
            AND pi.docstatus = 1
            AND pii.rate = 0
        """, (rate, rate, rate, item_code))
        pi_count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
        print(f"  Purchase Invoice Items updated: {pi_count}")

        # Update Stock Entry Details
        se_updated = frappe.db.sql("""
            UPDATE `tabStock Entry Detail` sed
            JOIN `tabStock Entry` se ON se.name = sed.parent
            SET sed.basic_rate = %s, sed.valuation_rate = %s, sed.amount = sed.qty * %s
            WHERE sed.item_code = %s
            AND se.docstatus = 1
            AND sed.basic_rate = 0
            AND sed.t_warehouse IS NOT NULL
        """, (rate, rate, rate, item_code))
        se_count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
        print(f"  Stock Entry Details updated: {se_count}")

        # Update zero-rate SLE entries directly
        sle_updated = frappe.db.sql("""
            UPDATE `tabStock Ledger Entry`
            SET incoming_rate = %s
            WHERE item_code = %s
            AND actual_qty > 0
            AND incoming_rate = 0
            AND is_cancelled = 0
        """, (rate, item_code))
        sle_count = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
        print(f"  SLE incoming_rate updated: {sle_count}")

        frappe.db.commit()

        # Now rebuild valuation for this item
        print(f"\n  Rebuilding valuation...")
        try:
            rebuild_item_valuation(item_code, dry_run=False)
            fixed += 1
        except Exception as e:
            print(f"  ERROR rebuilding: {e}")
            frappe.db.rollback()

    frappe.db.commit()

    print(f"\n{'='*80}")
    print(f"COMPLETE: Fixed {fixed}/{len(zero_val_items)} items with zero valuation")
    print(f"{'='*80}\n")

    # Verify final state
    remaining = frappe.db.sql("""
        SELECT COUNT(DISTINCT item_code)
        FROM `tabStock Ledger Entry`
        WHERE valuation_rate = 0
        AND actual_qty > 0
        AND is_cancelled = 0
    """)[0][0]

    print(f"Remaining items with zero valuation: {remaining}")

    return {"fixed": fixed, "remaining": remaining}


if __name__ == "__main__":
    import sys

    print("""
Stock Valuation Correction Script
=================================

RECOMMENDED - Complete Fix Functions:
-------------------------------------
    1. Fix single item (COMPLETE - all warehouses):
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.fix_item_complete --args "['ITEM_CODE']"

    2. Fix ALL items (COMPLETE):
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.fix_all_items_complete

    3. Check which items need fixing:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.get_items_needing_fix

Legacy Functions:
-----------------
    4. Correct single item (specific warehouse):
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['ITEM_CODE', 'WAREHOUSE', 'FROM_DATE', dry_run]"

    5. Correct all items in warehouse:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_warehouse_valuation --args "['WAREHOUSE', 'FROM_DATE', dry_run]"

    6. Correct all items:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.correct_all_valuation --args "['FROM_DATE', dry_run]"

    7. Process repost entries:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.process_repost_entries

    8. Check status:
       bench --site [sitename] execute expenses_management.scripts.recorrect_stock_valuation.check_valuation_status --args "['ITEM_CODE', 'WAREHOUSE']"

Examples:
=========
    # Fix item 20001 completely (all warehouses)
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.fix_item_complete --args "['20001']"

    # Fix ALL items in the system
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.fix_all_items_complete

    # Check which items need fixing first
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.get_items_needing_fix

    # Dry run for item 20001 (legacy)
    bench --site almouhana.local execute expenses_management.scripts.recorrect_stock_valuation.correct_item_valuation --args "['20001', 'مستودع الصناعية  - م', '2025-05-01', True]"
""")
