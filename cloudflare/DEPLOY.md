# نشر CRM RONIX على Cloudflare

هذا الفرع تطبيق مستقل باسم **CRM RONIX**. الواجهة وواجهة API تعملان على Workers، والبيانات وصور المشاريع المحسنة للويب في D1.

## أول نشر

1. افتح PowerShell داخل مجلد المشروع وشغّل `npx wrangler login`، ثم وافق في المتصفح على ربط حساب Cloudflare.
2. أنشئ قاعدة البيانات: `npx wrangler d1 create crm-ronix`.
3. انسخ `database_id` الذي يعرضه الأمر وضعه مكان `REPLACE_WITH_D1_DATABASE_ID` في `wrangler.jsonc`.
4. أنشئ رمز الإعداد الأول: `npx wrangler secret put OWNER_SETUP_TOKEN`. أدخل قيمة طويلة وعشوائية واحتفظ بها حتى إنشاء حساب المالك.
5. انشر: `npm run cloudflare:deploy`.
6. افتح الرابط الذي يعرضه Wrangler، وأضف `/#setup=رمز_الإعداد` في نهايته. أنشئ كلمة مرور المالك، ثم احذف الرمز من شريط العنوان.

بعد نجاح الإعداد، لا يمكن استعمال رمز الإعداد لإنشاء مالك آخر. لإضافة نطاق من لوحة Cloudflare: **Workers & Pages → crm-ronix → Settings → Domains & Routes → Add → Custom Domain**.

لا تضع رمز الإعداد أو كلمة المرور داخل GitHub أو داخل ملف `wrangler.jsonc`.
