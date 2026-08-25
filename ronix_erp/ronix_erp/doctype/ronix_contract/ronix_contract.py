import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class RONIXContract(Document):
    def validate(self):
        self.validate_source()
        self.validate_dates()
        self.set_totals()
        self.validate_payment_schedule()

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

    def on_submit(self):
        frappe.db.set_value(
            "Quotation",
            self.quotation,
            {"ronix_contract": self.name, "ronix_approved_for_contract": 1},
        )

    def on_cancel(self):
        linked = frappe.db.get_value("Quotation", self.quotation, "ronix_contract")
        if linked == self.name:
            frappe.db.set_value(
                "Quotation",
                self.quotation,
                {"ronix_contract": None, "ronix_approved_for_contract": 0},
            )

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

    def set_totals(self):
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
            percent_total += flt(row.percentage)
            amount_total += flt(row.amount)

        if percent_total > 100.0001:
            frappe.throw(_("Payment schedule percentages cannot exceed 100%."))
        if amount_total > flt(self.contract_value) + 0.01:
            frappe.throw(_("Payment schedule amount cannot exceed the contract value."))
