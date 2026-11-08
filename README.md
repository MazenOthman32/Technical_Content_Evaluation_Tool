# Technical Content Evaluation Tool

أداة مؤسسية لتقييم جودة المحتوى التقني (فيديوهات تعليمية) بمساعدة الذكاء الاصطناعي، مع واجهة عربية، تقارير PDF، وتصنيف حسب الكورس.

المبدأ الأساسي: **الذكاء الاصطناعي يساعد — والقرار النهائي بشري.**

---

## ماذا ستشغّل؟

| الجزء | الوظيفة | المنفذ |
|---|---|---|
| `web/` (Next.js) | واجهة الدخول، التقارير، الإعدادات، PDF | `3000` |
| `video_reviewer` (FastAPI) | معالج الفيديو (تفريغ + OCR + LLM) | `8765` |
| Supabase | Auth + قاعدة البيانات + RLS | Cloud |

---

## المتطلبات مرة واحدة

- **Node.js 20+**
- **Python 3.11+**
- **FFmpeg** و **Tesseract OCR** (`ara` + `eng`)
- مشروع **Supabase** + مفاتيح LLM (Groq / Anthropic / OpenAI)

### Windows

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install ffmpeg
winget install UB-Mannheim.TesseractOCR
```

تأكد أن `ffmpeg` و `tesseract` ظاهرين في `PATH`.

---

## إعداد سريع (موصى به)

من جذر المشروع:

```powershell
cd "C:\path\to\Final Evaluation Tool"
.\scripts\setup.ps1
```

السكربت يعمل الآتي:
1. ينشئ `.venv` ويثبّت باقة Python
2. ينسخ `.env` و `web/.env.local` من الأمثلة إن لم تكونا موجودتين
3. يشغّل `npm install` داخل `web/`

بعدها افتح الملفات واملأ القيم الحقيقية (بدون مشاركة المفاتيح علناً):

- `.env`
- `web/.env.local`

### قاعدة البيانات (Supabase SQL Editor)

نفّذ بالترتيب:

1. محتوى `supabase/schema.sql`
2. محتوى `supabase/migrations/20261108_reviews_categories_delete.sql`

### إنشاء حسابات البداية

```powershell
cd web
node scripts/seed-admins.mjs
```

أو من الجذر:

```powershell
node scripts/seed-super-admin.mjs
```

---

## تشغيل كل شيء محلياً بأمر واحد

```powershell
.\scripts\dev.ps1
```

يفتح:
- معالج الفيديو على `http://127.0.0.1:8765`
- الواجهة على `http://127.0.0.1:3000`

سجّل الدخول بالحساب الذي أنشأته عبر الـ seed.

---

## تشغيل يدوي (نافذتان)

### 1) المعالج

```powershell
.\scripts\start-processor.ps1
```

### 2) الواجهة

```powershell
cd web
npm install
npm run dev
```

افتح: [http://127.0.0.1:3000](http://127.0.0.1:3000)

---

## أوامر مفيدة يومياً

```powershell
# إعداد أول مرة
.\scripts\setup.ps1

# تشغيل كامل محلي
.\scripts\dev.ps1

# تشغيل المعالج فقط
.\scripts\start-processor.ps1

# نفق عام للمعالج (لو الواجهة على Vercel)
.\scripts\start-tunnel.ps1

# اختبارات Python
.\.venv\Scripts\Activate.ps1
pytest -q

# فحص TypeScript للواجهة
cd web
npx tsc --noEmit

# بناء إنتاج للواجهة
cd web
npm run build
```

---

## الميزات الأساسية في الواجهة

- تسجيل دخول عبر Supabase Auth
- أدوار: `super_admin` / `admin` / `reviewer`
- مراجعة فيديو من Drive أو ملف محلي
- تصنيف التقارير حسب **الكورس** + وسوم/وحدات
- فتح تقرير كامل مع فلترة الملاحظات
- تنزيل **PDF عربي** لتقرير واحد أو **عدة تقارير دفعة واحدة (ZIP)**
- حذف التقارير لـ `admin` و `super_admin`
- لوحة تحليل + إدارة مفاتيح ونماذج

تم إزالة تنزيلات JSON / Markdown من الواجهة — التصدير الرسمي هو PDF فقط.

---

## الشعار

ضع شعار Instant+ هنا:

```text
web/public/brand/instant-plus-logo.png
```

نسخة للمعالج المحلي (اختياري):

```text
video_reviewer/static/brand/instant-plus-logo.png
```

يفضّل PNG بخلفية بيضاء/شفافة ونسبة عرض تقريبية `2.4:1`.

---

## النشر على Vercel

1. Root Directory = `web`
2. أضف Environment Variables من `web/.env.local.example`
3. اضبط `PROCESS_API_URL` على رابط عام للمعالج (مثلاً عبر `.\scripts\start-tunnel.ps1`)
4. Deploy

بدون معالج شغّال، الطلبات تُحفظ لكن التحليل الكامل لن يكتمل.

---

## هيكل مختصر

```text
Final Evaluation Tool/
├─ web/                 # Next.js UI + APIs
├─ video_reviewer/      # معالج الفيديو (Python)
├─ supabase/            # schema + migrations
├─ scripts/             # setup / dev / processor / tunnel / seed
├─ .env.example
└─ README.md
```

---

## استكشاف أعطال سريع

| العرض | الحل |
|---|---|
| فشل الدخول | تأكد من `NEXT_PUBLIC_SUPABASE_*` ووجود المستخدم في Auth |
| التقرير يظل queued | شغّل `.\scripts\start-processor.ps1` وتأكد من `PROCESS_API_URL` |
| عمود category مفقود | نفّذ migration التصنيفات في Supabase |
| PDF عربي مكسور | افتح التقرير من المتصفح بعد تحميل الصفحة (الخطوط تُحمَّل من الواجهة) |
| لا يظهر اللوجو | تأكد من وجود `web/public/brand/instant-plus-logo.png` |

---

## ملاحظة أمنية

لا ترفع ملفات `.env` أو `.env.local` إلى Git. استخدم الأمثلة فقط، وضع المفاتيح الحقيقية محلياً أو في Vercel Environment Variables.
