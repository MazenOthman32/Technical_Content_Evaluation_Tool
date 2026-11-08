# نشر Instant Plus Technical Content Evaluation

## 1) قاعدة البيانات

1. افتح Supabase SQL Editor ونفّذ [`supabase/schema.sql`](supabase/schema.sql)
2. من Project Settings → API انسخ:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (سيرفر فقط — لا تضعه في `NEXT_PUBLIC_`)

## 2) إنشاء Super Admin

في `.env` / `web/.env.local`:

```env
SUPER_ADMIN_EMAIL=MazenOthman320@gmail.com
SUPER_ADMIN_PASSWORD=********
ANTHROPIC_API_KEY=...
GROQ_API_KEY=...
OPENAI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

ثم:

```powershell
cd web
node scripts/seed-super-admin.mjs
```

Supabase يخزّن كلمة المرور بـ **bcrypt**. السكربت يزرع مفاتيح API الافتراضية في حساب الـ Super Admin من متغيرات البيئة.

## 3) Vercel

- Root Directory = `web`
- Environment Variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Next.js يجب أن يكون `15.2.6+`
- عطّل Deployment Protection إن أردت وصولاً عامًا

## 4) الصلاحيات

- Super Admin / Admin: إنشاء مستخدمين + رؤية التحليلات المؤسسية
- Reviewer: مراجعة المحتوى + مفاتيحه فقط
- إدارة المستخدمين من **الإعدادات → إدارة المستخدمين**

## 5) معالجة الفيديو

```powershell
video-reviewer ui
```

أو اضبط `NEXT_PUBLIC_PROCESS_API_URL` على سيرفر المعالجة.
