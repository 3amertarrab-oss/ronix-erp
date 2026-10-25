from __future__ import annotations

import frappe
from frappe.utils import flt

from ronix_erp.commercial_math import (
    calculate_contract_balance_snapshot,
    get_milestone_status,
)

CONTRACT_BALANCE_FIELDS = (
    "claimed_amount",
    "invoiced_amount",
    "collected_amount",
    "retention_held",
    "withholding_held",
    "outstanding_amount",
    "remaining_contract_value",
)


def sync_contract_commercials(contract_name):
    """Reconcile persisted contract and milestone rollups from submitted documents."""
    if not contract_name or not frappe.db.exists("RONIX Contract", contract_name):
        return

    contract = frappe.db.get_value(
        "RONIX Contract",
        contract_name,
        ["contract_value"],
        as_dict=True,
    )
    claim_totals = frappe.db.sql(
        """
        SELECT COALESCE(SUM(gross_amount), 0) AS claimed_amount
          FROM `tabRONIX Claim`
         WHERE contract = %s
           AND docstatus = 1
        """,
        (contract_name,),
        as_dict=True,
    )[0]
    invoice_totals = frappe.db.sql(
        """
        SELECT COALESCE(SUM(grand_total), 0) AS invoiced_amount,
               COALESCE(SUM(outstanding_amount), 0) AS outstanding_amount
          FROM `tabSales Invoice`
         WHERE ronix_contract = %s
           AND docstatus = 1
        """,
        (contract_name,),
        as_dict=True,
    )[0]
    cash_totals = frappe.db.sql(
        """
        SELECT COALESCE(SUM(payment.paid_amount), 0) AS collected_amount
          FROM `tabPayment Entry` payment
          JOIN `tabRONIX Claim` claim ON claim.name = payment.ronix_claim
         WHERE claim.contract = %s
           AND payment.docstatus = 1
           AND payment.payment_type = 'Receive'
        """,
        (contract_name,),
        as_dict=True,
    )[0]
    deduction_totals = frappe.db.sql(
        """
        SELECT COALESCE(SUM(
                   CASE WHEN deduction.account = settings.retention_receivable_account
                        THEN deduction.amount ELSE 0 END
               ), 0) AS retention_held,
               COALESCE(SUM(
                   CASE WHEN deduction.account = settings.withholding_receivable_account
                        THEN deduction.amount ELSE 0 END
               ), 0) AS withholding_held
          FROM `tabPayment Entry` payment
          JOIN `tabRONIX Claim` claim ON claim.name = payment.ronix_claim
          JOIN `tabRONIX Accounting Settings` settings
            ON settings.company = payment.company
          LEFT JOIN `tabPayment Entry Deduction` deduction
            ON deduction.parent = payment.name
         WHERE claim.contract = %s
           AND payment.docstatus = 1
           AND payment.payment_type = 'Receive'
        """,
        (contract_name,),
        as_dict=True,
    )[0]

    snapshot = calculate_contract_balance_snapshot(
        contract.contract_value,
        claim_totals.claimed_amount,
        invoice_totals.invoiced_amount,
        cash_totals.collected_amount,
        deduction_totals.retention_held,
        deduction_totals.withholding_held,
        invoice_totals.outstanding_amount,
    )
    frappe.db.set_value(
        "RONIX Contract",
        contract_name,
        snapshot,
        update_modified=False,
    )
    _sync_milestones(contract_name)
    frappe.clear_document_cache("RONIX Contract", contract_name)
    return snapshot


def _sync_milestones(contract_name):
    milestones = frappe.get_all(
        "RONIX Contract Milestone",
        filters={"parent": contract_name, "parenttype": "RONIX Contract"},
        fields=["name", "milestone", "amount", "due_date", "idx"],
        order_by="idx asc",
    )
    if not milestones:
        return

    claims = frappe.get_all(
        "RONIX Claim",
        filters={"contract": contract_name, "docstatus": 1},
        fields=[
            "name",
            "payment_milestone",
            "sales_invoice",
            "payment_entry",
            "retention_amount",
            "withholding_amount",
        ],
    )
    single_milestone = milestones[0].milestone if len(milestones) == 1 else None
    totals = {
        row.milestone: {
            "invoiced_amount": 0.0,
            "collected_amount": 0.0,
            "retention_amount": 0.0,
            "withholding_amount": 0.0,
        }
        for row in milestones
    }

    for claim in claims:
        milestone = claim.payment_milestone or single_milestone
        if milestone not in totals:
            continue
        bucket = totals[milestone]
        if claim.sales_invoice:
            invoice = frappe.db.get_value(
                "Sales Invoice",
                claim.sales_invoice,
                ["docstatus", "grand_total"],
                as_dict=True,
            )
            if invoice and invoice.docstatus == 1:
                bucket["invoiced_amount"] += flt(invoice.grand_total)
        if claim.payment_entry:
            payment = frappe.db.get_value(
                "Payment Entry",
                claim.payment_entry,
                ["docstatus", "paid_amount"],
                as_dict=True,
            )
            if payment and payment.docstatus == 1:
                bucket["collected_amount"] += flt(payment.paid_amount)
                bucket["retention_amount"] += flt(claim.retention_amount)
                bucket["withholding_amount"] += flt(claim.withholding_amount)

    for row in milestones:
        values = totals[row.milestone]
        status = get_milestone_status(
            row.amount,
            values["invoiced_amount"],
            values["collected_amount"],
            values["retention_amount"],
            values["withholding_amount"],
            row.due_date,
        )
        frappe.db.set_value(
            "RONIX Contract Milestone",
            row.name,
            {
                "invoiced_amount": _money(values["invoiced_amount"]),
                "collected_amount": _money(values["collected_amount"]),
                "retention_amount": _money(values["retention_amount"]),
                "withholding_amount": _money(values["withholding_amount"]),
                "status": status,
            },
            update_modified=False,
        )


def _money(value):
    return round(flt(value), 2)
