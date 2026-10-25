import frappe
from frappe import _
from frappe.model.document import Document


class RONIXAccountingSettings(Document):
    def validate(self):
        self._validate_account(
            "default_collection_account",
            allowed_account_types=("Bank", "Cash"),
        )
        self._validate_account("retention_receivable_account", require_asset=True)
        self._validate_account("withholding_receivable_account", require_asset=True)

    def _validate_account(
        self,
        fieldname,
        allowed_account_types=None,
        require_asset=False,
    ):
        account = self.get(fieldname)
        if not account:
            return

        values = frappe.db.get_value(
            "Account",
            account,
            ["company", "is_group", "disabled", "root_type", "account_type"],
            as_dict=True,
        )
        if not values:
            frappe.throw(_("Account {0} does not exist.").format(account))
        if values.company != self.company:
            frappe.throw(
                _("Account {0} must belong to Company {1}.").format(
                    account, self.company
                )
            )
        if values.is_group:
            frappe.throw(_("Account {0} must be a ledger account, not a group.").format(account))
        if values.disabled:
            frappe.throw(_("Account {0} is disabled.").format(account))
        if allowed_account_types and values.account_type not in allowed_account_types:
            frappe.throw(
                _("Account {0} must be a Bank or Cash account.").format(account)
            )
        if require_asset and values.root_type != "Asset":
            frappe.throw(_("Account {0} must be an Asset account.").format(account))
