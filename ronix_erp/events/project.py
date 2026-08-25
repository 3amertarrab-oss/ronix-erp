import frappe
from frappe import _


def validate_project(doc, method=None):
    if not doc.get("ronix_contract"):
        return

    contract = frappe.db.get_value(
        "RONIX Contract",
        doc.ronix_contract,
        ["customer", "quotation", "company"],
        as_dict=True,
    )
    if not contract:
        frappe.throw(_("Linked RONIX Contract does not exist."))
    if doc.customer and doc.customer != contract.customer:
        frappe.throw(_("Project customer must match the RONIX Contract customer."))
    if doc.get("ronix_quotation") and doc.ronix_quotation != contract.quotation:
        frappe.throw(_("Project quotation must match the RONIX Contract quotation."))
    if doc.company and doc.company != contract.company:
        frappe.throw(_("Project company must match the RONIX Contract company."))


def after_insert_project(doc, method=None):
    if not doc.get("ronix_contract"):
        return

    existing_project = frappe.db.get_value("RONIX Contract", doc.ronix_contract, "project")
    if existing_project and existing_project != doc.name:
        frappe.throw(_("RONIX Contract is already linked to Project {0}.").format(existing_project))

    frappe.db.set_value("RONIX Contract", doc.ronix_contract, "project", doc.name)
    if doc.get("ronix_quotation"):
        frappe.db.set_value("Quotation", doc.ronix_quotation, "ronix_project", doc.name)
