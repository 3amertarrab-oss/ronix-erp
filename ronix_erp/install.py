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
        {
            "fieldname": "ronix_commercial_status",
            "label": "RONIX Commercial Status",
            "fieldtype": "Select",
            "options": "Open\nContracted\nProject Active\nClosed",
            "default": "Open",
            "read_only": 1,
            "in_list_view": 1,
            "insert_after": "ronix_project",
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
            "fieldname": "ronix_warehouse_section",
            "label": "RONIX Project Warehouses",
            "fieldtype": "Section Break",
            "insert_after": "ronix_cost_center",
        },
        {
            "fieldname": "ronix_warehouse_group",
            "label": "Project Warehouse Group",
            "fieldtype": "Link",
            "options": "Warehouse",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_warehouse_section",
        },
        {
            "fieldname": "ronix_raw_materials_warehouse",
            "label": "Raw Materials Warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_warehouse_group",
        },
        {
            "fieldname": "ronix_wip_warehouse",
            "label": "Work In Progress Warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_raw_materials_warehouse",
        },
        {
            "fieldname": "ronix_finished_goods_warehouse",
            "label": "Finished Goods Warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_wip_warehouse",
        },
        {
            "fieldname": "ronix_scrap_warehouse",
            "label": "Scrap Warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_finished_goods_warehouse",
        },
        {
            "fieldname": "ronix_legacy_id",
            "label": "RONIX Legacy ID",
            "fieldtype": "Data",
            "unique": 1,
            "read_only": 1,
            "no_copy": 1,
            "hidden": 1,
            "insert_after": "ronix_scrap_warehouse",
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
    "Warehouse": [
        {
            "fieldname": "ronix_project_section",
            "label": "RONIX Project Ownership",
            "fieldtype": "Section Break",
            "insert_after": "disabled",
            "collapsible": 1,
        },
        {
            "fieldname": "ronix_project",
            "label": "RONIX Project",
            "fieldtype": "Link",
            "options": "Project",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_project_section",
        },
        {
            "fieldname": "ronix_warehouse_role",
            "label": "RONIX Warehouse Role",
            "fieldtype": "Select",
            "options": "\nProject Group\nRaw Materials\nWork In Progress\nFinished Goods\nScrap",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": "ronix_project",
        },
    ],
}


def _ronix_link_fields(project_field="project"):
    fields = []
    if project_field != "project":
        fields.append(
            {
                "fieldname": project_field,
                "label": "RONIX Project",
                "fieldtype": "Link",
                "options": "Project",
                "no_copy": 1,
                "insert_after": "company",
            }
        )
    fields.append(
        {
            "fieldname": "ronix_contract",
            "label": "RONIX Contract",
            "fieldtype": "Link",
            "options": "RONIX Contract",
            "read_only": 1,
            "no_copy": 1,
            "insert_after": project_field,
        }
    )
    return fields


for _doctype in (
    "Purchase Order",
    "Purchase Receipt",
    "Purchase Invoice",
    "Work Order",
    "Job Card",
    "Stock Entry",
):
    CUSTOM_FIELDS[_doctype] = _ronix_link_fields()

CUSTOM_FIELDS["Material Request"] = _ronix_link_fields("ronix_project")
CUSTOM_FIELDS["Expense Claim"] = _ronix_link_fields("ronix_project")


def after_install():
    create_or_update_custom_fields()
    ensure_ronix_print_formats()
    ensure_existing_project_operations()
    reconcile_existing_commercial_links()


def after_migrate():
    create_or_update_custom_fields()
    ensure_ronix_print_formats()
    ensure_existing_project_operations()
    reconcile_existing_commercial_links()


def create_or_update_custom_fields():
    installed_custom_fields = {
        doctype: fields
        for doctype, fields in CUSTOM_FIELDS.items()
        if frappe.db.exists("DocType", doctype)
    }
    create_custom_fields(installed_custom_fields, update=True)
    frappe.clear_cache()


def ensure_ronix_print_formats():
    from ronix_erp.print_formats import ensure_print_formats

    ensure_print_formats()


def ensure_existing_project_operations():
    from ronix_erp.events.project import (
        ensure_all_ronix_project_cost_centers,
        ensure_all_ronix_project_warehouses,
    )

    ensure_all_ronix_project_cost_centers()
    ensure_all_ronix_project_warehouses()


def reconcile_existing_commercial_links():
    from ronix_erp.commercial import sync_contract_commercials

    contracts = frappe.get_all(
        "RONIX Contract",
        filters={"docstatus": ["<", 2]},
        fields=["name", "quotation", "project", "contract_status", "docstatus"],
    )
    for contract in contracts:
        status = "Open"
        if contract.docstatus == 1:
            status = "Contracted"
            if contract.project:
                status = "Project Active"
            if contract.contract_status == "Closed":
                status = "Closed"
        frappe.db.set_value(
            "Quotation",
            contract.quotation,
            {
                "ronix_contract": contract.name,
                "ronix_project": contract.project,
                "ronix_approved_for_contract": int(contract.docstatus == 1),
                "ronix_commercial_status": status,
            },
            update_modified=False,
        )
        sync_contract_commercials(contract.name)
