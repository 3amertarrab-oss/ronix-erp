from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.utils import cint

from ronix_erp.migration.analyzer import analyze_snapshot


MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024
SAVEPOINT = "ronix_legacy_master_import"


@frappe.whitelist()
def preview_legacy_snapshot(snapshot: str | dict[str, Any]):
    """Validate a legacy snapshot without changing ERPNext data."""
    _require_system_manager()
    return analyze_snapshot(_parse_snapshot(snapshot))


@frappe.whitelist()
def import_legacy_master_data(
    snapshot: str | dict[str, Any],
    company: str,
    confirm_snapshot_hash: str,
    dry_run: int = 1,
    customer_group: str | None = None,
    territory: str | None = None,
):
    """Import Customers and Projects idempotently; never posts financial documents."""
    _require_system_manager()
    payload = _parse_snapshot(snapshot)
    report = analyze_snapshot(payload)
    if not report["valid"]:
        frappe.throw(_("Migration preview contains blocking errors."))
    if report["snapshot_hash"] != (confirm_snapshot_hash or "").strip():
        frappe.throw(_("Snapshot changed after preview. Run preview again before importing."))
    if not frappe.db.exists("Company", company):
        frappe.throw(_("Company {0} does not exist.").format(company))

    defaults = _resolve_customer_defaults(customer_group, territory)
    plan = _build_plan(payload)
    response = {"dry_run": bool(cint(dry_run)), "report": report, "plan": plan}
    if cint(dry_run):
        return response

    existing_run = frappe.db.exists(
        "RONIX Migration Run",
        {"snapshot_hash": report["snapshot_hash"], "run_status": "Completed"},
    )
    if existing_run:
        response.update({"already_imported": True, "migration_run": existing_run})
        return response

    frappe.db.savepoint(SAVEPOINT)
    try:
        result = _execute_master_import(payload, company, defaults)
        run = frappe.get_doc(
            {
                "doctype": "RONIX Migration Run",
                "company": company,
                "snapshot_hash": report["snapshot_hash"],
                "source_version": report.get("source_version"),
                "run_status": "Completed",
                "imported_customers": result["customers"]["created"],
                "skipped_customers": result["customers"]["skipped"],
                "imported_projects": result["projects"]["created"],
                "skipped_projects": result["projects"]["skipped"],
                "warning_count": len(report["warnings"]),
                "report_json": json.dumps(
                    {"report": report, "result": result},
                    ensure_ascii=False,
                    sort_keys=True,
                ),
            }
        ).insert(ignore_permissions=True)
    except Exception:
        frappe.db.rollback(save_point=SAVEPOINT)
        frappe.log_error(title="RONIX legacy master-data import failed")
        raise

    response.update({"result": result, "migration_run": run.name, "already_imported": False})
    return response


def _parse_snapshot(snapshot):
    if isinstance(snapshot, dict):
        return snapshot
    if not isinstance(snapshot, str):
        frappe.throw(_("Snapshot must be JSON text or an object."))
    if len(snapshot.encode("utf-8")) > MAX_SNAPSHOT_BYTES:
        frappe.throw(_("Snapshot is larger than the 10 MB safety limit."))
    try:
        payload = json.loads(snapshot)
    except json.JSONDecodeError:
        frappe.throw(_("Snapshot is not valid JSON."))
    if not isinstance(payload, dict):
        frappe.throw(_("Snapshot root must be a JSON object."))
    return payload


def _build_plan(payload):
    return {
        "customers": _count_plan("Customer", payload.get("customers") or []),
        "projects": _count_plan("Project", payload.get("projects") or []),
        "financial_documents": "blocked_until_reconciliation",
    }


def _count_plan(doctype, rows):
    result = {"create": 0, "skip_existing": 0, "skip_no_name": 0}
    for row in rows:
        if not str(row.get("name") or "").strip():
            result["skip_no_name"] += 1
        elif frappe.db.exists(doctype, {"ronix_legacy_id": row.get("id")}):
            result["skip_existing"] += 1
        else:
            result["create"] += 1
    return result


def _execute_master_import(payload, company, defaults):
    customer_map = {}
    customer_result = {"created": 0, "skipped": 0}
    project_result = {"created": 0, "skipped": 0}

    for row in payload.get("customers") or []:
        legacy_id = str(row.get("id") or "").strip()
        customer_name = str(row.get("name") or row.get("company") or "").strip()
        if not legacy_id or not customer_name:
            customer_result["skipped"] += 1
            continue
        existing = frappe.db.exists("Customer", {"ronix_legacy_id": legacy_id})
        if existing:
            customer_map[legacy_id] = existing
            customer_result["skipped"] += 1
            continue
        customer = frappe.get_doc(
            {
                "doctype": "Customer",
                "customer_name": customer_name,
                "customer_type": "Company",
                "customer_group": defaults["customer_group"],
                "territory": defaults["territory"],
                "ronix_legacy_id": legacy_id,
                "ronix_legacy_code": str(row.get("code") or "").strip(),
            }
        ).insert(ignore_permissions=True)
        customer_map[legacy_id] = customer.name
        customer_result["created"] += 1

    for row in payload.get("projects") or []:
        legacy_id = str(row.get("id") or "").strip()
        project_name = str(row.get("name") or "").strip()
        if not legacy_id or not project_name:
            project_result["skipped"] += 1
            continue
        if frappe.db.exists("Project", {"ronix_legacy_id": legacy_id}):
            project_result["skipped"] += 1
            continue
        customer = customer_map.get(str(row.get("customerId") or "").strip())
        project = frappe.get_doc(
            {
                "doctype": "Project",
                "project_name": project_name,
                "company": company,
                "customer": customer,
                "status": _project_status(row.get("status")),
                "expected_start_date": row.get("startDate") or None,
                "expected_end_date": row.get("dueDate") or None,
                "notes": str(row.get("notes") or "").strip(),
                "ronix_legacy_id": legacy_id,
                "ronix_legacy_code": str(row.get("code") or "").strip(),
            }
        ).insert(ignore_permissions=True)
        project_result["created"] += 1

    return {"customers": customer_result, "projects": project_result}


def _resolve_customer_defaults(customer_group, territory):
    customer_group = customer_group or frappe.db.get_single_value(
        "Selling Settings", "customer_group"
    )
    territory = territory or frappe.db.get_single_value("Selling Settings", "territory")
    if not customer_group or not frappe.db.exists("Customer Group", customer_group):
        frappe.throw(_("Select an existing default Customer Group before importing."))
    if not territory or not frappe.db.exists("Territory", territory):
        frappe.throw(_("Select an existing default Territory before importing."))
    return {"customer_group": customer_group, "territory": territory}


def _project_status(value):
    status = str(value or "").strip().casefold()
    if status in {"completed", "closed"}:
        return "Completed"
    if status in {"cancelled", "canceled"}:
        return "Cancelled"
    return "Open"


def _require_system_manager():
    frappe.only_for("System Manager")

