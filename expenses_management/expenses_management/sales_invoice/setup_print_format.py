import frappe
import os


def setup_sales_invoice_print_format():
    """Create Sales Invoice Print Format"""

    # Read the HTML template
    html_path = os.path.join(
        os.path.dirname(__file__), "sales_invoice_print_format.html"
    )

    with open(html_path, "r") as f:
        html_content = f.read()

    # Check if print format exists
    if frappe.db.exists("Print Format", "Sales Invoice - Almouhana"):
        print("Updating existing print format...")
        pf = frappe.get_doc("Print Format", "Sales Invoice - Almouhana")
        pf.html = html_content
        pf.save()
    else:
        print("Creating new print format...")
        pf = frappe.get_doc(
            {
                "doctype": "Print Format",
                "name": "Sales Invoice - Almouhana",
                "doc_type": "Sales Invoice",
                "module": "Expenses Management",
                "standard": "No",
                "custom_format": 1,
                "print_format_type": "Jinja",
                "html": html_content,
                "disabled": 0,
            }
        )
        pf.insert()

    frappe.db.commit()
    print("Print format 'Sales Invoice - Almouhana' created/updated successfully!")


def setup_cutting_service_print_format():
    """Create Sales Invoice Print Format with Cutting Service"""

    # Read the HTML template
    html_path = os.path.join(
        os.path.dirname(__file__), "sales_invoice_cutting_service_print_format.html"
    )

    with open(html_path, "r") as f:
        html_content = f.read()

    # Check if print format exists
    if frappe.db.exists("Print Format", "Sales Invoice - Almouhana Cutting Service"):
        print("Updating existing cutting service print format...")
        pf = frappe.get_doc("Print Format", "Sales Invoice - Almouhana Cutting Service")
        pf.html = html_content
        pf.save()
    else:
        print("Creating new cutting service print format...")
        pf = frappe.get_doc(
            {
                "doctype": "Print Format",
                "name": "Sales Invoice - Almouhana Cutting Service",
                "doc_type": "Sales Invoice",
                "module": "Expenses Management",
                "standard": "No",
                "custom_format": 1,
                "print_format_type": "Jinja",
                "html": html_content,
                "disabled": 0,
            }
        )
        pf.insert()

    frappe.db.commit()
    print("Print format 'Sales Invoice - Almouhana Cutting Service' created/updated successfully!")


def setup_all_print_formats():
    """Create all Sales Invoice Print Formats"""
    setup_sales_invoice_print_format()
    setup_cutting_service_print_format()


if __name__ == "__main__":
    setup_all_print_formats()
