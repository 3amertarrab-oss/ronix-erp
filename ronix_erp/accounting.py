import frappe
from frappe import _
from frappe.utils import flt


def get_accounting_settings(company, claim=None):
    settings_name = frappe.db.exists("RONIX Accounting Settings", {"company": company})
    if not settings_name:
        frappe.throw(
            _(
                "Create RONIX Accounting Settings for Company {0} before submitting "
                "or collecting this invoice."
            ).format(company)
        )

    settings = frappe.get_doc("RONIX Accounting Settings", settings_name)
    if not settings.default_collection_account:
        frappe.throw(
            _(
                "Set the Default Collection Bank / Cash Account in "
                "RONIX Accounting Settings."
            )
        )
    if claim and flt(claim.get("retention_amount")) and not settings.retention_receivable_account:
        frappe.throw(
            _("Set the Retention Receivable Account in RONIX Accounting Settings.")
        )
    if (
        claim
        and flt(claim.get("withholding_amount"))
        and not settings.withholding_receivable_account
    ):
        frappe.throw(
            _("Set the Withholding Receivable Account in RONIX Accounting Settings.")
        )
    return settings


def get_claim_adjustments(claim, settings):
    adjustments = []
    retention = flt(claim.get("retention_amount"))
    withholding = flt(claim.get("withholding_amount"))
    if retention:
        adjustments.append(
            {
                "account": settings.retention_receivable_account,
                "amount": retention,
                "description": _("RONIX retention receivable for Claim {0}").format(claim.name),
            }
        )
    if withholding:
        adjustments.append(
            {
                "account": settings.withholding_receivable_account,
                "amount": withholding,
                "description": _("RONIX withholding receivable for Claim {0}").format(claim.name),
            }
        )
    return adjustments
