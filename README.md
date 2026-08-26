# RONIX ERP

Production-oriented ERPNext extensions for **RONIX STEEL**.

## Scope of v0.2.1

This first controlled release establishes the commercial data model:

`Customer -> Quotation -> RONIX Contract -> Project -> RONIX Claim -> Sales Invoice -> Payment Entry`

Implemented in this release:

- RONIX Contract with contractual items, approval gates, and payment milestones.
- RONIX Claim with claim items, retention, withholding, tax, and calculated totals.
- Safe links on Quotation, Project, and Sales Invoice.
- Quotation-to-contract and contract-to-project mapping APIs.
- Validation for dates, cross-document ownership, duplicate conversion, milestone totals, and monetary calculations.
- Cumulative claim controls that prevent quantities or values from exceeding contract items.
- Dependency checks that block cancellation of contracts or claims with downstream documents.
- Controlled submitted-document status transitions and signatory requirements.
- Arabic translation foundation.
- Read-only legacy snapshot preview with structural, relationship, duplicate, and amount checks.
- Idempotent Customer and Project migration using immutable legacy identifiers.
- Dry-run is mandatory before the confirmed master-data import.
- Immutable migration-run report for audit and reconciliation.

Not implemented yet:

- Automatic posting to the General Ledger.
- Automatic claim-to-invoice submission.
- Automatic inventory or manufacturing postings.
- Migration of live balances.
- Import of quotations, contracts, invoices, receipts, and expenses from the legacy snapshot.

Those operations remain deliberately disabled until the end-to-end pilot is reconciled and approved.

## Controlled legacy migration

The v0.2 migration endpoint imports **master data only**. Financial documents remain blocked.
Only a System Manager can run it, and the confirmed SHA-256 must match the previewed snapshot.
Re-running the same import skips records by their immutable `ronix_legacy_id`.

1. Call `ronix_erp.migration.legacy_snapshot.preview_legacy_snapshot`.
2. Review all errors, warnings, counts, and control totals.
3. Call `ronix_erp.migration.legacy_snapshot.import_legacy_master_data` with `dry_run=1`.
4. Reconcile the plan, then repeat with `dry_run=0` and the preview hash.

Never import financial documents before the staging reconciliation is signed off.

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
