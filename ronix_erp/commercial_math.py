from __future__ import annotations

from datetime import date, datetime


def calculate_contract_balance_snapshot(
    contract_value,
    claimed_amount=0,
    invoiced_amount=0,
    collected_amount=0,
    retention_held=0,
    withholding_held=0,
    outstanding_amount=0,
):
    """Return normalized commercial balances in the contract currency."""
    values = {
        "claimed_amount": _money(claimed_amount),
        "invoiced_amount": _money(invoiced_amount),
        "collected_amount": _money(collected_amount),
        "retention_held": _money(retention_held),
        "withholding_held": _money(withholding_held),
        "outstanding_amount": _money(outstanding_amount),
    }
    values["remaining_contract_value"] = _money(
        max(float(contract_value or 0) - values["claimed_amount"], 0)
    )
    return values


def get_milestone_status(
    amount,
    invoiced_amount=0,
    collected_amount=0,
    retention_amount=0,
    withholding_amount=0,
    due_date=None,
    today=None,
):
    amount = _money(amount)
    invoiced_amount = _money(invoiced_amount)
    collected_amount = _money(collected_amount)
    retention_amount = _money(retention_amount)
    withholding_amount = _money(withholding_amount)
    settled_amount = _money(
        collected_amount + retention_amount + withholding_amount
    )

    if amount and settled_amount >= amount - 0.01:
        return "Collected with Retention" if retention_amount else "Collected"
    if settled_amount > 0:
        return "Partially Collected"
    if invoiced_amount > 0:
        return "Invoiced"
    if due_date and _as_date(due_date) <= _as_date(today or date.today()):
        return "Due"
    return "Planned"


def _money(value):
    return round(float(value or 0), 2)


def _as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))
