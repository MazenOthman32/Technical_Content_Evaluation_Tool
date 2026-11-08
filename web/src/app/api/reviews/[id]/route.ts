import { NextResponse } from "next/server";
import { isStaff } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { normalizeSessionTitle, normalizeTags } from "@/lib/categories";
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
    .select("id,user_id,report,category,tags,session_title,course_id")
    .eq("id", id)
    .maybeSingle();

  if (
    error &&
    !String(error.message || "").includes("category") &&
    !String(error.message || "").includes("session_title") &&
    !String(error.message || "").includes("course_id")
  ) {
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
    course_id?: string | null;
  } | null;

  if (!current) return NextResponse.json({ error: "التقرير غير موجود" }, { status: 404 });

  const canManage = current.user_id === auth.user.id || isStaff(auth.profile.role);
  if (!canManage) return NextResponse.json({ error: "غير مسموح" }, { status: 403 });

  let nextCourseId = current.course_id || null;
  let nextCategory = current.category || "general";

  if (body.course_id != null) {
    const courseId = String(body.course_id || "").trim();
    if (!courseId) {
      nextCourseId = null;
      nextCategory = "general";
    } else {
      const { data: course, error: courseErr } = await admin
        .from("courses")
        .select("id,name,slug")
        .eq("id", courseId)
        .maybeSingle();
      if (courseErr) return NextResponse.json({ error: courseErr.message }, { status: 500 });
      if (!course) return NextResponse.json({ error: "الكورس غير موجود" }, { status: 400 });
      nextCourseId = course.id;
      nextCategory = course.slug;
    }
  } else if (body.category != null) {
    nextCategory = String(body.category || "general").trim().slice(0, 80) || "general";
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
    course_id: nextCourseId || undefined,
  });

  const patch: Record<string, unknown> = {
    report: patchedReport,
    updated_at: new Date().toISOString(),
    category: nextCategory,
    tags: nextTags,
    session_title: nextTitle || null,
    course_id: nextCourseId,
  };

  let { error: updateErr } = await admin.from("reviews").update(patch).eq("id", id);
  if (
    updateErr &&
    (String(updateErr.message || "").includes("category") ||
      String(updateErr.message || "").includes("session_title") ||
      String(updateErr.message || "").includes("course_id"))
  ) {
    const soft: Record<string, unknown> = { report: patchedReport, updated_at: patch.updated_at };
    if (!String(updateErr.message || "").includes("session_title")) soft.session_title = nextTitle || null;
    if (!String(updateErr.message || "").includes("category")) soft.category = nextCategory;
    const retry = await admin.from("reviews").update(soft).eq("id", id);
    updateErr = retry.error;
  }
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const { data: course } = nextCourseId
    ? await admin.from("courses").select("id,name,slug").eq("id", nextCourseId).maybeSingle()
    : { data: null };

  return NextResponse.json({
    ok: true,
    id,
    category: patchedReport._org.category,
    tags: patchedReport._org.tags,
    session_title: patchedReport._org.session_title,
    course_id: nextCourseId,
    course,
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
