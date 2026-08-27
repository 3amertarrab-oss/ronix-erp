import frappe
from frappe import _
from frappe.utils import flt

from ronix_erp.accounting import get_accounting_settings, get_claim_adjustments


def validate_payment_entry(doc, method=None):
    if not doc.get("ronix_claim"):
        return

    claim = frappe.get_doc("RONIX Claim", doc.ronix_claim)
    if claim.docstatus != 1 or claim.claim_status != "Invoiced":
        frappe.throw(_("RONIX Claim must be submitted and Invoiced before collection."))
    if not claim.sales_invoice or doc.get("ronix_sales_invoice") != claim.sales_invoice:
        frappe.throw(_("Payment Entry Sales Invoice must match the RONIX Claim invoice."))

    invoice = frappe.get_doc("Sales Invoice", claim.sales_invoice)
    if invoice.docstatus != 1:
        frappe.throw(_("RONIX Sales Invoice must be submitted before collection."))
    if doc.company != claim.company or doc.party != claim.customer:
        frappe.throw(_("Payment Entry company and customer must match the RONIX Claim."))
    if doc.payment_type != "Receive" or doc.party_type != "Customer":
        frappe.throw(_("RONIX collection must be a Customer Receive Payment Entry."))
    if doc.project != claim.project:
        frappe.throw(_("Payment Entry project must match the RONIX Claim project."))
    project_cost_center = frappe.db.get_value(
        "Project", claim.project, "ronix_cost_center"
    )
    if not project_cost_center:
        frappe.throw(_("RONIX Project requires a Project Cost Center before collection."))

    duplicate = frappe.db.exists(
        "Payment Entry",
        {
            "ronix_claim": claim.name,
            "name": ["!=", doc.name],
            "docstatus": ["<", 2],
        },
    )
    if duplicate:
        frappe.throw(_("RONIX Claim is already linked to Payment Entry {0}.").format(duplicate))

    settings = get_accounting_settings(doc.company, claim)
    expected_adjustments = get_claim_adjustments(claim, settings)
    _validate_references(doc, invoice)
    _validate_adjustments(doc, expected_adjustments, project_cost_center)

    expected_received = flt(invoice.outstanding_amount) - sum(
        flt(row["amount"]) for row in expected_adjustments
    )
    if expected_received <= 0:
        frappe.throw(_("RONIX collection amount must be greater than zero."))
    if abs(flt(doc.paid_amount) - expected_received) > 0.01:
        frappe.throw(_("Payment Entry paid amount must match the RONIX net collection amount."))
    if abs(flt(doc.received_amount) - expected_received) > 0.01:
        frappe.throw(_("Payment Entry received amount must match the RONIX net collection amount."))


def _validate_references(doc, invoice):
    references = [row for row in doc.references if flt(row.allocated_amount)]
    if len(references) != 1:
        frappe.throw(_("RONIX collection must allocate exactly one Sales Invoice."))
    reference = references[0]
    if (
        reference.reference_doctype != "Sales Invoice"
        or reference.reference_name != invoice.name
    ):
        frappe.throw(_("RONIX collection reference must be the linked Sales Invoice."))
    if abs(flt(reference.allocated_amount) - flt(invoice.outstanding_amount)) > 0.01:
        frappe.throw(_("RONIX collection must allocate the full invoice outstanding amount."))


def _validate_adjustments(doc, expected_adjustments, project_cost_center):
    actual = [row for row in doc.deductions if not row.get("is_exchange_gain_loss")]
    if len(actual) != len(expected_adjustments):
        frappe.throw(_("Payment Entry adjustments must match the RONIX Claim."))
    expected = {
        (row["account"], round(flt(row["amount"]), 2)) for row in expected_adjustments
    }
    received = {(row.account, round(flt(row.amount), 2)) for row in actual}
    if received != expected:
        frappe.throw(_("Payment Entry retention and withholding adjustments are incorrect."))
    if any(row.cost_center != project_cost_center for row in actual):
        frappe.throw(_("Payment Entry adjustments must use the Project Cost Center."))


def on_submit_payment_entry(doc, method=None):
    if not doc.get("ronix_claim"):
        return
    claim = frappe.get_doc("RONIX Claim", doc.ronix_claim)
    status = "Collected with Retention" if flt(claim.retention_amount) else "Collected"
    frappe.db.set_value(
        "RONIX Claim",
        claim.name,
        {"payment_entry": doc.name, "collection_status": status},
        update_modified=True,
    )
    from ronix_erp.commercial import sync_contract_commercials

    sync_contract_commercials(claim.contract)


def on_cancel_payment_entry(doc, method=None):
    if not doc.get("ronix_claim"):
        return
    linked_payment = frappe.db.get_value("RONIX Claim", doc.ronix_claim, "payment_entry")
    if linked_payment == doc.name:
        frappe.db.set_value(
            "RONIX Claim",
            doc.ronix_claim,
            {"payment_entry": None, "collection_status": "Not Collected"},
            update_modified=True,
        )
    contract = frappe.db.get_value("RONIX Claim", doc.ronix_claim, "contract")
    from ronix_erp.commercial import sync_contract_commercials

    sync_contract_commercials(contract)
