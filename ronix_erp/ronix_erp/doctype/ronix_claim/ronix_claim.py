import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class RONIXClaim(Document):
    def validate(self):
        self.validate_contract()
        self.validate_dates()
        self.validate_percentages()
        self.set_totals()
        self.validate_contract_items_and_cumulative_quantity()
        self.validate_invoice_status()
        self.validate_status_transition()

    def before_submit(self):
        if self.claim_status != "Approved":
            frappe.throw(_("Only an Approved claim can be submitted."))

    def before_cancel(self):
        invoice = self.sales_invoice or frappe.db.exists(
            "Sales Invoice", {"ronix_claim": self.name, "docstatus": ["<", 2]}
        )
        if invoice:
            frappe.throw(
                _("Claim cannot be cancelled because Sales Invoice {0} depends on it.").format(
                    invoice
                )
            )

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

    def validate_percentages(self):
        for fieldname, label in (
            ("retention_percent", _("Retention %")),
            ("withholding_percent", _("Withholding %")),
            ("tax_percent", _("Tax %")),
        ):
            value = flt(self.get(fieldname))
            if value < 0 or value > 100:
                frappe.throw(_("{0} must be between 0 and 100.").format(label))

    def set_totals(self):
        if not self.items:
            frappe.throw(_("Claim must contain at least one item."))
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

    def validate_contract_items_and_cumulative_quantity(self):
        frappe.db.sql(
            "SELECT name FROM `tabRONIX Contract` WHERE name = %s FOR UPDATE",
            (self.contract,),
        )
        contract_items = frappe.get_all(
            "RONIX Contract Item",
            filters={"parent": self.contract, "parenttype": "RONIX Contract"},
            fields=["name", "qty", "rate", "amount"],
        )
        contract_by_reference = {row.name: row for row in contract_items}
        current_totals = {}

        for row in self.items:
            reference = (row.contract_item_reference or "").strip()
            if not reference or reference not in contract_by_reference:
                frappe.throw(
                    _("Every Claim item must reference an item from Contract {0}.").format(
                        self.contract
                    )
                )
            source = contract_by_reference[reference]
            if abs(flt(row.rate) - flt(source.rate)) > 0.0001:
                frappe.throw(
                    _("Claim item rate must match Contract item {0}.").format(reference)
                )
            totals = current_totals.setdefault(reference, {"qty": 0.0, "amount": 0.0})
            totals["qty"] += flt(row.qty)
            totals["amount"] += flt(row.amount)

        for reference, totals in current_totals.items():
            previous = frappe.db.sql(
                """
                SELECT COALESCE(SUM(item.qty), 0) AS qty,
                       COALESCE(SUM(item.amount), 0) AS amount
                  FROM `tabRONIX Claim Item` item
                  JOIN `tabRONIX Claim` claim ON claim.name = item.parent
                 WHERE claim.contract = %(contract)s
                   AND claim.docstatus < 2
                   AND claim.name != %(claim)s
                   AND item.contract_item_reference = %(reference)s
                """,
                {
                    "contract": self.contract,
                    "claim": self.name or "",
                    "reference": reference,
                },
                as_dict=True,
            )[0]
            source = contract_by_reference[reference]
            cumulative_qty = flt(previous.qty) + totals["qty"]
            cumulative_amount = flt(previous.amount) + totals["amount"]
            if cumulative_qty > flt(source.qty) + 0.0001:
                frappe.throw(
                    _("Cumulative claimed quantity exceeds Contract item {0}.").format(reference)
                )
            if cumulative_amount > flt(source.amount) + 0.01:
                frappe.throw(
                    _("Cumulative claimed amount exceeds Contract item {0}.").format(reference)
                )

    def validate_invoice_status(self):
        if self.claim_status == "Invoiced" and not self.sales_invoice:
            frappe.throw(_("Claim cannot be marked Invoiced without a linked Sales Invoice."))

    def validate_status_transition(self):
        previous = self.get_doc_before_save()
        if not previous or previous.docstatus != 1 or self.docstatus != 1:
            return

        if self.claim_status == "Cancelled":
            frappe.throw(_("Use the Cancel action instead of changing Claim Status manually."))
        allowed = {
            "Approved": {"Approved", "Invoiced"},
            "Invoiced": {"Invoiced"},
        }
        allowed_next = allowed.get(previous.claim_status, {previous.claim_status})
        if self.claim_status not in allowed_next:
            frappe.throw(
                _("Invalid Claim Status transition from {0} to {1}.").format(
                    previous.claim_status, self.claim_status
                )
            )
