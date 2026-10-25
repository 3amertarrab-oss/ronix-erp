import frappe
from frappe import _


def validate_quotation(doc, method=None):
    if doc.get("ronix_revision") and doc.ronix_revision < 1:
        frappe.throw(_("RONIX Revision must be 1 or greater."))

    if doc.get("ronix_contract"):
        contract = frappe.db.get_value(
            "RONIX Contract", doc.ronix_contract, ["quotation", "customer"], as_dict=True
        )
        if not contract:
            frappe.throw(_("Linked RONIX Contract does not exist."))
        if contract.quotation != doc.name or contract.customer != doc.party_name:
            frappe.throw(_("RONIX Contract does not belong to this Quotation and Customer."))

