# نشر Instant Plus Video Reviewer

## إصلاح خطأ 404 على Vercel

تطبيق Next.js موجود في **جذر الريبو** (مش داخل `web`). بعد أي push جديد، اعمل Redeploy من Vercel.

في لوحة Vercel للمشروع:

1. **Settings → General → Root Directory** → اتركه فاضي أو `.` (مش `web`)
2. **Settings → Environment Variables** وأضف:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ezvttuiqxswzrqyzogak.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (anon key من Supabase)
3. **Deployments → … → Redeploy** (مع Bypass Cache إن وُجد)

بعدها افتح رابط المشروع — المفروض يحوّلك لـ `/login`.

---

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

## 2) النشر بـ CLI

```powershell
copy .env.local.example .env.local
# عبّي المفاتيح
npm install
npx vercel --prod
```

## 3) عزل المفاتيح

- جدول `user_settings` محمي بـ RLS
- كل مستخدم يقرأ/يعدل مفاتيحه فقط
- المراجع لا يصل لمفاتيح الأدمن

## 4) معالجة الفيديو

معالجة Whisper/FFmpeg/OCR تحتاج سيرفر فيه هذه الأدوات (مش مناسب لـ Vercel Serverless).

```powershell
video-reviewer ui
```

أو ارفع FastAPI على VM/Railway/Render واضبط `NEXT_PUBLIC_PROCESS_API_URL`
