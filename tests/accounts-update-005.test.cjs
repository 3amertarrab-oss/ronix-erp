const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/index.html'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/release.json'), 'utf8'));

test('update 010 gives marketers independent centers and complete ledgers', () => {
  assert.equal(release.update, '010');
  assert.match(html, /مركز حساب مسوّق/);
  assert.match(html, /كل فواتير المسوّقين/);
  assert.match(html, /سجل الدفعات/);
  assert.match(html, /فتح المركز وكل الفواتير/);
});

test('update 010 mirrors designer assignment table inside each project', () => {
  assert.match(html, /const R47ProjectMarketers/);
  assert.match(html, /تكليفات المسوّقين/);
  assert.match(html, /<th>المسوّق<\/th><th>التكليف<\/th><th>العمولة<\/th><th>المدفوع<\/th><th>المتبقي<\/th><th>الحالة<\/th><th>الإجراءات<\/th>/);
  assert.match(html, /R27Marketers\.paymentForm/);
  assert.match(html, /حذف تكليف مسوق قبل الفوترة/);
  assert.match(html, /\.r41-project'\)\.forEach\(x=>x\.remove\(\)\)/);
});

test('update 009 allows safe marketer assignment editing and direct project workflow', () => {
  assert.match(html, /const R46MarketerOperations/);
  assert.match(html, /تعديل تكليف المسوّق/);
  assert.match(html, /صدرت فاتورة؛ القيمة المالية مقفلة لحماية السجل/);
  assert.match(html, /\+ مشروع \/ عمولة/);
  assert.match(html, /إضافة إلى مشروع/);
  assert.match(html, /R27Marketers\.paymentForm/);
});

test('update 008 removes duplicate marketer project panels and adds overview KPIs', () => {
  assert.match(html, /r41-overview-card/);
  assert.match(html, /المتبقي للمسوّقين/);
  assert.match(html, /بانتظار الاعتماد/);
});

test('update 008 makes project timeline interactive and auditable', () => {
  assert.match(html, /const R43Timeline/);
  assert.match(html, /timelineNotes/);
  assert.match(html, /إضافة ملاحظة/);
  assert.match(html, /استكمال تاريخ الحركة/);
  assert.match(html, /حذف ملاحظة/);
});

test('update 008 stores marketer master profiles before project assignment', () => {
  assert.match(html, /const R44MarketerDirectory/);
  assert.match(html, /دليل المسوّقين/);
  assert.match(html, /المسوّق المسجل/);
  assert.match(html, /أرشفة مسوق/);
});

test('update 008 uses searchable visual project cards for global movements', () => {
  assert.match(html, /const R45MovementPicker/);
  assert.match(html, /ابحث بالاسم أو الكود أو العميل/);
  assert.match(html, /المشاريع النشطة/);
  assert.match(html, /مقفول · عرض فقط/);
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
