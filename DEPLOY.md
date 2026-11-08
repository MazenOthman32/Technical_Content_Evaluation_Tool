# نشر Instant Plus Video Reviewer

## 1) Supabase

المشروع الحالي: `ezvttuiqxswzrqyzogak`

1. افتح SQL Editor ونفّذ ملف [`supabase/schema.sql`](supabase/schema.sql)
2. من **Project Settings → API** انسخ:
   - Project URL: `https://ezvttuiqxswzrqyzogak.supabase.co`
   - `anon` key
   - `service_role` key
3. من Authentication → Users أنشئ حسابين:
   - Admin: مثلاً `admin@instantplus.com` مع User Metadata:
     ```json
     { "username": "admin", "full_name": "Admin", "role": "admin" }
     ```
   - Reviewer: مثلاً `reviewer@instantplus.com` مع:
     ```json
     { "username": "reviewer", "full_name": "Content Reviewer", "role": "reviewer" }
     ```
4. (اختياري للـ DB المباشر) connection string:
   `postgresql://postgres:[PASSWORD]@db.ezvttuiqxswzrqyzogak.supabase.co:5432/postgres`

## 2) الواجهة على Vercel

```powershell
cd web
copy .env.local.example .env.local
# عبّي SUPABASE values
npm install
npm run build
npx vercel --prod
```

أو اربط مستودع GitHub بمشروع Vercel واضبط Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_PROCESS_API_URL` (اختياري: رابط سيرفر المعالجة FastAPI)

## 3) عزل المفاتيح

- جدول `user_settings` محمي بـ RLS
- كل مستخدم يقرأ/يعدل مفاتيحه فقط
- المراجع لا يصل لمفاتيح الأدمن

## 4) معالجة الفيديو

معالجة Whisper/FFmpeg/OCR تحتاج سيرفر فيه هذه الأدوات (مش مناسب لـ Vercel Serverless).

- الواجهة + Auth + Settings + السجل تعمل على Vercel + Supabase
- للمعالجة الكاملة شغّل محلياً:

```powershell
video-reviewer ui
```

أو ارفع FastAPI على VM/Railway/Render واضبط `NEXT_PUBLIC_PROCESS_API_URL`
