import { NextResponse } from "next/server";
import { isStaff } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { slugifyCourseName } from "@/lib/courses";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user || !auth.profile?.is_active) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (!isStaff(auth.profile.role)) {
    return NextResponse.json({ error: "تعديل الكورسات للمسؤولين فقط" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name != null) {
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "اسم الكورس مطلوب" }, { status: 400 });
    patch.name = name;
  }
  if (body.slug != null) {
    patch.slug = slugifyCourseName(String(body.slug));
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("courses")
    .update(patch)
    .eq("id", id)
    .select("id,name,slug,created_by,created_at,updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 404 });

  await admin
    .from("reviews")
    .update({ category: data.slug, updated_at: new Date().toISOString() })
    .eq("course_id", id);

  return NextResponse.json({ course: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user || !auth.profile?.is_active) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (!isStaff(auth.profile.role)) {
    return NextResponse.json({ error: "حذف الكورسات للمسؤولين فقط" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("courses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
