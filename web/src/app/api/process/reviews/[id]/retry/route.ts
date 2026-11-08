import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

function processBase() {
  return (process.env.PROCESS_API_URL || process.env.NEXT_PUBLIC_PROCESS_API_URL || "").replace(/\/$/, "");
}

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!auth.user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

  const base = processBase();
  if (!base) {
    return NextResponse.json({ error: "معالج الفيديو غير مربوط" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: review, error } = await admin.from("reviews").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!review) return NextResponse.json({ error: "المراجعة غير موجودة" }, { status: 404 });
  if (review.user_id !== auth.user.id && auth.profile?.role !== "super_admin" && auth.profile?.role !== "admin") {
    return NextResponse.json({ error: "غير مسموح" }, { status: 403 });
  }
  if (!review.drive_url) {
    return NextResponse.json({ error: "إعادة المعالجة متاحة حالياً لمراجعات Drive فقط" }, { status: 400 });
  }

  await admin
    .from("reviews")
    .update({
      status: "queued",
      proposed_verdict: null,
      findings_count: 0,
      quality_score: null,
      report: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const {
    data: { session },
  } = await auth.supabase.auth.getSession();
  const token = session?.access_token || "";

  const body = new FormData();
  body.set("provider", review.provider || "groq");
  body.set("model", review.model || "");
  body.set("review_id", id);
  body.set("drive_url", review.drive_url);

  let res: Response;
  try {
    res = await fetch(`${base}/api/reviews`, {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "bypass-tunnel-reminder": "1",
        "User-Agent": "InstantPlus-Processor-Proxy/1.0",
      },
      body,
    });
  } catch (err: unknown) {
    await admin.from("reviews").update({ status: "failed" }).eq("id", id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "تعذر الوصول للمعالج" },
      { status: 502 }
    );
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    await admin.from("reviews").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ error: json.detail || json.error || "فشل إعادة المعالجة" }, { status: res.status });
  }

  return NextResponse.json({ ok: true, review_id: id, ...json });
}
