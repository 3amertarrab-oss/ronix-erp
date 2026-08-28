import frappe
from frappe import _


PROJECT_COST_CENTER_GROUP = "RONIX Projects"


def validate_project(doc, method=None):
    if not doc.get("ronix_contract"):
        return

    contract = frappe.db.get_value(
        "RONIX Contract",
        doc.ronix_contract,
        ["customer", "quotation", "company"],
        as_dict=True,
    )
    if not contract:
        frappe.throw(_("Linked RONIX Contract does not exist."))
    if doc.customer and doc.customer != contract.customer:
        frappe.throw(_("Project customer must match the RONIX Contract customer."))
    if doc.get("ronix_quotation") and doc.ronix_quotation != contract.quotation:
        frappe.throw(_("Project quotation must match the RONIX Contract quotation."))
    if doc.company and doc.company != contract.company:
        frappe.throw(_("Project company must match the RONIX Contract company."))


def after_insert_project(doc, method=None):
    if not doc.get("ronix_contract"):
        return

    cost_center = ensure_project_cost_center(doc)

    existing_project = frappe.db.get_value("RONIX Contract", doc.ronix_contract, "project")
    if existing_project and existing_project != doc.name:
        frappe.throw(_("RONIX Contract is already linked to Project {0}.").format(existing_project))

    frappe.db.set_value("RONIX Contract", doc.ronix_contract, "project", doc.name)
    if doc.get("ronix_quotation"):
        frappe.db.set_value(
            "Quotation",
            doc.ronix_quotation,
            {
                "ronix_project": doc.name,
                "ronix_commercial_status": "Project Active",
            },
        )
    if cost_center and doc.get("ronix_cost_center") != cost_center:
        doc.ronix_cost_center = cost_center


def ensure_project_cost_center(project):
    """Create or reuse a non-group Cost Center dedicated to a RONIX Project."""
    doc = frappe.get_doc("Project", project) if isinstance(project, str) else project
    if not doc.get("ronix_contract"):
        return None
    if doc.get("ronix_cost_center") and frappe.db.exists(
        "Cost Center", doc.ronix_cost_center
    ):
        return doc.ronix_cost_center

    parent_cost_center = ensure_project_cost_center_group(doc.company)

    cost_center_name = (doc.name or doc.project_name or "RONIX Project")[:120]
    cost_center = frappe.db.exists(
        "Cost Center",
        {
            "cost_center_name": cost_center_name,
            "company": doc.company,
            "is_group": 0,
        },
    )
    if not cost_center:
        cost_center_doc = frappe.get_doc(
            {
                "doctype": "Cost Center",
                "cost_center_name": cost_center_name,
                "parent_cost_center": parent_cost_center,
                "company": doc.company,
                "is_group": 0,
            }
        )
        cost_center_doc.insert(ignore_permissions=True)
        cost_center = cost_center_doc.name

    frappe.db.set_value(
        "Project",
        doc.name,
        "ronix_cost_center",
        cost_center,
        update_modified=False,
    )
    return cost_center


def ensure_project_cost_center_group(company):
    """Return a valid group Cost Center for RONIX project children."""
    default_cost_center = frappe.get_cached_value("Company", company, "cost_center")
    default_row = _get_cost_center(default_cost_center)

    tree_parent = None
    if _is_usable_group(default_row, company):
        tree_parent = default_row.name
    elif default_row and default_row.parent_cost_center:
        parent_row = _get_cost_center(default_row.parent_cost_center)
        if _is_usable_group(parent_row, company):
            tree_parent = parent_row.name

    if not tree_parent:
        tree_parent = frappe.db.get_value(
            "Cost Center",
            {"company": company, "is_group": 1, "disabled": 0},
            "name",
            order_by="lft asc",
        )
    if not tree_parent:
        frappe.throw(
            _("Company {0} requires an enabled group Cost Center for projects.").format(
                company
            )
        )

    existing_group = frappe.db.get_value(
        "Cost Center",
        {"cost_center_name": PROJECT_COST_CENTER_GROUP, "company": company},
        ["name", "is_group", "disabled"],
        as_dict=True,
    )
    if existing_group:
        if not existing_group.is_group or existing_group.disabled:
            frappe.throw(
                _(
                    "Cost Center {0} must be an enabled group before project migration."
                ).format(existing_group.name)
            )
        return existing_group.name

    group_doc = frappe.get_doc(
        {
            "doctype": "Cost Center",
            "cost_center_name": PROJECT_COST_CENTER_GROUP,
            "parent_cost_center": tree_parent,
            "company": company,
            "is_group": 1,
        }
    )
    group_doc.insert(ignore_permissions=True)
    return group_doc.name


def _get_cost_center(name):
    if not name:
        return None
    return frappe.db.get_value(
        "Cost Center",
        name,
        ["name", "parent_cost_center", "company", "is_group", "disabled"],
        as_dict=True,
    )


def _is_usable_group(cost_center, company):
    return bool(
        cost_center
        and cost_center.company == company
        and cost_center.is_group
        and not cost_center.disabled
    )


def ensure_all_ronix_project_cost_centers():
    for project_name in frappe.get_all(
        "Project",
        filters={"ronix_contract": ["is", "set"]},
        pluck="name",
    ):
        ensure_project_cost_center(project_name)
