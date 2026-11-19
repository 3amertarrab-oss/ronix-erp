const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/index.html'), 'utf8');

test('update 003 keeps the Supabase media and commit adapters', () => {
  assert.match(html, /storage\.from\('ronix-files'\)/);
  assert.match(html, /rpc\('ronix_commit'/);
  assert.match(html, /expected_revision/);
});

test('marketer records are additive normalized tables', () => {
  for (const table of ['marketerAssignments', 'marketerInvoices', 'marketerPayments']) {
    assert.match(html, new RegExp(`['"]${table}['"]`));
  }
  assert.match(html, /Additive tables only/);
});

test('invoice is guarded by full project collection and payments link to invoices', () => {
  assert.match(html, /if\(!fullyCollected\(a\.code\)\)return alert/);
  assert.match(html, /invoiceId:id/);
  assert.match(html, /amount>balance\+0\.005/);
});

test('printed marketer invoice excludes internal controls', () => {
  assert.match(html, /فاتورة عمولة مسوّق/);
  assert.match(html, /@media print\{button\{display:none\}\}/);
  assert.match(html, /ولا تنشئ سند قبض من العميل/);
});
