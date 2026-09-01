import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt

from ronix_erp.accounting import get_accounting_settings, get_claim_adjustments


@frappe.whitelist()
def get_workspace_summary():
    """Return permission-aware counters for the RONIX operational hub."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Please sign in to open RONIX ERP."), frappe.PermissionError)

    return {
        "projects": _permitted_count("Project"),
        "contracts": _permitted_count(
            "RONIX Contract", {"contract_status": ["in", ["Signed", "Active"]]}
        ),
        "claims": _permitted_count("RONIX Claim", {"docstatus": ["<", 2]}),
        "invoices": _permitted_count("Sales Invoice", {"docstatus": 1}),
    }


@frappe.whitelist()
def get_dashboard_data():
    """Return live, permission-aware data for the RONIX HTML dashboard."""
    from frappe.utils import get_first_day, nowdate

    if frappe.session.user == "Guest":
        frappe.throw(_("Please sign in to open RONIX ERP."), frappe.PermissionError)

    company = frappe.defaults.get_user_default("Company")
    if not company and frappe.has_permission("Company", ptype="read"):
        companies = frappe.get_list(
            "Company", fields=["name"], order_by="is_group asc, modified desc", page_length=1
        )
        company = companies[0].name if companies else None
    currency = (
        frappe.get_cached_value("Company", company, "default_currency")
        if company
        else "EGP"
    ) or "EGP"

    financial_rows = _get_dashboard_financial_rows(company)
    financial_by_project = {row.get("project"): row for row in financial_rows}
    projects = _get_dashboard_projects(company, financial_by_project)
    hours_by_project = _get_project_hours([row["name"] for row in projects])
    for row in projects:
        row["hours"] = flt(hours_by_project.get(row["name"]))

    open_invoices = _get_open_invoices(company)
    today = nowdate()
    overdue_invoices = [
        row for row in open_invoices if row.get("due_date") and str(row.due_date) < today
    ]
    quotation_followup = _permitted_count(
        "Quotation",
        {
            "docstatus": ["<", 2],
            "status": ["in", ["Draft", "Open", "Replied"]],
        },
    )
    portfolio = {
        "contract_value": sum(flt(row.get("contract_value")) for row in projects),
        "outstanding_amount": sum(flt(row.get("outstanding_amount")) for row in projects),
        "actual_cost": sum(flt(row.get("actual_cost")) for row in projects),
        "expected_profit": sum(flt(row.get("expected_profit")) for row in projects),
        "hours": sum(flt(row.get("hours")) for row in projects),
    }
    return {
        "company": company,
        "currency": currency,
        "summary": {
            "open_receivables": sum(
                flt(row.outstanding_amount) * (flt(row.conversion_rate) or 1)
                for row in open_invoices
            ),
            "open_invoice_count": len(open_invoices),
            "overdue_receivables": sum(
                flt(row.outstanding_amount) * (flt(row.conversion_rate) or 1)
                for row in overdue_invoices
            ),
            "overdue_invoice_count": len(overdue_invoices),
            "collected_this_month": _get_collected_this_month(company),
            "quotation_followup": quotation_followup or 0,
            "month_label": str(get_first_day(today))[:7],
        },
        "portfolio": portfolio,
        "projects": projects,
    }


def _get_dashboard_financial_rows(company):
    if not company or not frappe.has_permission("Project", ptype="read"):
        return []
    try:
        from ronix_erp.ronix_erp.report.ronix_project_profitability.ronix_project_profitability import (
            execute as profitability_execute,
        )

        return profitability_execute({"company": company})[1]
    except (frappe.PermissionError, frappe.DoesNotExistError):
        return []


def _get_dashboard_projects(company, financial_by_project):
    if not company or not frappe.has_permission("Project", ptype="read"):
        return []
    rows = frappe.get_list(
        "Project",
        filters={"company": company},
        fields=[
            "name",
            "project_name",
            "status",
            "percent_complete",
            "customer",
            "ronix_contract",
        ],
        order_by="modified desc",
        page_length=12,
    )
    projects = []
    for row in rows:
        financial = financial_by_project.get(row.name, {})
        contract_value = flt(financial.get("contract_value"))
        actual_cost = flt(financial.get("actual_cost"))
        projects.append(
            {
                "name": row.name,
                "code": row.name,
                "project_name": row.project_name,
                "status": row.status,
                "progress": flt(row.percent_complete),
                "customer": row.customer,
                "contract": row.ronix_contract,
                "contract_value": contract_value,
                "outstanding_amount": flt(financial.get("outstanding_amount")),
                "actual_cost": actual_cost,
                "expected_profit": contract_value - actual_cost,
            }
        )
    return projects


def _get_open_invoices(company):
    if not company or not frappe.has_permission("Sales Invoice", ptype="read"):
        return []
    return frappe.get_list(
        "Sales Invoice",
        filters={
            "company": company,
            "docstatus": 1,
            "outstanding_amount": [">", 0],
        },
        fields=["name", "due_date", "outstanding_amount", "conversion_rate"],
        page_length=100000,
    )


def _get_collected_this_month(company):
    from frappe.utils import get_first_day, nowdate

    if not company or not frappe.has_permission("Payment Entry", ptype="read"):
        return 0
    rows = frappe.get_list(
        "Payment Entry",
        filters={
            "company": company,
            "docstatus": 1,
            "payment_type": "Receive",
            "posting_date": ["between", [get_first_day(nowdate()), nowdate()]],
        },
        fields=["base_received_amount"],
        page_length=100000,
    )
    return sum(flt(row.base_received_amount) for row in rows)


def _get_project_hours(project_names):
    if not project_names or not frappe.has_permission("Timesheet", ptype="read"):
        return {}
    rows = frappe.db.sql(
        """
        SELECT detail.project, COALESCE(SUM(detail.hours), 0) AS hours
          FROM `tabTimesheet Detail` detail
          JOIN `tabTimesheet` timesheet ON timesheet.name = detail.parent
         WHERE timesheet.docstatus = 1
           AND detail.project IN %(projects)s
         GROUP BY detail.project
        """,
        {"projects": tuple(project_names)},
        as_dict=True,
    )
    return {row.project: row.hours for row in rows}


@frappe.whitelist()
def get_executive_dashboard():
    """Return the live, permission-aware data used by the RONIX executive workspace."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Please sign in to open RONIX ERP."), frappe.PermissionError)

    from frappe.utils import get_first_day, nowdate
    from ronix_erp.ronix_erp.report.ronix_project_profitability.ronix_project_profitability import (
        execute as execute_profitability_report,
    )

    company_row = _get_dashboard_company()
    company = company_row.name
    currency = company_row.default_currency

    report_result = execute_profitability_report({"company": company})
    project_rows = report_result[1] or []
    project_names = [row.get("project") for row in project_rows if row.get("project")]
    project_details = {}
    if project_names:
        project_details = {
            row.name: row
            for row in frappe.get_list(
                "Project",
                filters={"name": ["in", project_names]},
                fields=[
                    "name",
                    "percent_complete",
                    "expected_start_date",
                    "expected_end_date",
                ],
                page_length=1000,
            )
        }

    projects = []
    for row in project_rows:
        detail = project_details.get(row.get("project"), {})
        projects.append(
            {
                "name": row.get("project"),
                "project_name": row.get("project_name") or row.get("project"),
                "customer": row.get("customer"),
                "status": row.get("project_status"),
                "contract": row.get("ronix_contract"),
                "percent_complete": flt(detail.get("percent_complete")),
                "expected_start_date": detail.get("expected_start_date"),
                "expected_end_date": detail.get("expected_end_date"),
                "contract_value": flt(row.get("contract_value")),
                "invoiced_amount": flt(row.get("invoiced_amount")),
                "collected_amount": flt(row.get("collected_amount")),
                "outstanding_amount": flt(row.get("outstanding_amount")),
                "actual_revenue": flt(row.get("actual_revenue")),
                "actual_cost": flt(row.get("actual_cost")),
                "net_profit": flt(row.get("net_profit")),
                "margin_percent": flt(row.get("margin_percent")),
            }
        )

    company_filter = {"company": company}
    today = nowdate()
    overdue_invoices = _dashboard_rows(
        "Sales Invoice",
        {
            **company_filter,
            "docstatus": 1,
            "outstanding_amount": [">", 0],
            "due_date": ["<", today],
        },
        ["name", "outstanding_amount", "conversion_rate"],
    )
    month_collections = _dashboard_rows(
        "Payment Entry",
        {
            **company_filter,
            "docstatus": 1,
            "payment_type": "Receive",
            "ronix_claim": ["is", "set"],
            "posting_date": ["between", [get_first_day(today), today]],
        },
        ["name", "base_received_amount"],
    )

    counts = {
        "quotations": _permitted_count(
            "Quotation", {**company_filter, "docstatus": ["<", 2]}
        ),
        "contracts": _permitted_count(
            "RONIX Contract", {**company_filter, "docstatus": ["<", 2]}
        ),
        "claims": _permitted_count(
            "RONIX Claim", {**company_filter, "docstatus": ["<", 2]}
        ),
        "collections": _permitted_count(
            "Payment Entry",
            {
                **company_filter,
                "docstatus": 1,
                "payment_type": "Receive",
                "ronix_claim": ["is", "set"],
            },
        ),
        "projects": len(projects),
        "invoices": _permitted_count(
            "Sales Invoice", {**company_filter, "docstatus": 1}
        ),
        "overdue_invoices": len(overdue_invoices),
    }

    pending_quotations = _permitted_count(
        "Quotation", {**company_filter, "docstatus": 0}
    )
    totals = {
        "contract_value": _sum_dashboard_rows(projects, "contract_value"),
        "collected_amount": _sum_dashboard_rows(projects, "collected_amount"),
        "outstanding_amount": _sum_dashboard_rows(projects, "outstanding_amount"),
        "actual_cost": _sum_dashboard_rows(projects, "actual_cost"),
        "net_profit": _sum_dashboard_rows(projects, "net_profit"),
    }

    return {
        "company": company,
        "currency": currency,
        "user_name": frappe.get_cached_value("User", frappe.session.user, "full_name")
        or frappe.session.user,
        "counts": counts,
        "kpis": {
            "overdue_amount": sum(
                flt(row.outstanding_amount) * (flt(row.conversion_rate) or 1)
                for row in overdue_invoices
            ),
            "outstanding_amount": totals["outstanding_amount"],
            "collected_this_month": sum(
                flt(row.base_received_amount) for row in month_collections
            ),
            "pending_quotations": pending_quotations,
        },
        "totals": totals,
        "projects": projects[:12],
    }


def _get_dashboard_company():
    preferred_company = frappe.defaults.get_user_default("Company")
    filters = {"name": preferred_company} if preferred_company else {}
    companies = frappe.get_list(
        "Company",
        filters=filters,
        fields=["name", "default_currency"],
        page_length=1,
    )
    if not companies and preferred_company:
        companies = frappe.get_list(
            "Company", fields=["name", "default_currency"], page_length=1
        )
    if not companies:
        frappe.throw(_("No permitted Company is available for the RONIX dashboard."))
    return companies[0]


def _dashboard_rows(doctype, filters, fields):
    if not frappe.has_permission(doctype, ptype="read"):
        return []
    return frappe.get_list(
        doctype,
        filters=filters,
        fields=fields,
        page_length=100000,
    )


def _sum_dashboard_rows(rows, fieldname):
    return sum(flt(row.get(fieldname)) for row in rows)


def _permitted_count(doctype, filters=None):
    if not frappe.has_permission(doctype, ptype="read"):
        return None

    # frappe.get_list applies user permissions, unlike frappe.get_all/db.count.
    return len(
        frappe.get_list(
            doctype,
            filters=filters or {},
            fields=["name"],
            page_length=100000,
        )
    )


@frappe.whitelist()
def make_contract_from_quotation(source_name, target_doc=None):
    quotation = frappe.get_doc("Quotation", source_name)
    _require_permissions(quotation, "RONIX Contract")
    if quotation.docstatus != 1:
        frappe.throw(_("Only a submitted Quotation can be converted to a RONIX Contract."))
    if quotation.quotation_to != "Customer":
        frappe.throw(_("The Quotation must be issued to a Customer before contract conversion."))

    existing = frappe.db.exists(
        "RONIX Contract", {"quotation": source_name, "docstatus": ["<", 2]}
    )
    if existing:
        frappe.throw(
            _("Quotation {0} is already linked to Contract {1}.").format(
                source_name, existing
            )
        )

    def set_contract_item_values(source, target, source_parent):
        target.description = source.description or source.item_name or source.item_code

    def set_missing_values(source, target):
        target.title = source.get("title") or source_name
        target.customer = source.party_name
        target.contract_date = source.transaction_date
        target.currency = source.currency
        target.exchange_rate = source.conversion_rate or 1
        target.contract_status = "Draft"
        target.set("payment_schedule", [])
        target.run_method("set_totals")

    return get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "RONIX Contract",
                "field_map": {
                    "name": "quotation",
                    "company": "company",
                    "party_name": "customer",
                    "currency": "currency",
                    "conversion_rate": "exchange_rate",
                    "transaction_date": "contract_date",
                },
            },
            "Quotation Item": {
                "doctype": "RONIX Contract Item",
                "postprocess": set_contract_item_values,
                "field_map": {
                    "item_code": "item_code",
                    "item_name": "item_name",
                    "description": "description",
                    "qty": "qty",
                    "uom": "uom",
                    "rate": "rate",
                    "amount": "amount",
                },
            },
        },
        target_doc,
        set_missing_values,
    )


@frappe.whitelist()
def make_project_from_contract(source_name):
    contract = frappe.get_doc("RONIX Contract", source_name)
    _require_permissions(contract, "Project")
    if contract.docstatus != 1 or contract.contract_status not in ("Signed", "Active"):
        frappe.throw(_("Only a submitted Signed or Active Contract can create a Project."))
    if contract.project:
        frappe.throw(_("Contract is already linked to Project {0}.").format(contract.project))

    project = frappe.new_doc("Project")
    project.project_name = contract.title
    project.customer = contract.customer
    project.company = contract.company
    project.expected_start_date = contract.start_date
    project.expected_end_date = contract.end_date
    project.ronix_contract = contract.name
    project.ronix_quotation = contract.quotation
    return project


@frappe.whitelist()
def make_claim_from_contract(source_name):
    contract = frappe.get_doc("RONIX Contract", source_name)
    _require_permissions(contract, "RONIX Claim")
    if contract.docstatus != 1 or contract.contract_status not in ("Signed", "Active"):
        frappe.throw(_("Only a submitted Signed or Active Contract can create a Claim."))
    if not contract.project:
        frappe.throw(_("Create and link the Contract Project before creating a Claim."))

    claim = frappe.new_doc("RONIX Claim")
    claim.company = contract.company
    claim.customer = contract.customer
    claim.contract = contract.name
    claim.project = contract.project
    claim.currency = contract.currency
    claim.claim_status = "Draft"
    claim.retention_percent = contract.retention_percent
    if len(contract.payment_schedule) == 1:
        claim.payment_milestone = contract.payment_schedule[0].milestone
    for item in contract.items:
        claim.append(
            "items",
            {
                "description": item.description,
                "qty": item.qty,
                "uom": item.uom,
                "rate": item.rate,
                "amount": item.amount,
                "contract_item_reference": item.name,
            },
        )
    claim.run_method("set_totals")
    return claim


@frappe.whitelist()
def make_sales_invoice_from_claim(source_name):
    claim = frappe.get_doc("RONIX Claim", source_name)
    _require_permissions(claim, "Sales Invoice")
    if claim.docstatus != 1 or claim.claim_status != "Approved":
        frappe.throw(_("Only a submitted Approved Claim can create a Sales Invoice."))

    frappe.db.sql(
        "SELECT name FROM `tabRONIX Claim` WHERE name = %s FOR UPDATE",
        (claim.name,),
    )
    existing = frappe.db.exists(
        "Sales Invoice", {"ronix_claim": claim.name, "docstatus": ["<", 2]}
    )
    if existing:
        frappe.throw(
            _("Claim {0} is already linked to Sales Invoice {1}.").format(
                claim.name, existing
            )
        )

    contract = frappe.get_doc("RONIX Contract", claim.contract)
    contract_items = {row.name: row for row in contract.items}
    project_cost_center = _get_project_cost_center(claim.project)

    invoice = frappe.new_doc("Sales Invoice")
    invoice.company = claim.company
    invoice.customer = claim.customer
    invoice.posting_date = claim.posting_date
    invoice.due_date = claim.due_date or claim.posting_date
    invoice.currency = claim.currency
    invoice.conversion_rate = flt(contract.exchange_rate) or 1
    invoice.project = claim.project
    invoice.ronix_claim = claim.name
    invoice.ronix_contract = claim.contract
    invoice.ronix_payment_milestone = claim.payment_milestone

    for row in claim.items:
        contract_item = contract_items.get(row.contract_item_reference)
        if not contract_item or not contract_item.item_code:
            frappe.throw(
                _("Contract item {0} requires an Item Code before invoicing.").format(
                    row.contract_item_reference or row.idx
                )
            )
        invoice_uom = _resolve_invoice_uom(
            contract_item.item_code, row.uom, row.qty
        )
        invoice.append(
            "items",
            {
                "item_code": contract_item.item_code,
                "item_name": contract_item.item_name,
                "description": row.description,
                "qty": row.qty,
                "uom": invoice_uom,
                "rate": row.rate,
                "amount": row.amount,
                "project": claim.project,
                "cost_center": project_cost_center,
                "ronix_claim_item": row.name,
            },
        )

    invoice.run_method("set_missing_values")
    invoice.due_date = claim.due_date or claim.posting_date
    invoice.run_method("calculate_taxes_and_totals")
    return invoice


@frappe.whitelist()
def make_payment_entry_from_invoice(source_name):
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

    invoice = frappe.get_doc("Sales Invoice", source_name)
    _require_permissions(invoice, "Payment Entry")
    if invoice.docstatus != 1:
        frappe.throw(_("Only a submitted Sales Invoice can create a RONIX collection."))
    if not invoice.get("ronix_claim"):
        frappe.throw(_("Sales Invoice is not linked to a RONIX Claim."))
    if flt(invoice.outstanding_amount) <= 0:
        frappe.throw(_("Sales Invoice has no outstanding amount to collect."))

    claim = frappe.get_doc("RONIX Claim", invoice.ronix_claim)
    if claim.docstatus != 1 or claim.claim_status != "Invoiced":
        frappe.throw(_("RONIX Claim must be submitted and Invoiced before collection."))
    if claim.sales_invoice != invoice.name:
        frappe.throw(_("RONIX Claim is linked to a different Sales Invoice."))

    frappe.db.sql(
        "SELECT name FROM `tabRONIX Claim` WHERE name = %s FOR UPDATE",
        (claim.name,),
    )
    existing = frappe.db.exists(
        "Payment Entry", {"ronix_claim": claim.name, "docstatus": ["<", 2]}
    )
    if existing:
        frappe.throw(
            _("Claim {0} is already linked to Payment Entry {1}.").format(
                claim.name, existing
            )
        )

    settings = get_accounting_settings(invoice.company, claim)
    company_currency = frappe.get_cached_value(
        "Company", invoice.company, "default_currency"
    )
    collection_currency = frappe.db.get_value(
        "Account", settings.default_collection_account, "account_currency"
    ) or company_currency
    if invoice.currency != company_currency or collection_currency != company_currency:
        frappe.throw(
            _(
                "RONIX automatic collection currently requires the invoice, company, "
                "and collection account to use the same currency."
            )
        )

    adjustments = get_claim_adjustments(claim, settings)
    total_adjustments = sum(flt(row["amount"]) for row in adjustments)
    received_amount = flt(invoice.outstanding_amount) - total_adjustments
    if received_amount <= 0:
        frappe.throw(_("RONIX net collection amount must be greater than zero."))

    payment = get_payment_entry(
        "Sales Invoice",
        invoice.name,
        bank_account=settings.default_collection_account,
    )
    payment.ronix_claim = claim.name
    payment.ronix_sales_invoice = invoice.name
    payment.project = claim.project
    payment.paid_amount = received_amount
    payment.received_amount = received_amount
    payment.set("deductions", [])

    cost_center = _get_project_cost_center(claim.project)
    if payment.meta.has_field("cost_center"):
        payment.cost_center = cost_center
    for row in adjustments:
        payment.append(
            "deductions",
            {
                "account": row["account"],
                "cost_center": cost_center,
                "amount": row["amount"],
                "description": row["description"],
            },
        )

    payment.set_exchange_rate(invoice)
    payment.set_amounts()
    return payment


def _resolve_invoice_uom(item_code, source_uom, qty):
    """Use a fraction-safe UOM without changing the claimed quantity."""
    if not _is_fractional(qty) or _uom_allows_fraction(source_uom):
        return source_uom

    stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
    if stock_uom and _uom_allows_fraction(stock_uom):
        return stock_uom

    frappe.throw(
        _(
            "Item {0} uses UOM {1}, which does not allow fractional quantity {2}. "
            "Assign the item a fraction-safe service UOM before invoicing."
        ).format(item_code, source_uom, qty)
    )


def _is_fractional(value):
    numeric_value = flt(value)
    return abs(numeric_value - round(numeric_value)) > 1e-9


def _uom_allows_fraction(uom):
    if not uom:
        return False
    return not bool(frappe.db.get_value("UOM", uom, "must_be_whole_number"))


def _get_project_cost_center(project):
    if not project:
        frappe.throw(_("A linked Project is required for RONIX accounting entries."))
    cost_center = frappe.db.get_value("Project", project, "ronix_cost_center")
    if cost_center:
        return cost_center
    from ronix_erp.events.project import ensure_project_cost_center

    cost_center = ensure_project_cost_center(project)
    if not cost_center:
        frappe.throw(_("Project {0} requires a Project Cost Center.").format(project))
    return cost_center


def _require_permissions(source_doc, target_doctype):
    source_doc.check_permission("read")
    if not frappe.has_permission(target_doctype, ptype="create"):
        frappe.throw(
            _("You are not permitted to create {0}.").format(target_doctype),
            frappe.PermissionError,
        )
