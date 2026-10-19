# مسيدي (Masidy) — منصة بناء المواقع والتطبيقات بالذكاء الاصطناعي

**Masidy (مسيدي)** هي منصة مفتوحة المصدر مبنية على تقنيات **Cloudflare VibeSDK** والذكاء الاصطناعي لتوفير تجربة بناء مواقع وتطبيقات حية فائقة السرعة باللغة العربية (`dir="rtl"`).

---

## 🌟 المزايا الرئيسية (Core Features)

1. **الذكاء الاصطناعي المتقدم:** استخدام نموذج **Anthropic Claude 3.7 Sonnet** عبر **Cloudflare AI Gateway**.
2. **نموذج "التخطيط ثم الموافقة" (Plan-Then-Approve):** توليد خطة هيكلية باللغة العربية تتيح للمستخدم الموافقة بلمسة واحدة (**"وافق وابني"**) أو تعديل الخطة (**"عدّل الخطة"**).
3. **دفتر الرصيد والنقاط (Credit Ledger):**
   - 50 رصيد مجاني ترحيبي لكل حساب جديد.
   - بناء تطبيق كامل: **10 رصيد**.
   - تعديل بالدردشة الحية: **3 رصيد**.
   - النشر: **مجاني**.
   - خصم ذري وإعادة نقاط تلقائية عند حدوث أي خطأ في البناء.
4. **باقات الشراء والمدفوعات:** دعم **Paymob (مصر والشرق الأوسط)** و **Stripe (العالمية)** لإضافة النقاط تلقائياً بحماية Idempotency.
5. **النشر والدومينات الخاصة:** النشر الفوري على `<slug>.masidy.app` مع دعم ربط **Cloudflare for SaaS (Custom Hostnames)** لربط نطاقات المستخدمين وتوليد شهادات SSL تلقائياً.
6. **الحماية والأمان (Safety & Moderation):** فلترة حقن الأوامر (Prompt Injection Defense)، وتصفية المحتوى الضار، ورابط الإبلاغ عن المحتوى المخالف، ومفتاح الحظر الفوري للمسئول (Admin Kill-Switch).

---

## 🚀 التشغيل المحلي (Local Run)

1. **تثبيت الحزم:**
   ```bash
   npm install
   ```

2. **التشغيل المحاكي:**
   ```bash
   npm run dev
   ```

3. **تشغيل الاختبارات:**
   ```bash
   npm test
   ```

---

## 🔐 ضبط الأسرار والمفاتيح (Wrangler Secrets)

قم بضبط الأسرار التالية في Cloudflare Wrangler:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put AI_GATEWAY_URL
npx wrangler secret put PAYMOB_HMAC_SECRET
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put JWT_SECRET
```

### دورة تدوير المفاتيح (Key Rotation Guide)
عند الحاجة لتغيير المفاتيح أمنياً:
1. قم بإنشاء المفتاح الجديد في لوحة تحكم المزود (Anthropic / Paymob / Stripe).
2. حدث السر في Wrangler باستخدام `npx wrangler secret put <KEY_NAME>`.
3. أعد نشر التطبيق عبر `npx wrangler deploy`.

---

## ☁️ النشر على Cloudflare (Deployment)

للنشر النهائي على منصة Cloudflare:

```bash
npx wrangler deploy
```

---

## ✅ قائمة التحقق والإثبات (Final Proof Checklist)

- [x] **Sign Up & Bonus:** تسجيل مستخدم جديد واستلام **50 رصيد مجاني**.
- [x] **Prompt Entry:** كتابة وصف الفكرة واختيار الأفكار المقترحة.
- [x] **Plan Generation:** توليد خطة العمل الميكرية باللغة العربية (الصفحات والمزايا).
- [x] **Approve Gate:** مراجعة الخطة والضغط على **"وافق وابني"** لخصم 10 نقاط.
- [x] **Build & Code:** توليد كود التطبيق واستعراضه.
- [x] **Live Preview:** معاينة الموقع في الإطار الحي وتبديل الأجهزة (شاشة/تابلت/جوال).
- [x] **Conversational Edit:** طلب تعديل مباشر في الدردشة بخصم 3 نقاط.
- [x] **Publishing:** نشر الموقع بنجاح على `<slug>.masidy.app`.
- [x] **Open Published Site:** فتح وزيارة الموقع المنشور مباشرة مع شريط الإبلاغ.
- [x] **Buy Credits:** استعراض وشراء باقات الرصيد (100 / 500 / 2000 رصيد) عبر Paymob وStripe.
- [x] **Custom Domain:** إضافة نطاق خاص واستخراج سجلات الـ CNAME والـ TXT المطلوبة.
