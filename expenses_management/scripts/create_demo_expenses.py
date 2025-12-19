#!/usr/bin/env python3
"""
Demo Script to Generate Random Expense Entries for Testing
"""

import frappe
from frappe.utils import today, add_days, random_string, flt
import random
from datetime import datetime, timedelta


def get_or_create_expense_types(company):
    """Get existing expense types or create demo ones"""
    expense_types = frappe.db.get_all("Expense Type", filters={"company": company}, pluck="name")

    if len(expense_types) < 5:
        # Get a default expense account for the company
        default_expense_account = frappe.db.get_value(
            "Account",
            {
                "company": company,
                "account_type": "Expense",
                "is_group": 0
            },
            "name"
        )

        if not default_expense_account:
            # Try to get any expense account
            default_expense_account = frappe.db.sql("""
                SELECT name FROM `tabAccount`
                WHERE company = %s
                AND account_name LIKE '%%expense%%'
                AND is_group = 0
                LIMIT 1
            """, (company,))

            if default_expense_account:
                default_expense_account = default_expense_account[0][0]

        if not default_expense_account:
            print(f"✗ No expense account found for company {company}")
            return expense_types

        # Create demo expense types
        demo_types = [
            {"name": "Travel", "description": "Travel and transportation expenses"},
            {"name": "Office Supplies", "description": "Office supplies and equipment"},
            {"name": "Utilities", "description": "Electricity, water, internet"},
            {"name": "Rent", "description": "Office and warehouse rent"},
            {"name": "Salaries", "description": "Employee salaries and wages"},
            {"name": "Marketing", "description": "Marketing and advertising costs"},
            {"name": "Maintenance", "description": "Equipment and facility maintenance"},
            {"name": "Insurance", "description": "Insurance premiums"},
            {"name": "Training", "description": "Employee training and development"},
            {"name": "Meals", "description": "Business meals and entertainment"}
        ]

        for exp_type in demo_types:
            expense_type_id = f"{exp_type['name']}-{company}"
            if not frappe.db.exists("Expense Type", expense_type_id):
                try:
                    doc = frappe.get_doc({
                        "doctype": "Expense Type",
                        "expense_type_name": exp_type["name"],
                        "company": company,
                        "description": exp_type["description"],
                        "expense_account": default_expense_account
                    })
                    doc.insert(ignore_permissions=True)
                    frappe.db.commit()
                    print(f"✓ Created expense type: {exp_type['name']}")
                except Exception as e:
                    print(f"✗ Error creating expense type {exp_type['name']}: {str(e)}")

        expense_types = frappe.db.get_all("Expense Type", filters={"company": company}, pluck="name")

    return expense_types


def get_or_create_cost_centers(company):
    """Get existing cost centers or return company default"""
    cost_centers = frappe.db.get_all(
        "Cost Center",
        filters={"company": company, "is_group": 0},
        pluck="name"
    )

    if not cost_centers:
        # Get default cost center for company
        default_cc = frappe.db.get_value("Company", company, "cost_center")
        if default_cc:
            cost_centers = [default_cc]

    return cost_centers


def get_mode_of_payment(company):
    """Get a mode of payment with configured account"""
    # Try to find Cash mode first (most common)
    cash_mode = frappe.db.get_value("Mode of Payment", {"mode_of_payment": "Cash"}, "name")
    if cash_mode:
        return cash_mode

    # Try to find any mode with accounts configured
    modes_with_accounts = frappe.db.sql("""
        SELECT DISTINCT mop.name
        FROM `tabMode of Payment` mop
        INNER JOIN `tabMode of Payment Account` mopa ON mopa.parent = mop.name
        WHERE mopa.company = %s
        LIMIT 1
    """, (company,))

    if modes_with_accounts:
        return modes_with_accounts[0][0]

    # Fallback: get any mode
    modes = frappe.db.get_all("Mode of Payment", limit=1, pluck="name")
    return modes[0] if modes else None


def get_tax_template(company):
    """Get a tax template for the company"""
    templates = frappe.db.get_all(
        "Purchase Taxes and Charges Template",
        filters={"company": company},
        limit=1,
        pluck="name"
    )
    return templates[0] if templates else None


def create_random_expense(company, expense_types, cost_centers, mode_of_payment, tax_template=None, posting_date=None):
    """Create a random expense entry"""

    if not posting_date:
        # Random date in last 90 days
        days_ago = random.randint(0, 90)
        posting_date = add_days(today(), -days_ago)

    # Select random cost center
    cost_center = random.choice(cost_centers) if cost_centers else None

    # Create expense entry
    try:
        expense = frappe.get_doc({
            "doctype": "Expense Entry",
            "naming_series": "EXP-ENTRY-.YYYY.-",
            "company": company,
            "posting_date": posting_date,
            "cost_center": cost_center,
            "mode_of_payment": mode_of_payment,
            "remarks": f"Demo expense entry - {random_string(6)}"
        })

        # Add 1-5 random expense items
        num_items = random.randint(1, 5)
        for i in range(num_items):
            expense_type = random.choice(expense_types)

            # Skip if expense type is None or empty
            if not expense_type:
                continue

            # Get expense account from expense type
            expense_account = frappe.db.get_value("Expense Type", expense_type, "expense_account")
            if not expense_account:
                continue

            amount = round(random.uniform(100, 10000), 2)

            # 50% chance to be taxable
            is_taxable = random.choice([0, 1])

            item_data = {
                "expense_type": expense_type,
                "expense_account": expense_account,
                "amount": amount,
                "taxable": is_taxable
            }

            # Add tax template if taxable and template exists
            if is_taxable and tax_template:
                item_data["tax_template"] = tax_template

            expense.append("expense_items", item_data)

        # Make sure we have at least one item
        if len(expense.expense_items) == 0:
            raise Exception("No valid expense items")

        expense.insert(ignore_permissions=True)
        expense.submit()
        frappe.db.commit()

        return expense.name

    except Exception as e:
        frappe.db.rollback()
        raise e


def create_bulk_expenses(company=None, count=50, date_range_days=90):
    """
    Create bulk expense entries for testing

    Args:
        company: Company name (if None, will use first available company)
        count: Number of expense entries to create
        date_range_days: Spread expenses over this many days
    """

    frappe.init(site="mh.localhost")
    frappe.connect()

    try:
        # Get company
        if not company:
            companies = frappe.db.get_all("Company", pluck="name")
            if not companies:
                print("✗ No companies found. Please create a company first.")
                return
            company = companies[0]

        print(f"\n{'='*60}")
        print(f"Creating {count} Demo Expense Entries")
        print(f"{'='*60}")
        print(f"Company: {company}")
        print(f"Date Range: Last {date_range_days} days")
        print(f"{'='*60}\n")

        # Get or create expense types
        print("Setting up expense types...")
        expense_types = get_or_create_expense_types(company)
        print(f"✓ Found {len(expense_types)} expense types")
        if expense_types:
            print(f"   Expense types: {expense_types[:5]}")

        # Get cost centers
        print("Getting cost centers...")
        cost_centers = get_or_create_cost_centers(company)
        print(f"✓ Found {len(cost_centers)} cost centers\n")

        # Get or create mode of payment
        print("Getting mode of payment...")
        mode_of_payment = get_mode_of_payment(company)
        if mode_of_payment:
            print(f"✓ Using mode of payment: {mode_of_payment}\n")
        else:
            print("✗ No mode of payment available.\n")

        # Get tax template
        print("Getting tax template...")
        tax_template = get_tax_template(company)
        if tax_template:
            print(f"✓ Using tax template: {tax_template}\n")
        else:
            print("✓ No tax template found (optional)\n")

        if not expense_types:
            print("✗ No expense types available. Cannot create expenses.")
            return

        if not mode_of_payment:
            print("✗ No mode of payment available. Cannot create expenses.")
            return

        # Create expenses
        print(f"Creating {count} expense entries...\n")
        created = 0
        failed = 0

        for i in range(count):
            try:
                # Random date within range
                days_ago = random.randint(0, date_range_days)
                posting_date = add_days(today(), -days_ago)

                expense_name = create_random_expense(
                    company=company,
                    expense_types=expense_types,
                    cost_centers=cost_centers,
                    mode_of_payment=mode_of_payment,
                    tax_template=tax_template,
                    posting_date=posting_date
                )

                created += 1

                # Progress indicator
                if (i + 1) % 10 == 0:
                    print(f"✓ Created {i + 1}/{count} expense entries...")
                elif i < 3:
                    print(f"✓ Created: {expense_name}")

            except Exception as e:
                failed += 1
                import traceback
                if failed <= 2:
                    print(f"✗ Error creating expense {i + 1}:")
                    traceback.print_exc()
                else:
                    print(f"✗ Error creating expense {i + 1}: {str(e)}")

        print(f"\n{'='*60}")
        print(f"Summary")
        print(f"{'='*60}")
        print(f"✓ Successfully created: {created} expense entries")
        if failed > 0:
            print(f"✗ Failed: {failed} expense entries")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\n✗ Fatal error: {str(e)}")
        import traceback
        traceback.print_exc()

    finally:
        frappe.db.commit()
        frappe.destroy()


def create_expenses_for_multiple_companies(count_per_company=30):
    """Create expense entries for all companies"""

    frappe.init(site="mh.localhost")
    frappe.connect()

    try:
        companies = frappe.db.get_all("Company", pluck="name")

        if not companies:
            print("✗ No companies found.")
            return

        print(f"\n{'='*60}")
        print(f"Creating Expenses for Multiple Companies")
        print(f"{'='*60}")
        print(f"Companies: {len(companies)}")
        print(f"Entries per company: {count_per_company}")
        print(f"{'='*60}\n")

        for company in companies:
            print(f"\n>>> Processing company: {company}")
            create_bulk_expenses(company=company, count=count_per_company, date_range_days=90)

        print(f"\n{'='*60}")
        print("All companies processed!")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        import traceback
        traceback.print_exc()

    finally:
        frappe.destroy()


if __name__ == "__main__":
    import sys

    # Parse command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "all":
            # Create for all companies
            count = int(sys.argv[2]) if len(sys.argv) > 2 else 30
            create_expenses_for_multiple_companies(count_per_company=count)
        else:
            # Create for specific company
            company = sys.argv[1]
            count = int(sys.argv[2]) if len(sys.argv) > 2 else 50
            create_bulk_expenses(company=company, count=count)
    else:
        # Default: create for first company
        create_bulk_expenses(count=50)
