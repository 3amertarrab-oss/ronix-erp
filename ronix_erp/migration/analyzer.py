from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from typing import Any


COLLECTIONS = (
    "customers",
    "employees",
    "projects",
    "quotes",
    "contracts",
    "invoices",
    "receipts",
    "expenses",
)

REFERENCE_RULES = {
    "projects": {"customerId": "customers"},
    "quotes": {"customerId": "customers", "projectId": "projects"},
    "contracts": {
        "customerId": "customers",
        "projectId": "projects",
        "quoteId": "quotes",
    },
    "invoices": {
        "customerId": "customers",
        "projectId": "projects",
        "contractId": "contracts",
    },
    "receipts": {"customerId": "customers", "projectId": "projects"},
    "expenses": {"projectId": "projects", "employeeId": "employees"},
}


def canonical_snapshot_hash(snapshot: dict[str, Any]) -> str:
    raw = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def analyze_snapshot(snapshot: Any) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    if not isinstance(snapshot, dict):
        return {
            "valid": False,
            "snapshot_hash": None,
            "source_version": None,
            "counts": {},
            "totals": {},
            "errors": [_issue("INVALID_ROOT", "Snapshot must be a JSON object.")],
            "warnings": [],
        }

    collections: dict[str, list[dict[str, Any]]] = {}
    for collection in COLLECTIONS:
        value = snapshot.get(collection, [])
        if not isinstance(value, list):
            errors.append(
                _issue(
                    "INVALID_COLLECTION",
                    f"Collection {collection} must be an array.",
                    collection=collection,
                )
            )
            value = []
        rows = []
        for index, row in enumerate(value):
            if isinstance(row, dict):
                rows.append(row)
            else:
                errors.append(
                    _issue(
                        "INVALID_ROW",
                        f"Row {index + 1} in {collection} must be an object.",
                        collection=collection,
                        row=index + 1,
                    )
                )
        collections[collection] = rows

    indexes: dict[str, set[str]] = {}
    for collection, rows in collections.items():
        ids = []
        for index, row in enumerate(rows):
            legacy_id = _clean(row.get("id"))
            if not legacy_id:
                errors.append(
                    _issue(
                        "MISSING_ID",
                        f"Row {index + 1} in {collection} has no legacy id.",
                        collection=collection,
                        row=index + 1,
                    )
                )
            else:
                ids.append(legacy_id)
        duplicates = sorted(value for value, count in Counter(ids).items() if count > 1)
        for legacy_id in duplicates:
            errors.append(
                _issue(
                    "DUPLICATE_ID",
                    f"Duplicate legacy id {legacy_id} in {collection}.",
                    collection=collection,
                    legacy_id=legacy_id,
                )
            )
        indexes[collection] = set(ids)

    _validate_unique_business_keys(collections, errors)
    _validate_references(collections, indexes, errors)
    _validate_receipt_allocations(collections, indexes, errors)
    _detect_low_quality_master_data(collections, warnings)
    _detect_non_finite_amounts(collections, errors)

    counts = {collection: len(rows) for collection, rows in collections.items()}
    totals = {
        "quotation_value": _document_total(collections["quotes"]),
        "contract_value": _document_total(collections["contracts"]),
        "invoice_value": _document_total(collections["invoices"]),
        "receipt_value": _amount_total(collections["receipts"]),
        "expense_value": _amount_total(collections["expenses"]),
    }

    return {
        "valid": not errors,
        "snapshot_hash": canonical_snapshot_hash(snapshot),
        "source_version": _clean((snapshot.get("meta") or {}).get("version")) or None,
        "counts": counts,
        "totals": totals,
        "errors": errors,
        "warnings": warnings,
    }


def _validate_unique_business_keys(collections, errors):
    for collection, fieldname in (
        ("customers", "code"),
        ("projects", "code"),
        ("quotes", "number"),
        ("contracts", "number"),
        ("invoices", "number"),
        ("receipts", "number"),
        ("expenses", "number"),
    ):
        values = [_clean(row.get(fieldname)) for row in collections[collection]]
        duplicates = sorted(value for value, count in Counter(filter(None, values)).items() if count > 1)
        for value in duplicates:
            errors.append(
                _issue(
                    "DUPLICATE_BUSINESS_KEY",
                    f"Duplicate {fieldname} {value} in {collection}.",
                    collection=collection,
                    field=fieldname,
                    value=value,
                )
            )


def _validate_references(collections, indexes, errors):
    for collection, rules in REFERENCE_RULES.items():
        for row_number, row in enumerate(collections[collection], start=1):
            for fieldname, target_collection in rules.items():
                reference = _clean(row.get(fieldname))
                if reference and reference not in indexes[target_collection]:
                    errors.append(
                        _issue(
                            "BROKEN_REFERENCE",
                            f"{collection}.{fieldname} references a missing {target_collection} record.",
                            collection=collection,
                            row=row_number,
                            field=fieldname,
                            value=reference,
                        )
                    )


def _validate_receipt_allocations(collections, indexes, errors):
    for row_number, receipt in enumerate(collections["receipts"], start=1):
        allocations = receipt.get("allocations") or []
        if not isinstance(allocations, list):
            errors.append(
                _issue(
                    "INVALID_ALLOCATIONS",
                    "Receipt allocations must be an array.",
                    collection="receipts",
                    row=row_number,
                )
            )
            continue
        allocated = 0.0
        for allocation in allocations:
            if not isinstance(allocation, dict):
                continue
            invoice_id = _clean(allocation.get("invoiceId"))
            if invoice_id and invoice_id not in indexes["invoices"]:
                errors.append(
                    _issue(
                        "BROKEN_ALLOCATION",
                        "Receipt allocation references a missing invoice.",
                        collection="receipts",
                        row=row_number,
                        value=invoice_id,
                    )
                )
            allocated += _number(allocation.get("amount"))
        receipt_amount = _number(receipt.get("amount"))
        if allocated > receipt_amount + 0.01:
            errors.append(
                _issue(
                    "OVER_ALLOCATED_RECEIPT",
                    "Receipt allocations exceed the receipt amount.",
                    collection="receipts",
                    row=row_number,
                    amount=receipt_amount,
                    allocated=round(allocated, 2),
                )
            )


def _detect_low_quality_master_data(collections, warnings):
    for collection in ("customers", "employees", "projects"):
        for row_number, row in enumerate(collections[collection], start=1):
            name = _clean(row.get("name"))
            if not name:
                warnings.append(
                    _issue(
                        "MISSING_NAME",
                        f"{collection} row {row_number} has no name and will not be imported.",
                        collection=collection,
                        row=row_number,
                    )
                )
            elif _looks_like_placeholder(name):
                warnings.append(
                    _issue(
                        "POSSIBLE_TEST_DATA",
                        f"Possible test record: {name}",
                        collection=collection,
                        row=row_number,
                        legacy_id=_clean(row.get("id")),
                    )
                )


def _detect_non_finite_amounts(collections, errors):
    for collection in ("quotes", "contracts", "invoices", "receipts", "expenses"):
        for row_number, row in enumerate(collections[collection], start=1):
            candidates = [row.get("amount")]
            for line in row.get("lines") or []:
                if isinstance(line, dict):
                    candidates.extend((line.get("qty"), line.get("unitPrice"), line.get("taxRate")))
            for value in candidates:
                if value in (None, ""):
                    continue
                try:
                    number = float(value)
                except (TypeError, ValueError):
                    number = math.nan
                if not math.isfinite(number):
                    errors.append(
                        _issue(
                            "INVALID_NUMBER",
                            f"Non-finite monetary value in {collection} row {row_number}.",
                            collection=collection,
                            row=row_number,
                        )
                    )
                    break


def _document_total(documents):
    return round(sum(_line_total(line) for doc in documents for line in (doc.get("lines") or [])), 2)


def _line_total(line):
    if not isinstance(line, dict):
        return 0.0
    quantity = _number(line.get("qty"))
    rate = _number(line.get("unitPrice", line.get("rate")))
    discount = _number(line.get("discountPct"))
    tax = _number(line.get("taxRate"))
    net = quantity * rate * max(0.0, 1 - discount / 100)
    return net * (1 + tax / 100)


def _amount_total(rows):
    return round(sum(_number(row.get("amount")) for row in rows), 2)


def _number(value):
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def _looks_like_placeholder(name):
    compact = re.sub(r"\s+", "", name).casefold()
    if len(compact) < 2:
        return True
    if re.fullmatch(r"([a-z0-9])\1{2,}", compact):
        return True
    return compact in {"test", "demo", "sample", "asdf", "asasas", "sa", "ass"}


def _clean(value):
    return str(value or "").strip()


def _issue(code, message, **context):
    return {"code": code, "message": message, **context}

