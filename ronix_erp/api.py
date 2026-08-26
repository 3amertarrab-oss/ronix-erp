import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt


@frappe.whitelist()
def make_contract_from_quotation(source_name, target_doc=None):
    quotation = frappe.get_doc("Quotation", source_name)
    if quotation.docstatus != 1:
        frappe.throw(_("Only a submitted Quotation can be converted to a RONIX Contract."))
    if quotation.quotation_to != "Customer":
        frappe.throw(_("The Quotation must be issued to a Customer before contract conversion."))

    existing = frappe.db.exists(
        "RONIX Contract", {"quotation": source_name, "docstatus": ["<", 2]}
    )
    if existing:
        frappe.throw(_("Quotation {0} is already linked to Contract {1}.").format(source_name, existing))

    def set_contract_item_values(source, target, source_parent):
        target.description = source.description or source.item_name or source.item_code

    def set_missing_values(source, target):
        target.title = source.get("title") or source_name
        target.customer = source.party_name
        target.contract_date = source.transaction_date
        target.currency = source.currency
        target.exchange_rate = source.conversion_rate or 1
        target.contract_status = "Draft"
        target.set("payment_schedule", [])
        target.run_method("set_totals")

    return get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "RONIX Contract",
                "field_map": {
                    "name": "quotation",
                    "company": "company",
                    "party_name": "customer",
                    "currency": "currency",
                    "conversion_rate": "exchange_rate",
                    "transaction_date": "contract_date",
                },
            },
            "Quotation Item": {
                "doctype": "RONIX Contract Item",
                "postprocess": set_contract_item_values,
                "field_map": {
                    "item_code": "item_code",
                    "item_name": "item_name",
                    "description": "description",
                    "qty": "qty",
                    "uom": "uom",
                    "rate": "rate",
                    "amount": "amount",
                },
            },
        },
        target_doc,
        set_missing_values,
    )


@frappe.whitelist()
def make_project_from_contract(source_name):
    contract = frappe.get_doc("RONIX Contract", source_name)
    if contract.docstatus != 1 or contract.contract_status not in ("Signed", "Active"):
        frappe.throw(_("Only a submitted Signed or Active Contract can create a Project."))
    if contract.project:
        frappe.throw(_("Contract is already linked to Project {0}.").format(contract.project))

    project = frappe.new_doc("Project")
    project.project_name = contract.title
    project.customer = contract.customer
    project.company = contract.company
    project.expected_start_date = contract.start_date
    project.expected_end_date = contract.end_date
    project.ronix_contract = contract.name
    project.ronix_quotation = contract.quotation
    return project


@frappe.whitelist()
def make_claim_from_contract(source_name):
    contract = frappe.get_doc("RONIX Contract", source_name)
    if contract.docstatus != 1 or contract.contract_status not in ("Signed", "Active"):
        frappe.throw(_("Only a submitted Signed or Active Contract can create a Claim."))

    claim = frappe.new_doc("RONIX Claim")
    claim.company = contract.company
    claim.customer = contract.customer
    claim.contract = contract.name
    claim.project = contract.project
    claim.currency = contract.currency
    claim.claim_status = "Draft"
    for item in contract.items:
        claim.append(
            "items",
            {
                "description": item.description,
                "qty": item.qty,
                "uom": item.uom,
                "rate": item.rate,
                "amount": item.amount,
                "contract_item_reference": item.name,
            },
        )
    claim.run_method("set_totals")
    return claim


@frappe.whitelist()
def make_sales_invoice_from_claim(source_name):
    claim = frappe.get_doc("RONIX Claim", source_name)
    if claim.docstatus != 1 or claim.claim_status != "Approved":
        frappe.throw(_("Only a submitted Approved Claim can create a Sales Invoice."))

    frappe.db.sql(
        "SELECT name FROM `tabRONIX Claim` WHERE name = %s FOR UPDATE",
        (claim.name,),
    )
    existing = frappe.db.exists(
        "Sales Invoice", {"ronix_claim": claim.name, "docstatus": ["<", 2]}
    )
    if existing:
        frappe.throw(
            _("Claim {0} is already linked to Sales Invoice {1}.").format(
                claim.name, existing
            )
        )

    contract = frappe.get_doc("RONIX Contract", claim.contract)
    contract_items = {row.name: row for row in contract.items}

    invoice = frappe.new_doc("Sales Invoice")
    invoice.company = claim.company
    invoice.customer = claim.customer
    invoice.posting_date = claim.posting_date
    invoice.due_date = claim.due_date or claim.posting_date
    invoice.currency = claim.currency
    invoice.conversion_rate = flt(contract.exchange_rate) or 1
    invoice.project = claim.project
    invoice.ronix_claim = claim.name
    invoice.ronix_contract = claim.contract
    invoice.ronix_payment_milestone = claim.payment_milestone

    for row in claim.items:
        contract_item = contract_items.get(row.contract_item_reference)
        if not contract_item or not contract_item.item_code:
            frappe.throw(
                _("Contract item {0} requires an Item Code before invoicing.").format(
                    row.contract_item_reference or row.idx
                )
            )
        invoice.append(
            "items",
            {
                "item_code": contract_item.item_code,
                "item_name": contract_item.item_name,
                "description": row.description,
                "qty": row.qty,
                "uom": row.uom,
                "rate": row.rate,
                "amount": row.amount,
                "project": claim.project,
                "ronix_claim_item": row.name,
            },
        )

    invoice.run_method("set_missing_values")
    invoice.due_date = claim.due_date or claim.posting_date
    invoice.run_method("calculate_taxes_and_totals")
    return invoice
