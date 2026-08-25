import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class RONIXClaim(Document):
    def validate(self):
        self.validate_contract()
        self.validate_dates()
        self.set_totals()

    def before_submit(self):
        if self.claim_status != "Approved":
            frappe.throw(_("Only an Approved claim can be submitted."))

    def validate_contract(self):
        contract = frappe.db.get_value(
            "RONIX Contract",
            self.contract,
            ["customer", "company", "project", "currency", "docstatus", "contract_status"],
            as_dict=True,
        )
        if not contract or contract.docstatus != 1:
            frappe.throw(_("The linked Contract must exist and be submitted."))
        if contract.contract_status not in ("Signed", "Active"):
            frappe.throw(_("Claims require a Signed or Active Contract."))
        for fieldname in ("customer", "company", "currency"):
            if self.get(fieldname) != contract.get(fieldname):
                frappe.throw(_("Claim {0} must match the Contract.").format(fieldname))
        if self.project and contract.project and self.project != contract.project:
            frappe.throw(_("Claim project must match the Contract project."))

    def validate_dates(self):
        if self.posting_date and self.due_date and self.due_date < self.posting_date:
            frappe.throw(_("Claim due date cannot be before the posting date."))

    def set_totals(self):
        gross = 0
        for row in self.items:
            if flt(row.qty) <= 0:
                frappe.throw(_("Claim item quantity must be greater than zero."))
            if flt(row.rate) < 0:
                frappe.throw(_("Claim item rate cannot be negative."))
            row.amount = flt(row.qty) * flt(row.rate)
            gross += row.amount

        self.gross_amount = gross
        self.retention_amount = gross * flt(self.retention_percent) / 100
        self.withholding_amount = gross * flt(self.withholding_percent) / 100
        self.tax_amount = gross * flt(self.tax_percent) / 100
        self.net_amount = (
            gross + flt(self.tax_amount) - flt(self.retention_amount) - flt(self.withholding_amount)
        )
        if self.net_amount < 0:
            frappe.throw(_("Claim net amount cannot be negative."))

