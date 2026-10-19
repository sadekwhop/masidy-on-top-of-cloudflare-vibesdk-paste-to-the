# دليل إعداد ونشر منصة مسيدي (Masidy Setup & Deployment Guide)

يقدم هذا المستند دليلاً شاملاً لخطوات إعداد ونشر منصة **مسيدي (Masidy)** بالكامل على حساب **Cloudflare** الخاص بك باستخدام الخدمات السحابية الحديثة.

---

## 1. المتطلبات السابقة (Prerequisites)
1. **حساب Cloudflare** مُفعَّل عليه اشتراك **Workers Unlimited** لاستخدام Durable Objects وWorkers for Platforms.
2. **تفعيل Cloudflare AI Gateway** للاستفادة من نماذج الذكاء الاصطناعي (مثل Anthropic Claude 3.7 Sonnet).
3. **أداة Wrangler CLI** مثبتة محلياً (`npm i -g wrangler`).
4. **مفاتيح API المطلوبة:**
   - `ANTHROPIC_API_KEY`: مفتاح Anthropic Claude الرئيسي.
   - `OPENAI_API_KEY`: (اختياري/احتياطي) مفتاح OpenAI.
   - `PAYMOB_API_KEY` و `PAYMOB_INTEGRATION_ID` و `PAYMOB_HMAC_SECRET`: لمعالجة مدفوعات باي موب في مصر والشرق الأوسط.
   - `STRIPE_SECRET_KEY` و `STRIPE_WEBHOOK_SECRET`: لمعالجة المدفوعات العالمية عبر سترايب.
   - `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET`: لتسجيل الدخول عبر جوجل.

---

## 2. إنشاء الموارد الأساسية على Cloudflare (Provisioning Resources)

تتكون البنية التحتية لمنصة مسيدي من الموارد التالية:

### أ) قاعدة البيانات السحابية (Cloudflare D1 Database)
قم بإنشاء قاعدة بيانات D1 باسم `masidy-db`:
```bash
wrangler d1 create masidy-db
```
*قم بنسخ `database_id` الناتج ووضعه في ملف `wrangler.json`.*

### ب) مخزن المفاتيح والقيم (Cloudflare KV Namespace)
أنشئ مخزن KV للجلسات ومعدلات الاستخدام:
```bash
wrangler kv:namespace create MASIDY_KV
```
*ضع `id` الناتج في `wrangler.json`.*

### ج) التخزين السحابي للملفات (Cloudflare R2 Bucket)
أنشئ حوض R2 لتخزين أصول المواقع والنسخ الاحتياطية:
```bash
wrangler r2 bucket create masidy-assets
```

### د) النطاق الموجه للعملاء (Workers for Platforms Dispatch Namespace)
لتمكين نشر مواقع المستخدمين على فرع `*.masidy.app`:
```bash
wrangler dispatch-namespace create masidy-sites
```

### هـ) بوابة الذكاء الاصطناعي (Cloudflare AI Gateway)
أنشئ Gateway من لوحة تحكم Cloudflare باسم `masidy-gateway` لربط Anthropic Claude وتوفير الحماية وإعادة المحاولة التلقائية.

---

## 3. ضبط الأسرار والمفاتيح (Wrangler Secrets)

قم بضبط الأسرار التالية في مشروعك على Cloudflare:

```bash
# Anthropic Claude Key
npx wrangler secret put ANTHROPIC_API_KEY

# Cloudflare AI Gateway URL / Token
npx wrangler secret put AI_GATEWAY_URL

# OAuth Secrets
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# Payment Webhook Secrets
npx wrangler secret put PAYMOB_HMAC_SECRET
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# JWT & Session Encryption
npx wrangler secret put JWT_SECRET
```

---

## 4. إعداد ملف `wrangler.json`

تأكد من مطابقة ملف التهيئة `wrangler.json`:

```json
{
  "name": "masidy-app",
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./public",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  },
  "durable_objects": {
    "bindings": [
      { "name": "MASIDY_DO", "class_name": "App" }
    ]
  }
}
```

---

## 5. تشغيل واختبار المنصة محلياً (Local Run)

1. **تثبيت الحزم:**
   ```bash
   npm install
   ```
2. **التشغيل المحاكي:**
   ```bash
   npm run dev
   ```
3. **الاختبار الذاتي للرصيد ونظام الشراء:**
   ```bash
   npm test
   ```

---

## 6. نشر المنصة على Cloudflare (Deployment)

للنشر النهائي على النطاق `app.masidy.app`:

```bash
npx wrangler deploy
```

بعد اكتمال النشر، اختبر الدورة الكاملة:
1. إنشاء حساب جديد والحصول على 50 رصيد مجاني.
2. كتابة وصف الفكرة واختيار "إنشاء خطة العمل".
3. مراجعة الخطة والضغط على **"وافق وابني"**.
4. استعراض الموقع في المعاينة الحية.
5. نشر الموقع وتصفحه على `<slug>.masidy.app`.
