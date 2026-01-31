app_name = "expenses_management"
app_title = "Expenses Management"
app_publisher = "Administrator"
app_description = "Expenses management application"
app_email = "admin@example.com"
app_license = "mit"

# Fixtures - Export all custom fields and print formats
fixtures = [
    {
        "dt": "Custom Field",
        "filters": [
            ["fieldname", "like", "custom_%"]
        ]
    },
    {
        "dt": "Property Setter",
        "filters": [
            ["property_type", "in", ["options", "default", "read_only", "hidden", "reqd"]]
        ]
    },
    {
        "dt": "Print Format",
        "filters": [
            ["name", "like", "%Almouhana%"]
        ]
    }
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "expenses_management",
# 		"logo": "/assets/expenses_management/logo.png",
# 		"title": "Expenses Management",
# 		"route": "/expenses_management",
# 		"has_permission": "expenses_management.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/expenses_management/css/expenses_management.css"
app_include_js = [
    "/assets/expenses_management/js/erpnext_fix.js",
    "/assets/expenses_management/js/workflow_approvals.js",
    "/assets/expenses_management/js/assignments_mentions.js",
    "/assets/expenses_management/js/attachment_guard.js",
]

# include js, css files in header of web template
# web_include_css = "/assets/expenses_management/css/expenses_management.css"
# web_include_js = "/assets/expenses_management/js/expenses_management.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "expenses_management/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
    "Sales Invoice": "public/js/sales_invoice.js",
    "Customer": "public/js/customer_ledger.js"
}

# doctype_js handles Customer and Sales Invoice JS injection
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "expenses_management/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "expenses_management.utils.jinja_methods",
# 	"filters": "expenses_management.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "expenses_management.install.before_install"
# after_install = "expenses_management.install.after_install"

after_migrate = [
    "expenses_management.overrides.loan_application.backfill_applicant_names",
]

# Uninstallation
# ------------

# before_uninstall = "expenses_management.uninstall.before_uninstall"
# after_uninstall = "expenses_management.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "expenses_management.utils.before_app_install"
# after_app_install = "expenses_management.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "expenses_management.utils.before_app_uninstall"
# after_app_uninstall = "expenses_management.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "expenses_management.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {
	"Salary Slip": "expenses_management.overrides.salary_slip.CustomSalarySlip",
	"Leave Encashment": "expenses_management.overrides.leave_encashment.CustomLeaveEncashment"
}

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

doc_events = {
    "Loan Application": {
        "validate": "expenses_management.overrides.loan_application.set_applicant_name",
    },
    "File": {
        "before_insert": "expenses_management.overrides.attachment_guard.block_attachment_on_submitted",
        "on_trash": "expenses_management.overrides.attachment_guard.block_remove_attachment_on_submitted",
    },
    "Sales Invoice": {
        "validate": [
            "expenses_management.expenses_management.sales_invoice.sales_invoice.update_available_qty_on_validate",
            "expenses_management.expenses_management.sales_invoice.sales_invoice.validate_customer_credit",
            "expenses_management.expenses_management.sales_invoice.sales_invoice.validate_item_rate_limits",
        ],
        "before_submit": [
            "expenses_management.expenses_management.sales_invoice.sales_invoice.validate_available_qty",
            "expenses_management.expenses_management.stock_reservation.reservation_handler.sales_invoice_before_submit",
        ],
        "on_submit": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.sales_invoice_on_submit",
        ],
        "on_cancel": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.sales_invoice_on_cancel",
        ],
    },
    "Delivery Note": {
        "on_submit": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.delivery_note_on_submit",
        ],
        "on_cancel": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.delivery_note_on_cancel",
        ],
    },
    "Stock Entry": {
        "validate": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.stock_entry_validate",
        ],
        "on_save": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.stock_entry_on_save",
        ],
        "on_submit": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.stock_entry_on_submit",
        ],
        "on_cancel": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.stock_entry_on_cancel",
        ],
        "on_trash": [
            "expenses_management.expenses_management.stock_reservation.reservation_handler.stock_entry_on_trash",
        ],
    },
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"expenses_management.tasks.all"
# 	],
# 	"daily": [
# 		"expenses_management.tasks.daily"
# 	],
# 	"hourly": [
# 		"expenses_management.tasks.hourly"
# 	],
# 	"weekly": [
# 		"expenses_management.tasks.weekly"
# 	],
# 	"monthly": [
# 		"expenses_management.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "expenses_management.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "expenses_management.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "expenses_management.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["expenses_management.utils.before_request"]
# after_request = ["expenses_management.utils.after_request"]

# Apply HRMS leave fixes on each request
before_request = ["expenses_management.overrides.leave_fixes.apply_leave_fixes"]

# Job Events
# ----------
# before_job = ["expenses_management.utils.before_job"]
# after_job = ["expenses_management.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"expenses_management.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

