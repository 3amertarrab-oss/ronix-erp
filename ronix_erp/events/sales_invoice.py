import frappe
from frappe import _
from frappe.utils import flt, getdate


def validate_sales_invoice(doc, method=None):
    if not doc.get("ronix_claim"):
        return

    frappe.db.sql(
        "SELECT name FROM `tabRONIX Claim` WHERE name = %s FOR UPDATE",
        (doc.ronix_claim,),
    )
    claim = frappe.db.get_value(
        "RONIX Claim",
        doc.ronix_claim,
        [
            "contract",
            "customer",
            "company",
            "project",
            "currency",
            "docstatus",
            "claim_status",
            "due_date",
            "gross_amount",
            "sales_invoice",
        ],
        as_dict=True,
    )
    if not claim:
        frappe.throw(_("Linked RONIX Claim does not exist."))
    if claim.docstatus != 1:
        frappe.throw(_("Linked RONIX Claim must be submitted."))
    if claim.claim_status not in ("Approved", "Invoiced"):
        frappe.throw(_("Only an Approved RONIX Claim can be invoiced."))
    if claim.claim_status == "Invoiced" and claim.sales_invoice != doc.name:
        frappe.throw(_("RONIX Claim is already marked Invoiced."))
    if doc.customer != claim.customer:
        frappe.throw(_("Sales Invoice customer must match the RONIX Claim customer."))
    if doc.company != claim.company:
        frappe.throw(_("Sales Invoice company must match the RONIX Claim company."))
    if doc.currency != claim.currency:
        frappe.throw(_("Sales Invoice currency must match the RONIX Claim currency."))
    if doc.project != claim.project:
        frappe.throw(_("Sales Invoice project must match the RONIX Claim project."))
    if doc.get("ronix_contract") != claim.contract:
        frappe.throw(_("Sales Invoice contract must match the RONIX Claim contract."))
    if claim.due_date and (
        not doc.due_date or getdate(doc.due_date) != getdate(claim.due_date)
    ):
        frappe.throw(_("Sales Invoice due date must match the RONIX Claim due date."))

    duplicate = frappe.db.exists(
        "Sales Invoice",
        {
            "ronix_claim": doc.ronix_claim,
            "name": ["!=", doc.name],
            "docstatus": ["<", 2],
        },
    )
    if duplicate:
        frappe.throw(
            _("RONIX Claim is already linked to Sales Invoice {0}.").format(duplicate)
        )

    if not doc.items:
        frappe.throw(_("A Sales Invoice created from a RONIX Claim must contain items."))

    claim_items = frappe.get_all(
        "RONIX Claim Item",
        filters={"parent": doc.ronix_claim, "parenttype": "RONIX Claim"},
        fields=["name", "qty", "rate", "contract_item_reference"],
    )
    expected_by_name = {row.name: row for row in claim_items}
    contract_items = frappe.get_all(
        "RONIX Contract Item",
        filters={"parent": claim.contract, "parenttype": "RONIX Contract"},
        fields=["name", "item_code"],
    )
    item_code_by_contract_row = {row.name: row.item_code for row in contract_items}
    seen = set()
    for row in doc.items:
        source_name = row.get("ronix_claim_item")
        source = expected_by_name.get(source_name)
        if not source or source_name in seen:
            frappe.throw(_("Every Sales Invoice item must map to one unique Claim item."))
        if row.item_code != item_code_by_contract_row.get(source.contract_item_reference):
            frappe.throw(_("Sales Invoice item code must match its Contract item."))
        if abs(flt(row.qty) - flt(source.qty)) > 0.0001:
            frappe.throw(_("Sales Invoice item quantity must match its Claim item."))
        if abs(flt(row.rate) - flt(source.rate)) > 0.0001:
            frappe.throw(_("Sales Invoice item rate must match its Claim item."))
        seen.add(source_name)
    if seen != set(expected_by_name):
        frappe.throw(_("Sales Invoice must include every item from the RONIX Claim."))

    invoice_gross = sum(flt(row.qty) * flt(row.rate) for row in doc.items)
    if abs(invoice_gross - flt(claim.gross_amount)) > 0.01:
        frappe.throw(_("Sales Invoice item total must match the RONIX Claim gross amount."))


def on_submit_sales_invoice(doc, method=None):
    if not doc.get("ronix_claim"):
        return
    frappe.db.set_value(
        "RONIX Claim",
        doc.ronix_claim,
        {"sales_invoice": doc.name, "claim_status": "Invoiced"},
        update_modified=True,
    )


def on_cancel_sales_invoice(doc, method=None):
    if not doc.get("ronix_claim"):
        return
    linked_invoice = frappe.db.get_value(
        "RONIX Claim", doc.ronix_claim, "sales_invoice"
    )
    if linked_invoice == doc.name:
        frappe.db.set_value(
            "RONIX Claim",
            doc.ronix_claim,
            {"sales_invoice": None, "claim_status": "Approved"},
            update_modified=True,
        )
