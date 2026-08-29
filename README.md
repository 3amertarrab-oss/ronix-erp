# RONIX ERP

Production-oriented ERPNext extensions for **RONIX STEEL**.

## Scope of v0.6.0

Version 0.6.0 adds the missing RONIX operational hub and Frappe v16 Desktop app
registration. The responsive hub provides one branded entry point for projects,
customers, quotations, contracts, claims, invoices, collections, purchasing, inventory,
manufacturing, project profitability, accounting, and document printing. It uses the
official RONIX logo and exposes permission-aware operational counters.

It retains the staging migration hotfixes based on the live Frappe Cloud
reconciliation of quotation `SAL-QTN-2026-00001`, contract `CON-2026-00001`, claim
`CLM-2026-00002`, invoice `ACC-SINV-2026-00001`, and payment
`ACC-PAY-2026-00001`.

- Quotation forms expose reverse links to the RONIX Contract and Project, plus a
  separate RONIX commercial status that does not falsify ERPNext's standard status.
- Duplicate active contracts for the same quotation remain blocked in both mapping
  and document validation.
- Every RONIX Project receives a dedicated Cost Center. When the company default is a
  leaf Cost Center, migration creates a `RONIX Projects` group under a valid enabled
  company group and places project Cost Centers inside it. Claim invoices and retention /
  withholding adjustments must use the project Cost Center; the company default is no
  longer a fallback.
- Contracts show event-driven live balances for claimed, invoiced, cash-collected,
  retained, withheld, outstanding, and remaining values.
- Payment milestones reconcile to submitted claims, invoices, and payments instead of
  remaining `Planned` after downstream activity.
- Retention policy is captured on the contract and copied to new claims.
- Whitelisted document mappers enforce read and create permissions server-side.

The controlled-retention foundation from v0.3.0 remains in force:

- Fractional service claims automatically use the item's fraction-safe stock UOM
  when legacy contract/claim rows still carry a whole-number UOM such as `Nos`.
- Company-specific collection settings require an explicit Bank/Cash account and
  separate Asset accounts for retention and withholding receivables.
- Submitted RONIX invoices can create a controlled draft Payment Entry that allocates
  the gross receivable, records actual cash received, and moves retention/withholding
  to their configured receivable accounts.
- Payment Entry guards block duplicate collections, altered amounts, altered accounts,
  wrong customers, and unrelated invoices.
- Payment Entries are never inserted or submitted automatically.

The controlled commercial data model is:

`Customer -> Quotation -> RONIX Contract -> Project -> RONIX Claim -> Sales Invoice -> Payment Entry`

Implemented in this release:

- RONIX Contract with contractual items, approval gates, and payment milestones.
- RONIX Claim with claim items, retention, withholding, tax, and calculated totals.
- Safe bidirectional navigation on Quotation, Contract, Project, and Sales Invoice.
- Quotation-to-contract and contract-to-project mapping APIs.
- Validation for dates, cross-document ownership, duplicate conversion, milestone totals, and monetary calculations.
- Cumulative claim controls that prevent quantities or values from exceeding contract items.
- Dependency checks that block cancellation of contracts or claims with downstream documents.
- Controlled submitted-document status transitions and signatory requirements.
- Submitted approved contracts can capture both signatories before moving to Signed.
- Contract-item descriptions fall back to the quotation item name or code when blank.
- Submitted approved claims create controlled draft Sales Invoices with matching customer,
  company, currency, project, contract, due date, item codes, quantities, and rates.
- Claim-to-invoice duplicate, missing-item, altered-item, and altered-total guards.
- Submitting or cancelling the linked invoice updates the claim link and workflow state.
- Claim totals refresh immediately in the form when quantities, rates, or percentages change.
- Arabic translation foundation.
- Read-only legacy snapshot preview with structural, relationship, duplicate, and amount checks.
- Idempotent Customer and Project migration using immutable legacy identifiers.
- Dry-run is mandatory before the confirmed master-data import.
- Immutable migration-run report for audit and reconciliation.

Not implemented yet / still release-blocking:

- Automatic submission of accounting documents. Submitted ERPNext documents post to
  the General Ledger through ERPNext's standard controlled posting flow.
- Automatic claim-to-invoice submission.
- Automatic inventory or manufacturing postings.
- Migration of live balances.
- Import of quotations, contracts, invoices, receipts, and expenses from the legacy snapshot.

Those operations remain deliberately disabled until the end-to-end pilot is reconciled and approved.

## Controlled legacy migration

The migration endpoint imports **master data only**. Financial documents remain blocked.
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
