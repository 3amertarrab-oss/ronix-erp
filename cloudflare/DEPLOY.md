# نشر CRM RONIX على Cloudflare

هذا الفرع تطبيق مستقل باسم **CRM RONIX**. الواجهة وواجهة API تعملان على Workers، والبيانات وصور المشاريع المحسنة للويب في D1.

## أول نشر

1. افتح PowerShell داخل مجلد المشروع وشغّل `npx wrangler login`، ثم وافق في المتصفح على ربط حساب Cloudflare.
2. أنشئ قاعدة البيانات: `npx wrangler d1 create crm-ronix`.
3. انسخ `database_id` الذي يعرضه الأمر وضعه مكان `REPLACE_WITH_D1_DATABASE_ID` في `wrangler.jsonc`.
4. انشر: `npm run cloudflare:deploy`.
5. افتح الرابط الذي يعرضه Wrangler. هذه النسخة مضبوطة، بطلب المالك، للدخول المباشر بصلاحية المالك دون كلمة مرور.

لإضافة نطاق من لوحة Cloudflare: **Workers & Pages → crm-ronix → Settings → Domains & Routes → Add → Custom Domain**.

الرابط عام ويمنح كل من يفتحه صلاحية المالك. يمكن إعادة تفعيل المصادقة بتغيير `PUBLIC_OWNER_ACCESS` إلى `false` ثم نشر التطبيق.
