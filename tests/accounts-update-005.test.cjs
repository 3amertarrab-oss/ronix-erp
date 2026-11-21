const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/index.html'), 'utf8');
const release = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts-cloudflare/release.json'), 'utf8'));

test('update 017 creates recipient-safe claim documents with dated VO snapshots', () => {
  assert.match(html, /const R51ClaimDocuments/);
  assert.match(html, /اختيار نسخة المعاينة/);
  assert.match(html, /نسخة العميل/);
  assert.match(html, /كشف المسوّق/);
  assert.match(html, /نسخة داخلية/);
  assert.match(html, /contractSnapshot=snapshot\(p,date\)/);
  assert.match(html, /الاتفاق الأصلي وتعديلات VO المعتمدة/);
});

test('update 018 presents one large visual project story with detailed VO and financial position', () => {
  assert.equal(release.update, '018');
  assert.match(html, /const R52ClaimPresentation/);
  assert.match(html, /project-cover/);
  assert.match(html, /الاتفاق وأوامر التغيير VO/);
  assert.match(html, /قيمة الاتفاق الحالية بعد VO/);
  assert.match(html, /الموقف المالي للمشروع/);
  assert.match(html, /المطابق مع هذه المطالبة/);
  assert.match(html, /مسودة — غير صالحة للإرسال أو التحصيل/);
  assert.match(html, /page-break-before:always/);
});

test('update 016 previews claims and serializes safe issuance', () => {
  assert.match(html, /function preview\(enc\)/);
  assert.match(html, /معاينة/);
  assert.match(html, /إصدار المحدد/);
  assert.match(html, /async function waitSync\(\)/);
  assert.match(html, /جارٍ إصدار/);
  assert.match(html, /await issueOne\(id\)/);
});

test('update 015 puts a complete claims interface on the dashboard', () => {
  assert.match(html, /function dashboardPanel\(\)/);
  assert.match(html, /المطالبات والتحصيل/);
  assert.match(html, /تحتاج إجراء الآن/);
  assert.match(html, /إجمالي المطالبات/);
  assert.match(html, /عرض كل المطالبات/);
  assert.match(html, /window\.R50Claims\?window\.R50Claims\.dashboardPanel\(\)/);
});

test('update 014 provides a dynamic claims workspace and dashboard drill-down', () => {
  assert.match(html, /const R50Claims/);
  assert.match(html, /مسودات مطالبات تحتاج إكمال/);
  assert.match(html, /مطالبات تنتظر الاعتماد/);
  assert.match(html, /مطالبات متأخرة/);
  assert.match(html, /مطالبات مسددة جزئيًا/);
  assert.match(html, /R50Claims\.open\('overdue'\)/);
  assert.match(html, /مطابقة تحصيل/);
  assert.match(html, /new Set\(\['dashboard','projects','claims','customerDirectory'/);
});

test('update 013 gives marketers independent centers and complete ledgers', () => {
  assert.match(html, /مركز حساب مسوّق/);
  assert.match(html, /كل فواتير المسوّقين/);
  assert.match(html, /سجل الدفعات/);
  assert.match(html, /فتح المركز وكل الفواتير/);
});

test('update 013 removes the duplicate dashboard header and add action', () => {
  assert.match(html, /r49-dashboard-hidden/);
  assert.match(html, /top\?\.classList\.toggle\('r49-dashboard-hidden',dashboard\)/);
  assert.match(html, /\.top\.r49-dashboard-hidden\{display:none!important\}/);
});

test('update 012 provides a task-first progressive executive dashboard', () => {
  assert.match(html, /const R49ExecutiveDashboard/);
  assert.match(html, /ما يحتاج قرارك الآن، ثم أهم الأرقام دون تكرار/);
  assert.match(html, /يحتاج انتباهك/);
  assert.match(html, /التفاصيل المالية الكاملة/);
  assert.match(html, /العملاء والتحصيل/);
  assert.match(html, /المستحقون/);
  assert.match(html, /السيولة والربح/);
});

test('update 011 separates agreed, unbilled, pending and payable marketer amounts', () => {
  assert.match(html, /const R48MarketerStages/);
  assert.match(html, /العمولات المتفق عليها/);
  assert.match(html, /غير المفوتر/);
  assert.match(html, /المستحق للدفع/);
  assert.match(html, /المتبقي المستحق/);
  assert.match(html, /بانتظار إصدار الفاتورة/);
  assert.match(html, /مسدد جزئيًا/);
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
