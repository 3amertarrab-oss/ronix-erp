import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


CUSTOM_FIELDS = {
    "Customer": [
        {
            "fieldname": "ronix_legacy_section",
            "label": "RONIX Migration Identity",
            "fieldtype": "Section Break",
            "insert_after": "disabled",
            "hidden": 1,
        },
        {
            "fieldname": "ronix_legacy_id",
            "label": "RONIX Legacy ID",
            "fieldtype": "Data",
            "unique": 1,
            "read_only": 1,
            "no_copy": 1,
            "hidden": 1,
            "insert_after": "ronix_legacy_section",
        },
        {
            "fieldname": "ronix_legacy_code",
            "label": "RONIX Legacy Code",
            "fieldtype": "Data",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_legacy_id",
        },
    ],
    "Quotation": [
        {
            "fieldname": "ronix_section",
            "label": "RONIX Integration",
            "fieldtype": "Section Break",
            "insert_after": "terms",
        },
        {
            "fieldname": "ronix_revision",
            "label": "RONIX Revision",
            "fieldtype": "Int",
            "default": "1",
            "insert_after": "ronix_section",
        },
        {
            "fieldname": "ronix_approved_for_contract",
            "label": "Approved for Contract",
            "fieldtype": "Check",
            "read_only": 1,
            "insert_after": "ronix_revision",
        },
        {
            "fieldname": "ronix_contract",
            "label": "RONIX Contract",
            "fieldtype": "Link",
            "options": "RONIX Contract",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_approved_for_contract",
        },
        {
            "fieldname": "ronix_project",
            "label": "Project",
            "fieldtype": "Link",
            "options": "Project",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_contract",
        },
    ],
    "Project": [
        {
            "fieldname": "ronix_section",
            "label": "RONIX Commercial Source",
            "fieldtype": "Section Break",
            "insert_after": "customer",
        },
        {
            "fieldname": "ronix_contract",
            "label": "RONIX Contract",
            "fieldtype": "Link",
            "options": "RONIX Contract",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_section",
        },
        {
            "fieldname": "ronix_quotation",
            "label": "Quotation",
            "fieldtype": "Link",
            "options": "Quotation",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_contract",
        },
        {
            "fieldname": "ronix_cost_center",
            "label": "Project Cost Center",
            "fieldtype": "Link",
            "options": "Cost Center",
            "insert_after": "ronix_quotation",
        },
        {
            "fieldname": "ronix_legacy_id",
            "label": "RONIX Legacy ID",
            "fieldtype": "Data",
            "unique": 1,
            "read_only": 1,
            "no_copy": 1,
            "hidden": 1,
            "insert_after": "ronix_cost_center",
        },
        {
            "fieldname": "ronix_legacy_code",
            "label": "RONIX Legacy Code",
            "fieldtype": "Data",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_legacy_id",
        },
    ],
    "Sales Invoice": [
        {
            "fieldname": "ronix_section",
            "label": "RONIX Claim Source",
            "fieldtype": "Section Break",
            "insert_after": "project",
        },
        {
            "fieldname": "ronix_claim",
            "label": "RONIX Claim",
            "fieldtype": "Link",
            "options": "RONIX Claim",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_section",
        },
        {
            "fieldname": "ronix_contract",
            "label": "RONIX Contract",
            "fieldtype": "Link",
            "options": "RONIX Contract",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_claim",
        },
        {
            "fieldname": "ronix_payment_milestone",
            "label": "Payment Milestone",
            "fieldtype": "Data",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_contract",
        },
    ],
    "Sales Invoice Item": [
        {
            "fieldname": "ronix_claim_item",
            "label": "RONIX Claim Item",
            "fieldtype": "Data",
            "read_only": 1,
            "no_copy": 1,
            "hidden": 1,
            "insert_after": "sales_order_item",
        },
    ],
    "Payment Entry": [
        {
            "fieldname": "ronix_section",
            "label": "RONIX Collection Source",
            "fieldtype": "Section Break",
            "insert_after": "project",
        },
        {
            "fieldname": "ronix_claim",
            "label": "RONIX Claim",
            "fieldtype": "Link",
            "options": "RONIX Claim",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_section",
        },
        {
            "fieldname": "ronix_sales_invoice",
            "label": "RONIX Sales Invoice",
            "fieldtype": "Link",
            "options": "Sales Invoice",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_claim",
        },
    ],
}


def after_install():
    create_or_update_custom_fields()


def after_migrate():
    create_or_update_custom_fields()


def create_or_update_custom_fields():
    create_custom_fields(CUSTOM_FIELDS, update=True)
    frappe.clear_cache()
