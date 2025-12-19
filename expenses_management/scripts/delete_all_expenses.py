#!/usr/bin/env python3
"""
Delete all expense entries from the system
"""

import frappe


def delete_all_expenses():
	"""Delete all expense entries and their journal entries"""
	frappe.init(site='mh.localhost')
	frappe.connect()

	try:
		print("="*60)
		print("Deleting All Expense Entries")
		print("="*60)

		# Get all expense entries
		expense_entries = frappe.db.get_all("Expense Entry", pluck="name")
		total = len(expense_entries)

		if total == 0:
			print("No expense entries found.")
			return

		print(f"\nFound {total} expense entries to delete...\n")

		deleted = 0
		failed = 0

		for idx, expense_name in enumerate(expense_entries, 1):
			try:
				expense = frappe.get_doc("Expense Entry", expense_name)

				# Cancel if submitted
				if expense.docstatus == 1:
					expense.flags.ignore_permissions = True
					expense.cancel()

				# Delete the document
				frappe.delete_doc("Expense Entry", expense_name, force=1, ignore_permissions=True)
				deleted += 1

				if idx % 10 == 0:
					print(f"✓ Deleted {idx}/{total} expense entries...")
					frappe.db.commit()

			except Exception as e:
				failed += 1
				if failed <= 3:
					print(f"✗ Error deleting {expense_name}: {str(e)}")

		frappe.db.commit()

		print(f"\n{'='*60}")
		print("Summary")
		print(f"{'='*60}")
		print(f"✓ Successfully deleted: {deleted} expense entries")
		if failed > 0:
			print(f"✗ Failed to delete: {failed} expense entries")
		print(f"{'='*60}\n")

	finally:
		frappe.destroy()


if __name__ == "__main__":
	delete_all_expenses()
