import { NextResponse } from "next/server";
import { isStaff } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { normalizeCourseKey, normalizeSessionTitle, normalizeTags } from "@/lib/categories";
import { withOrgMeta } from "@/lib/orgMeta";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user || !auth.profile?.is_active) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  const { data: review, error } = await admin
    .from("reviews")
    .select("id,user_id,report,category,tags,session_title")
    .eq("id", id)
    .maybeSingle();

  if (error && !String(error.message || "").includes("category") && !String(error.message || "").includes("session_title")) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: fallback } =
    review
      ? { data: review }
      : await admin.from("reviews").select("id,user_id,report").eq("id", id).maybeSingle();

  const current = (review || fallback) as {
    id: string;
    user_id: string;
    report?: Record<string, unknown> | null;
    category?: string | null;
    tags?: string[] | null;
    session_title?: string | null;
  } | null;

  if (!current) return NextResponse.json({ error: "التقرير غير موجود" }, { status: 404 });

  const canManage = current.user_id === auth.user.id || isStaff(auth.profile.role);
  if (!canManage) return NextResponse.json({ error: "غير مسموح" }, { status: 403 });

  const nextCategory =
    body.category != null ? normalizeCourseKey(String(body.category)) : current.category || "general";
  if (!nextCategory) {
    return NextResponse.json({ error: "اسم الكورس مطلوب" }, { status: 400 });
  }
  const nextTags = body.tags != null ? normalizeTags(body.tags) : current.tags || [];
  const nextTitle =
    body.session_title != null
      ? normalizeSessionTitle(body.session_title)
      : normalizeSessionTitle(current.session_title);

  const patchedReport = withOrgMeta(current.report as never, {
    category: nextCategory,
    tags: nextTags,
    session_title: nextTitle,
  });

  const patch: Record<string, unknown> = {
    report: patchedReport,
    updated_at: new Date().toISOString(),
    category: nextCategory,
    tags: nextTags,
    session_title: nextTitle || null,
  };

  let { error: updateErr } = await admin.from("reviews").update(patch).eq("id", id);
  if (
    updateErr &&
    (String(updateErr.message || "").includes("category") ||
      String(updateErr.message || "").includes("session_title"))
  ) {
    const soft = { report: patchedReport, updated_at: patch.updated_at };
    const retry = await admin.from("reviews").update(soft).eq("id", id);
    updateErr = retry.error;
  }
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id,
    category: patchedReport._org.category,
    tags: patchedReport._org.tags,
    session_title: patchedReport._org.session_title,
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user || !auth.profile?.is_active) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (!isStaff(auth.profile.role)) {
    return NextResponse.json({ error: "حذف التقارير متاح للمسؤولين فقط" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
