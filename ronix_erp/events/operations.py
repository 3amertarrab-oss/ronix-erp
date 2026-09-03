from __future__ import annotations

import frappe
from frappe import _

from ronix_erp.audit import record_document_event
from ronix_erp.events.project import ensure_project_cost_center, ensure_project_warehouses


CHILD_TABLES = ("items", "supplied_items", "expenses", "accounts")
WAREHOUSE_FIELDS = (
    "set_warehouse",
    "set_from_warehouse",
    "from_warehouse",
    "to_warehouse",
    "source_warehouse",
    "wip_warehouse",
    "fg_warehouse",
)
ROW_WAREHOUSE_FIELDS = ("warehouse", "from_warehouse", "s_warehouse", "t_warehouse")


def validate_operational_document(doc, method=None):
    """Keep every RONIX operational voucher on one project and cost center."""
    project_name = _resolve_project(doc)
    if not project_name:
        if doc.get("ronix_contract"):
            frappe.throw(_("A RONIX Contract link requires a Project."))
        return

    project = frappe.db.get_value(
        "Project",
        project_name,
        [
            "name",
            "company",
            "ronix_contract",
            "ronix_cost_center",
            "ronix_warehouse_group",
            "ronix_raw_materials_warehouse",
            "ronix_wip_warehouse",
            "ronix_finished_goods_warehouse",
            "ronix_scrap_warehouse",
        ],
        as_dict=True,
    )
    if not project or not project.ronix_contract:
        if doc.get("ronix_contract"):
            frappe.throw(_("The selected Project is not linked to that RONIX Contract."))
        return

    _validate_company(doc, project)
    _set_or_validate(doc, "ronix_contract", project.ronix_contract, _("RONIX Contract"))
    _set_or_validate(doc, "ronix_project", project.name, _("Project"))
    _set_or_validate(doc, "project", project.name, _("Project"))

    cost_center = project.ronix_cost_center or ensure_project_cost_center(project.name)
    warehouses = ensure_project_warehouses(project.name)
    allowed_warehouses = {value for value in warehouses.values() if value}
    _apply_document_defaults(doc, warehouses)
    _validate_document_warehouses(doc, project.name, allowed_warehouses)

    for row in _iter_rows(doc):
        _set_or_validate(row, "project", project.name, _("Project"))
        _set_or_validate(row, "cost_center", cost_center, _("Cost Center"))
        _validate_row_warehouses(row, project.name, allowed_warehouses)


def audit_created(doc, method=None):
    record_document_event(doc, "Created")


def audit_submitted(doc, method=None):
    record_document_event(doc, "Submitted")


def audit_cancelled(doc, method=None):
    record_document_event(doc, "Cancelled")


def _resolve_project(doc):
    candidates = [doc.get("ronix_project"), doc.get("project")]
    candidates.extend(row.get("project") for row in _iter_rows(doc))
    projects = {value for value in candidates if value}
    if len(projects) > 1:
        frappe.throw(_("A RONIX operational document cannot mix multiple Projects."))
    return next(iter(projects), None)


def _validate_company(doc, project):
    company = doc.get("company")
    if company and company != project.company:
        frappe.throw(_("Document company must match the RONIX Project company."))


def _set_or_validate(target, fieldname, expected, label):
    meta = getattr(target, "meta", None)
    if meta and not meta.has_field(fieldname):
        return
    current = target.get(fieldname)
    if current and current != expected:
        frappe.throw(_("{0} must match the linked RONIX Project.").format(label))
    if not current:
        target.set(fieldname, expected)


def _apply_document_defaults(doc, warehouses):
    defaults = {
        "set_warehouse": warehouses.get("ronix_raw_materials_warehouse"),
        "source_warehouse": warehouses.get("ronix_raw_materials_warehouse"),
        "wip_warehouse": warehouses.get("ronix_wip_warehouse"),
        "fg_warehouse": warehouses.get("ronix_finished_goods_warehouse"),
    }
    for fieldname, value in defaults.items():
        meta = getattr(doc, "meta", None)
        if value and meta and meta.has_field(fieldname) and not doc.get(fieldname):
            doc.set(fieldname, value)


def _validate_document_warehouses(doc, project, allowed):
    for fieldname in WAREHOUSE_FIELDS:
        value = doc.get(fieldname)
        if value:
            _validate_warehouse(value, project, allowed)


def _validate_row_warehouses(row, project, allowed):
    for fieldname in ROW_WAREHOUSE_FIELDS:
        value = row.get(fieldname)
        if value:
            _validate_warehouse(value, project, allowed)


def _validate_warehouse(warehouse, project, allowed):
    if warehouse in allowed:
        return
    owner = frappe.db.get_value("Warehouse", warehouse, "ronix_project")
    if owner and owner != project:
        frappe.throw(
            _("Warehouse {0} belongs to RONIX Project {1}, not {2}.").format(
                warehouse, owner, project
            )
        )


def _iter_rows(doc):
    rows = []
    for fieldname in CHILD_TABLES:
        rows.extend(doc.get(fieldname) or [])
    return rows
