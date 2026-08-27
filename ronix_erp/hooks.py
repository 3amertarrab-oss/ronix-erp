app_name = "ronix_erp"
app_title = "RONIX ERP"
app_publisher = "Eng. Amer Tarrab - RONIX STEEL"
app_description = "Controlled contracts, claims, projects, and commercial workflows for RONIX STEEL"
app_email = "3amertarrab@gmail.com"
app_license = "MIT"
app_version = "0.3.0"

required_apps = ["erpnext"]

after_install = "ronix_erp.install.after_install"
after_migrate = "ronix_erp.install.after_migrate"

doctype_js = {
    "Quotation": "public/js/quotation.js",
    "Sales Invoice": "public/js/sales_invoice.js",
}

doc_events = {
    "Quotation": {
        "validate": "ronix_erp.events.quotation.validate_quotation",
    },
    "Project": {
        "validate": "ronix_erp.events.project.validate_project",
        "after_insert": "ronix_erp.events.project.after_insert_project",
    },
    "Sales Invoice": {
        "validate": "ronix_erp.events.sales_invoice.validate_sales_invoice",
        "before_submit": "ronix_erp.events.sales_invoice.before_submit_sales_invoice",
        "on_submit": "ronix_erp.events.sales_invoice.on_submit_sales_invoice",
        "on_cancel": "ronix_erp.events.sales_invoice.on_cancel_sales_invoice",
    },
    "Payment Entry": {
        "validate": "ronix_erp.events.payment_entry.validate_payment_entry",
        "on_submit": "ronix_erp.events.payment_entry.on_submit_payment_entry",
        "on_cancel": "ronix_erp.events.payment_entry.on_cancel_payment_entry",
    },
}
