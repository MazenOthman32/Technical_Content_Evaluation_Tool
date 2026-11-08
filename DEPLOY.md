# نشر Instant Plus Technical Content Evaluation

## 1) قاعدة البيانات

1. افتح Supabase SQL Editor ونفّذ [`supabase/schema.sql`](supabase/schema.sql)
2. من Project Settings → API انسخ:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (سيرفر فقط — لا تضعه في `NEXT_PUBLIC_`)

## 2) إنشاء الأدمنز على Supabase Auth (حسابات عادية)

الحسابات لازم تتعمل كـ **Users** في Authentication — مش workaround محلي.

في `.env` أو `web/.env.local`:

```env
SUPABASE_URL=https://ezvttuiqxswzrqyzogak.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # من Project Settings → API → service_role
SUPER_ADMIN_EMAIL=MazenOthman320@gmail.com
SUPER_ADMIN_PASSWORD=282002mm
ANTHROPIC_API_KEY=...
GROQ_API_KEY=...
OPENAI_API_KEY=...
```

ثم:

```powershell
cd web
npm run seed:admins
```

السكربت ينشئ/يحدّث في Auth + `profiles` + `user_settings`:

| الدور | الإيميل | الباسورد الافتراضي |
|---|---|---|
| super_admin | MazenOthman320@gmail.com | من `SUPER_ADMIN_PASSWORD` |
| admin | admin@instantplus.com | admin123 |
| reviewer | reviewer@instantplus.com | reviewer123 |

كلمات المرور تتخزن بـ **bcrypt** داخل Supabase Auth. مفاتيح API الافتراضية تتزرع لحساب الـ Super Admin فقط.

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

## 5) معالجة الفيديو (للتقارير الكاملة)

التقارير الكاملة تظهر بعد ما معالج الفيديو يخلّص التحليل ويكتب النتائج في Supabase.

1. شغّل المعالج محلياً أو على سيرفر:

```powershell
# من جذر المشروع مع نفس مفاتيح Supabase في البيئة
video-reviewer ui
```

2. في Vercel / `web/.env.local` أضف:

```env
NEXT_PUBLIC_PROCESS_API_URL=http://127.0.0.1:8765
```

(استبدل بالـ URL العام لو المعالج منشور)

3. بعد «بدء المراجعة» هتتفتح صفحة التقرير، وتتحدث تلقائياً لما النتائج توصل.
