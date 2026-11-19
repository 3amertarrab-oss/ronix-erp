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

test('update 004 guides claims and keeps matching non-cash', () => {
  assert.match(html, /Accounts update 004: guided claims/);
  assert.match(html, /البيانات الأساسية/);
  assert.match(html, /اختيار المشاريع/);
  assert.match(html, /البنود والقيم/);
  assert.match(html, /العملة والسعر/);
  assert.match(html, /المراجعة والحفظ/);
  assert.match(html, /المطابقة لا تنشئ قبضًا جديدًا/);
  assert.match(html, /المبلغ كتابةً/);
});

test('EGP hides exchange rate while foreign contracts keep it', () => {
  assert.match(html, /\.r24-claim-rate:not\(\.foreign\)\{display:none!important\}/);
  assert.match(html, /حدد سعر الصرف للمشروع/);
});

test('claim errors and settlement preview are inline', () => {
  assert.match(html, /id='r40ClaimError'|id="r40ClaimError"/);
  assert.match(html, /المتاح من السندات/);
  assert.match(html, /سيُربط الآن/);
  assert.match(html, /المسدد بعد الربط/);
});
