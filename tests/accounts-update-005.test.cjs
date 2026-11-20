const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/index.html'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/release.json'), 'utf8'));

test('update 007 gives marketers independent centers and complete ledgers', () => {
  assert.equal(release.update, '007');
  assert.match(html, /مركز حساب مسوّق/);
  assert.match(html, /كل فواتير المسوّقين/);
  assert.match(html, /سجل الدفعات/);
  assert.match(html, /فتح المركز وكل الفواتير/);
});

test('update 007 supports flexible entitlement, approval and payment vouchers', () => {
  assert.match(html, /collectedPercent/);
  assert.match(html, /entitlementRule/);
  assert.match(html, /بانتظار اعتماد المدير/);
  assert.match(html, /سند دفع للمسوّق/);
  assert.match(html, /marketer-payment:/);
  assert.match(html, /كشف حساب مسوّق/);
  assert.match(html, /رقم الفاتورة مسجل لهذا المسوّق من قبل/);
});

test('marketer invoices use the protected attachment store', () => {
  assert.match(html, /marketer-invoice:/);
  assert.match(html, /r14ProofAction\('payment',invoiceKey/);
  assert.match(html, /فاتورة المسوّق/);
});

test('marketers appear in dashboard, project view and printed project file', () => {
  assert.match(html, /r41-dashboard/);
  assert.match(html, /r41-project/);
  assert.match(html, /عمولات ودفعات المسوّقين/);
});

test('marketer view does not shadow the global page and collection uses book contract', () => {
  assert.match(html, /function view\(\)\{return focus\?center\(focus\):directory\(\)\}/);
  assert.doesNotMatch(html, /function page\(\)\{return focus\?center/);
  assert.match(html, /R14\.projectBookTotal\(p\)/);
  assert.match(html, /R41MarketerCenter\.issue/);
});
