# RONIX ERP Full Release Gate

Status: **NO-GO until every P0 gate below is evidenced and reconciled.**

## Target workflow

`Lead -> Quotation -> Contract -> Project -> Purchase -> Inventory -> Manufacturing -> Claim -> Sales Invoice -> Collection -> GL -> Project P&L -> Dashboard`

## Architecture controls

- ERPNext documents remain the accounting and stock system of record.
- RONIX documents orchestrate workflow and retain immutable source links.
- No direct GL Entry, Stock Ledger Entry, Bin, or balance-table writes.
- Posting uses submitted ERPNext vouchers only and must reverse through cancellation.
- Every imported legacy transaction carries an immutable legacy identifier and migration-run link.
- Posting operations are idempotent and protected against concurrent duplicates.
- Financial and stock migration requires preview, hash confirmation, dry run, control totals, and signed reconciliation.

## P0 release gates

### 1. Governance and CI

- [ ] Release version is consistent in PR title, README, package and hooks.
- [ ] PR is not Draft.
- [ ] At least one independent approving review exists.
- [ ] Required status checks and protected branch rules are enabled.
- [ ] ERPNext/Frappe v15 install, migrate and integration suite passes.
- [ ] ERPNext/Frappe v16 install, migrate and integration suite passes.

### 2. Security and transaction integrity

- [ ] Whitelisted APIs enforce source read permission and target create permission.
- [ ] Claim-to-invoice and invoice-to-payment uniqueness is database-enforced.
- [ ] Concurrency tests prove duplicate vouchers cannot be created.
- [ ] Submit, cancel, amend and retry operations are idempotent.
- [ ] Audit trail records source, target, actor, timestamp and migration run.

### 3. Automatic accounting

- [ ] Posting policy is company-specific and disabled by default.
- [ ] Approved claims create and optionally submit Sales Invoices under an explicit approval gate.
- [ ] Collections create and optionally submit Payment Entries under an explicit approval gate.
- [ ] VAT uses ERPNext Sales Taxes and Charges Template; claim tax is never a disconnected calculation.
- [ ] Retention and withholding accounts are validated by company, currency, root type and account type.
- [ ] Retention release and withholding settlement workflows exist.
- [ ] Partial and multiple collections are supported and reconciled.
- [ ] Multi-currency exchange differences are tested.
- [ ] Cancellation fully reverses GL and restores workflow status.

### 4. Live balance migration

- [ ] Opening date and freeze date are explicit.
- [ ] Customers, suppliers, projects, items, warehouses and accounts are mapped.
- [ ] Opening receivables/payables are imported as supported ERPNext opening vouchers.
- [ ] Cash/bank and GL opening balances are imported through supported vouchers.
- [ ] Stock opening quantities and values are imported through Stock Reconciliation.
- [ ] No historical financial document is inserted directly as submitted without supported posting.
- [ ] Source totals equal ERPNext control totals by company, currency, party, account and project.
- [ ] Re-run is safe and duplicate-free.
- [ ] Rollback/reversal procedure is tested from backup.

### 5. Inventory and manufacturing

- [ ] Project warehouses and cost centers are configured.
- [ ] Item master distinguishes stock, service and subcontracted items.
- [ ] UOM conversions are explicit; fractional quantities never change UOM labels without conversion.
- [ ] Material Request and Purchase Order flow is linked to project and contract.
- [ ] Purchase Receipt and Purchase Invoice flow is reconciled.
- [ ] BOM versions are controlled and approved.
- [ ] Work Orders and Job Cards are linked to project.
- [ ] Material transfer, consumption, manufacture and scrap are posted through Stock Entry.
- [ ] Subcontracting flow is tested where applicable.
- [ ] Negative stock policy, batch/serial rules and warehouse permissions are tested.
- [ ] Stock Ledger, GL, WIP and finished-goods balances reconcile.

### 6. End-to-end acceptance

A representative RONIX steel project must include:

- [ ] Quotation with fractional service and stock items.
- [ ] Signed contract and payment milestones.
- [ ] Project, cost center and project warehouses.
- [ ] Purchase, receipt and supplier invoice.
- [ ] BOM, Work Order, material consumption, manufacture and scrap.
- [ ] Two claims with VAT, retention and withholding.
- [ ] Partial collections and final collection.
- [ ] Retention release.
- [ ] Cancellation/amendment edge cases.
- [ ] Project P&L matches GL and stock valuation.
- [ ] Dashboard drill-down totals match source vouchers.

## Required reconciliation evidence

| Control | Source total | ERPNext total | Difference | Owner | Status |
|---|---:|---:|---:|---|---|
| Accounts receivable | | | | | |
| Accounts payable | | | | | |
| Cash and bank | | | | | |
| Retention receivable | | | | | |
| Withholding receivable | | | | | |
| Inventory quantity | | | | | |
| Inventory value | | | | | |
| WIP | | | | | |
| Project revenue | | | | | |
| Project cost | | | | | |

## Merge rule

The PR remains Draft and **must not merge to main** while any P0 checkbox is open. Inventory/manufacturing and live-balance migration are part of this release scope; they are not deferred release notes.
