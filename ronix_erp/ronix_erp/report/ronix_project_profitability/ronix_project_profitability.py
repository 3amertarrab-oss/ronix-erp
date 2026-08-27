import frappe
from frappe import _
from frappe.utils import getdate

from ronix_erp.profitability import enrich_project_rows


def execute(filters=None):
    filters = frappe._dict(filters or {})
    company = filters.get("company") or frappe.defaults.get_user_default("Company")
    if not company:
        frappe.throw(_("Company is required."))

    _validate_dates(filters)
    allowed_projects = _get_allowed_projects(company, filters.get("project"))
    columns = _get_columns()
    if not allowed_projects:
        return columns, [], None, None, []

    rows = _get_rows(company, allowed_projects, filters)
    data = enrich_project_rows(rows)
    chart = _get_chart(data)
    summary = _get_summary(data, company)
    return columns, data, None, chart, summary


def _validate_dates(filters):
    if filters.get("from_date") and filters.get("to_date"):
        if getdate(filters.from_date) > getdate(filters.to_date):
            frappe.throw(_("From Date cannot be after To Date."))


def _get_allowed_projects(company, selected_project=None):
    project_filters = {"company": company, "ronix_contract": ["is", "set"]}
    if selected_project:
        project_filters["name"] = selected_project
    return frappe.get_list(
        "Project",
        filters=project_filters,
        pluck="name",
        limit_page_length=0,
    )


def _get_rows(company, allowed_projects, filters):
    values = {
        "company": company,
        "allowed_projects": tuple(allowed_projects),
    }
    gl_dates = _date_conditions("gle", filters, values)
    invoice_dates = _date_conditions("si", filters, values)
    payment_dates = _date_conditions("pe", filters, values)

    return frappe.db.sql(
        f"""
        SELECT
            p.name AS project,
            p.project_name,
            p.customer,
            p.status AS project_status,
            p.company,
            company.default_currency AS currency,
            p.ronix_contract,
            COALESCE(contract.contract_value, 0)
                * COALESCE(NULLIF(contract.exchange_rate, 0), 1) AS contract_value,
            COALESCE(invoice_totals.invoiced_amount, 0) AS invoiced_amount,
            COALESCE(invoice_totals.outstanding_amount, 0) AS outstanding_amount,
            COALESCE(cash_totals.collected_amount, 0) AS collected_amount,
            COALESCE(deduction_totals.retention_amount, 0) AS retention_amount,
            COALESCE(deduction_totals.withholding_amount, 0) AS withholding_amount,
            COALESCE(gl_totals.actual_revenue, 0) AS actual_revenue,
            COALESCE(gl_totals.actual_cost, 0) AS actual_cost
        FROM `tabProject` p
        JOIN `tabCompany` company ON company.name = p.company
        LEFT JOIN `tabRONIX Contract` contract ON contract.name = p.ronix_contract
        LEFT JOIN (
            SELECT
                gle.project,
                SUM(
                    CASE WHEN account.root_type = 'Income'
                        THEN gle.credit - gle.debit ELSE 0 END
                ) AS actual_revenue,
                SUM(
                    CASE WHEN account.root_type = 'Expense'
                        THEN gle.debit - gle.credit ELSE 0 END
                ) AS actual_cost
            FROM `tabGL Entry` gle
            JOIN `tabAccount` account ON account.name = gle.account
            WHERE gle.is_cancelled = 0
              AND gle.company = %(company)s
              {gl_dates}
            GROUP BY gle.project
        ) gl_totals ON gl_totals.project = p.name
        LEFT JOIN (
            SELECT
                si.project,
                SUM(si.base_net_total) AS invoiced_amount,
                SUM(si.outstanding_amount * COALESCE(NULLIF(si.conversion_rate, 0), 1))
                    AS outstanding_amount
            FROM `tabSales Invoice` si
            WHERE si.docstatus = 1
              AND si.company = %(company)s
              AND COALESCE(si.ronix_claim, '') != ''
              {invoice_dates}
            GROUP BY si.project
        ) invoice_totals ON invoice_totals.project = p.name
        LEFT JOIN (
            SELECT
                pe.project,
                SUM(pe.base_received_amount) AS collected_amount
            FROM `tabPayment Entry` pe
            WHERE pe.docstatus = 1
              AND pe.company = %(company)s
              AND pe.payment_type = 'Receive'
              AND COALESCE(pe.ronix_claim, '') != ''
              {payment_dates}
            GROUP BY pe.project
        ) cash_totals ON cash_totals.project = p.name
        LEFT JOIN (
            SELECT
                pe.project,
                SUM(
                    CASE WHEN deduction.account = settings.retention_receivable_account
                        THEN deduction.amount ELSE 0 END
                ) AS retention_amount,
                SUM(
                    CASE WHEN deduction.account = settings.withholding_receivable_account
                        THEN deduction.amount ELSE 0 END
                ) AS withholding_amount
            FROM `tabPayment Entry` pe
            JOIN `tabPayment Entry Deduction` deduction ON deduction.parent = pe.name
            JOIN `tabRONIX Accounting Settings` settings ON settings.company = pe.company
            WHERE pe.docstatus = 1
              AND pe.company = %(company)s
              AND pe.payment_type = 'Receive'
              AND COALESCE(pe.ronix_claim, '') != ''
              {payment_dates}
            GROUP BY pe.project
        ) deduction_totals ON deduction_totals.project = p.name
        WHERE p.company = %(company)s
          AND p.name IN %(allowed_projects)s
        ORDER BY p.modified DESC
        """,
        values,
        as_dict=True,
    )


def _date_conditions(alias, filters, values):
    conditions = []
    if filters.get("from_date"):
        values["from_date"] = filters.from_date
        conditions.append(f"AND {alias}.posting_date >= %(from_date)s")
    if filters.get("to_date"):
        values["to_date"] = filters.to_date
        conditions.append(f"AND {alias}.posting_date <= %(to_date)s")
    return "\n              ".join(conditions)


def _get_columns():
    currency = "currency"
    return [
        _column("Project", "project", "Link", 150, "Project"),
        _column("Project Name", "project_name", "Data", 180),
        _column("Customer", "customer", "Link", 160, "Customer"),
        _column("Status", "project_status", "Data", 100),
        {
            "label": _("Currency"),
            "fieldname": currency,
            "fieldtype": "Link",
            "options": "Currency",
            "hidden": 1,
        },
        _column("Contract Value", "contract_value", "Currency", 130, currency),
        _column("Invoiced", "invoiced_amount", "Currency", 120, currency),
        _column("Cash Collected", "collected_amount", "Currency", 130, currency),
        _column("Retention Held", "retention_amount", "Currency", 120, currency),
        _column("Withholding Held", "withholding_amount", "Currency", 130, currency),
        _column("Outstanding", "outstanding_amount", "Currency", 120, currency),
        _column("Actual Revenue", "actual_revenue", "Currency", 130, currency),
        _column("Actual Cost", "actual_cost", "Currency", 120, currency),
        _column("Net Profit", "net_profit", "Currency", 120, currency),
        _column("Margin %", "margin_percent", "Percent", 90),
        _column("Unbilled Contract", "unbilled_contract", "Currency", 140, currency),
    ]


def _column(label, fieldname, fieldtype, width, options=None):
    column = {
        "label": _(label),
        "fieldname": fieldname,
        "fieldtype": fieldtype,
        "width": width,
    }
    if options:
        column["options"] = options
    return column


def _get_chart(data):
    if not data:
        return None
    top_rows = sorted(data, key=lambda row: abs(row["actual_revenue"]), reverse=True)[:10]
    return {
        "data": {
            "labels": [row["project_name"] or row["project"] for row in top_rows],
            "datasets": [
                {
                    "name": _("Actual Revenue"),
                    "values": [row["actual_revenue"] for row in top_rows],
                },
                {
                    "name": _("Actual Cost"),
                    "values": [row["actual_cost"] for row in top_rows],
                },
                {
                    "name": _("Net Profit"),
                    "values": [row["net_profit"] for row in top_rows],
                },
            ],
        },
        "type": "bar",
        "colors": ["#0c3155", "#d9a441", "#2f855a"],
    }


def _get_summary(data, company):
    currency = frappe.get_cached_value("Company", company, "default_currency")
    totals = {
        fieldname: sum(row[fieldname] for row in data)
        for fieldname in (
            "actual_revenue",
            "actual_cost",
            "net_profit",
            "collected_amount",
            "retention_amount",
        )
    }
    return [
        _summary(_("Actual Revenue"), totals["actual_revenue"], currency, "Blue"),
        _summary(_("Actual Cost"), totals["actual_cost"], currency, "Orange"),
        _summary(
            _("Net Profit"),
            totals["net_profit"],
            currency,
            "Green" if totals["net_profit"] >= 0 else "Red",
        ),
        _summary(_("Cash Collected"), totals["collected_amount"], currency, "Green"),
        _summary(_("Retention Held"), totals["retention_amount"], currency, "Orange"),
    ]


def _summary(label, value, currency, indicator):
    return {
        "label": label,
        "value": value,
        "datatype": "Currency",
        "currency": currency,
        "indicator": indicator,
    }
