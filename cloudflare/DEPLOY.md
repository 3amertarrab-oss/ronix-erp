# نشر CRM RONIX على Cloudflare

هذا الفرع تطبيق مستقل باسم **CRM RONIX**. الواجهة وواجهة API تعملان على Workers، والبيانات في D1، وصور المشاريع في R2.

## أول نشر

1. افتح PowerShell داخل مجلد المشروع وشغّل `npx wrangler login`، ثم وافق في المتصفح على ربط حساب Cloudflare.
2. أنشئ قاعدة البيانات: `npx wrangler d1 create crm-ronix`.
3. انسخ `database_id` الذي يعرضه الأمر وضعه مكان `REPLACE_WITH_D1_DATABASE_ID` في `wrangler.jsonc`.
4. أنشئ مخزن الصور: `npx wrangler r2 bucket create crm-ronix-files`.
5. أنشئ رمز الإعداد الأول: `npx wrangler secret put OWNER_SETUP_TOKEN`. أدخل قيمة طويلة وعشوائية واحتفظ بها حتى إنشاء حساب المالك.
6. انشر: `npm run cloudflare:deploy`.
7. افتح الرابط الذي يعرضه Wrangler، وأضف `/#setup=رمز_الإعداد` في نهايته. أنشئ كلمة مرور المالك، ثم احذف الرمز من شريط العنوان.

بعد نجاح الإعداد، لا يمكن استعمال رمز الإعداد لإنشاء مالك آخر. لإضافة نطاق من لوحة Cloudflare: **Workers & Pages → crm-ronix → Settings → Domains & Routes → Add → Custom Domain**.

لا تضع رمز الإعداد أو كلمة المرور داخل GitHub أو داخل ملف `wrangler.jsonc`.
