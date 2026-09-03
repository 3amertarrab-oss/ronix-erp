from __future__ import annotations

import json

import frappe


def record_document_event(doc, event_type):
    """Persist an immutable source-to-target trace for controlled RONIX vouchers."""
    from frappe.utils import now_datetime

    source_doctype, source_name = _resolve_source(doc)
    if not source_name:
        return None

    event_key = f"{doc.doctype}:{doc.name}:{event_type}"
    if frappe.db.exists("RONIX Audit Event", event_key):
        return event_key

    project = doc.get("ronix_project") or doc.get("project") or _row_value(doc, "project")
    contract = doc.get("ronix_contract")
    frappe.get_doc(
        {
            "doctype": "RONIX Audit Event",
            "event_key": event_key,
            "event_type": event_type,
            "source_doctype": source_doctype,
            "source_name": source_name,
            "target_doctype": doc.doctype,
            "target_name": doc.name,
            "company": doc.get("company"),
            "project": project,
            "contract": contract,
            "actor": frappe.session.user,
            "event_time": now_datetime(),
            "snapshot_json": json.dumps(_snapshot(doc), ensure_ascii=False, sort_keys=True),
        }
    ).insert(ignore_permissions=True)
    return event_key


def _resolve_source(doc):
    for fieldname, doctype in (
        ("ronix_claim", "RONIX Claim"),
        ("ronix_sales_invoice", "Sales Invoice"),
        ("ronix_contract", "RONIX Contract"),
        ("ronix_project", "Project"),
        ("project", "Project"),
    ):
        value = doc.get(fieldname)
        if value:
            return doctype, value
    project = _row_value(doc, "project")
    return ("Project", project) if project else (None, None)


def _row_value(doc, fieldname):
    for table in ("items", "accounts"):
        for row in doc.get(table) or []:
            value = row.get(fieldname)
            if value:
                return value
    return None


def _snapshot(doc):
    return {
        "docstatus": doc.docstatus,
        "project": doc.get("ronix_project") or doc.get("project") or _row_value(doc, "project"),
        "contract": doc.get("ronix_contract"),
        "modified": str(doc.get("modified") or ""),
    }
