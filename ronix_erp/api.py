import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc


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
