import frappe
from frappe import _


def validate_sales_invoice(doc, method=None):
    if not doc.get("ronix_claim"):
        return

    claim = frappe.db.get_value(
        "RONIX Claim",
        doc.ronix_claim,
        ["contract", "customer", "company", "project"],
        as_dict=True,
    )
    if not claim:
        frappe.throw(_("Linked RONIX Claim does not exist."))
    if doc.customer != claim.customer:
        frappe.throw(_("Sales Invoice customer must match the RONIX Claim customer."))
    if doc.company != claim.company:
        frappe.throw(_("Sales Invoice company must match the RONIX Claim company."))
    if doc.project and claim.project and doc.project != claim.project:
        frappe.throw(_("Sales Invoice project must match the RONIX Claim project."))
    if doc.get("ronix_contract") and doc.ronix_contract != claim.contract:
        frappe.throw(_("Sales Invoice contract must match the RONIX Claim contract."))

