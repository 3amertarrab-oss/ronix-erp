import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from ronix_erp.commercial import sync_contract_commercials


class RONIXContract(Document):
    def validate(self):
        self.validate_source()
        self.validate_dates()
        self.validate_exchange_rate()
        self.validate_retention_policy()
        self.set_totals()
        self.validate_payment_schedule()
        self.validate_signatories()
        self.validate_status_transition()

    def before_submit(self):
        missing = []
        if not self.technical_approved:
            missing.append(_("Technical Approval"))
        if not self.finance_approved:
            missing.append(_("Finance Approval"))
        if not self.management_approved:
            missing.append(_("Management Approval"))
        if self.contract_status not in ("Approved", "Signed", "Active"):
            missing.append(_("Approved or Signed contract status"))
        if missing:
            frappe.throw(_("Contract cannot be submitted. Missing: {0}").format(", ".join(missing)))

    def before_cancel(self):
        project = self.project or frappe.db.exists("Project", {"ronix_contract": self.name})
        if project:
            frappe.throw(
                _("Contract cannot be cancelled because it is linked to Project {0}.").format(
                    project
                )
            )

        claim = frappe.db.exists(
            "RONIX Claim", {"contract": self.name, "docstatus": ["<", 2]}
        )
        if claim:
            frappe.throw(
                _("Contract cannot be cancelled because Claim {0} depends on it.").format(claim)
            )

        invoice = frappe.db.exists(
            "Sales Invoice", {"ronix_contract": self.name, "docstatus": ["<", 2]}
        )
        if invoice:
            frappe.throw(
                _("Contract cannot be cancelled because Sales Invoice {0} depends on it.").format(
                    invoice
                )
            )

    def on_submit(self):
        frappe.db.set_value(
            "Quotation",
            self.quotation,
            {
                "ronix_contract": self.name,
                "ronix_approved_for_contract": 1,
                "ronix_commercial_status": "Contracted",
            },
        )
        sync_contract_commercials(self.name)

    def on_update_after_submit(self):
        status = "Closed" if self.contract_status == "Closed" else "Contracted"
        if self.project and self.contract_status in ("Active", "Closed"):
            status = "Closed" if self.contract_status == "Closed" else "Project Active"
        frappe.db.set_value(
            "Quotation",
            self.quotation,
            {"ronix_contract": self.name, "ronix_commercial_status": status},
            update_modified=False,
        )
        sync_contract_commercials(self.name)

    def on_cancel(self):
        linked = frappe.db.get_value("Quotation", self.quotation, "ronix_contract")
        if linked == self.name:
            frappe.db.set_value(
                "Quotation",
                self.quotation,
                {
                    "ronix_contract": None,
                    "ronix_approved_for_contract": 0,
                    "ronix_commercial_status": "Open",
                },
            )
        sync_contract_commercials(self.name)

    def validate_source(self):
        if not self.quotation:
            return
        quotation = frappe.db.get_value(
            "Quotation",
            self.quotation,
            ["party_name", "company", "currency", "docstatus"],
            as_dict=True,
        )
        if not quotation or quotation.docstatus != 1:
            frappe.throw(_("The source Quotation must exist and be submitted."))
        if quotation.party_name != self.customer:
            frappe.throw(_("Contract customer must match the source Quotation customer."))
        if quotation.company != self.company:
            frappe.throw(_("Contract company must match the source Quotation company."))
        if quotation.currency != self.currency:
            frappe.throw(_("Contract currency must match the source Quotation currency."))

        duplicate = frappe.db.exists(
            "RONIX Contract",
            {
                "quotation": self.quotation,
                "name": ["!=", self.name],
                "docstatus": ["<", 2],
            },
        )
        if duplicate:
            frappe.throw(_("Quotation is already linked to active Contract {0}.").format(duplicate))

    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            frappe.throw(_("Contract end date cannot be before the start date."))

    def validate_exchange_rate(self):
        if flt(self.exchange_rate) <= 0:
            frappe.throw(_("Contract exchange rate must be greater than zero."))

    def validate_retention_policy(self):
        retention_percent = flt(self.retention_percent)
        if retention_percent < 0 or retention_percent > 100:
            frappe.throw(_("Contract Retention % must be between 0 and 100."))
        if (
            self.retention_release_date
            and self.contract_date
            and self.retention_release_date < self.contract_date
        ):
            frappe.throw(_("Retention release date cannot be before the Contract date."))
        if retention_percent and not (
            self.retention_release_date or (self.retention_terms or "").strip()
        ):
            frappe.throw(
                _(
                    "A contract with retention requires a Retention Release Date "
                    "or Retention Release Terms."
                )
            )

    def validate_signatories(self):
        if self.contract_status in ("Signed", "Active"):
            if not self.signed_by_customer or not self.signed_by_company:
                frappe.throw(
                    _("Signed or Active contracts require both customer and company signatories.")
                )

    def validate_status_transition(self):
        previous = self.get_doc_before_save()
        if not previous or previous.docstatus != 1 or self.docstatus != 1:
            return

        allowed = {
            "Approved": {"Approved", "Signed"},
            "Signed": {"Signed", "Active"},
            "Active": {"Active", "Closed"},
            "Closed": {"Closed"},
        }
        if self.contract_status == "Cancelled":
            frappe.throw(_("Use the Cancel action instead of changing Contract Status manually."))
        allowed_next = allowed.get(previous.contract_status, {previous.contract_status})
        if self.contract_status not in allowed_next:
            frappe.throw(
                _("Invalid Contract Status transition from {0} to {1}.").format(
                    previous.contract_status, self.contract_status
                )
            )

    def set_totals(self):
        if not self.items:
            frappe.throw(_("Contract must contain at least one item."))
        total = 0
        for row in self.items:
            if flt(row.qty) <= 0:
                frappe.throw(_("Contract item quantity must be greater than zero."))
            if flt(row.rate) < 0:
                frappe.throw(_("Contract item rate cannot be negative."))
            row.amount = flt(row.qty) * flt(row.rate)
            total += row.amount
        self.contract_value = total

    def validate_payment_schedule(self):
        percent_total = 0
        amount_total = 0
        for row in self.payment_schedule:
            if flt(row.percentage) < 0 or flt(row.amount) < 0:
                frappe.throw(_("Payment milestone percentage and amount cannot be negative."))
            if flt(row.percentage) and not flt(row.amount):
                row.amount = flt(self.contract_value) * flt(row.percentage) / 100
            elif flt(row.percentage) and flt(row.amount):
                expected = flt(self.contract_value) * flt(row.percentage) / 100
                if abs(flt(row.amount) - expected) > 0.01:
                    frappe.throw(
                        _("Payment milestone {0} amount does not match its percentage.").format(
                            row.milestone
                        )
                    )
            percent_total += flt(row.percentage)
            amount_total += flt(row.amount)

        if percent_total > 100.0001:
            frappe.throw(_("Payment schedule percentages cannot exceed 100%."))
        if amount_total > flt(self.contract_value) + 0.01:
            frappe.throw(_("Payment schedule amount cannot exceed the contract value."))

        if self.payment_schedule and self.docstatus == 1:
            complete_by_percent = abs(percent_total - 100) <= 0.0001
            complete_by_amount = abs(amount_total - flt(self.contract_value)) <= 0.01
            if not (complete_by_percent or complete_by_amount):
                frappe.throw(
                    _("Submitted Contract payment schedule must cover the full contract value.")
                )
