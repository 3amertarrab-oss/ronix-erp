# RONIX ERP

Production-oriented ERPNext extensions for **RONIX STEEL**.

## Scope of v0.1.0

This first controlled release establishes the commercial data model:

`Customer -> Quotation -> RONIX Contract -> Project -> RONIX Claim -> Sales Invoice -> Payment Entry`

Implemented in this release:

- RONIX Contract with contractual items, approval gates, and payment milestones.
- RONIX Claim with claim items, retention, withholding, tax, and calculated totals.
- Safe links on Quotation, Project, and Sales Invoice.
- Quotation-to-contract and contract-to-project mapping APIs.
- Validation for dates, cross-document ownership, duplicate conversion, milestone totals, and monetary calculations.
- Arabic translation foundation.

Not implemented yet:

- Automatic posting to the General Ledger.
- Automatic claim-to-invoice submission.
- Automatic inventory or manufacturing postings.
- Migration of live balances.

Those operations remain deliberately disabled until the end-to-end pilot is reconciled and approved.

## Compatibility

- Frappe Framework 15 or 16
- ERPNext 15 or 16 (required app)

## Installation

Install this app on a **staging site first**. Do not install directly on a live accounting site.

```bash
bench get-app https://github.com/3amertarrab-oss/ronix-erp --branch frappe-app
bench --site your-site install-app ronix_erp
bench --site your-site migrate
```

## Ownership

Developed for RONIX STEEL - Eng. Amer Tarrab.

