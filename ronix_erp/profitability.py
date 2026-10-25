from __future__ import annotations

from typing import Iterable, Mapping


MONEY_FIELDS = (
    "contract_value",
    "invoiced_amount",
    "collected_amount",
    "retention_amount",
    "withholding_amount",
    "outstanding_amount",
    "actual_revenue",
    "actual_cost",
)


def enrich_project_rows(rows: Iterable[Mapping]) -> list[dict]:
    """Calculate report values without mutating database result objects."""
    enriched = []
    for source in rows:
        row = dict(source)
        for fieldname in MONEY_FIELDS:
            row[fieldname] = _money(row.get(fieldname))

        row["net_profit"] = _money(row["actual_revenue"] - row["actual_cost"])
        row["margin_percent"] = _percent(
            row["net_profit"], row["actual_revenue"]
        )
        row["unbilled_contract"] = _money(
            row["contract_value"] - row["invoiced_amount"]
        )
        row["uncollected_invoiced"] = _money(
            row["invoiced_amount"]
            - row["collected_amount"]
            - row["retention_amount"]
            - row["withholding_amount"]
        )
        enriched.append(row)
    return enriched


def _money(value) -> float:
    return round(float(value or 0), 2)


def _percent(numerator, denominator) -> float:
    denominator = float(denominator or 0)
    if not denominator:
        return 0.0
    return round(float(numerator or 0) * 100 / denominator, 2)
