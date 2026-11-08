import { NextResponse } from "next/server";
import { isStaff } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export async function GET() {
  const ctx = await requireUser();
  if (!ctx.user || !ctx.profile?.is_active) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
  }

  let query = ctx.supabase
    .from("reviews")
    .select(
      "id,status,proposed_verdict,findings_count,quality_score,duration_ms,cost,created_at,user_id,provider,model,video_name"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!isStaff(ctx.profile.role)) {
    query = query.eq("user_id", ctx.user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const total = rows.length;
  const completed = rows.filter((r) =>
    ["done", "completed", "ready"].includes((r.status || "").toLowerCase())
  );
  const failed = rows.filter((r) =>
    ["failed", "error"].includes((r.status || "").toLowerCase())
  );
  const queued = rows.filter((r) =>
    ["queued", "awaiting_backend", "processing", "running"].includes((r.status || "").toLowerCase())
  );

  const durations = rows
    .map((r) => r.duration_ms)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const scores = rows
    .map((r) => r.quality_score)
    .filter((n): n is number => typeof n === "number");
  const costs = rows.map((r) => Number(r.cost || 0));
  const findingsTotal = rows.reduce((a, r) => a + (r.findings_count || 0), 0);

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    byDay.set(k, (byDay.get(k) || 0) + 1);
  }
  const trend = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, count]) => ({ date, count }));

  const last7 = trend.slice(-7).reduce((a, t) => a + t.count, 0);
  const prev7 = trend.slice(-14, -7).reduce((a, t) => a + t.count, 0);
  const wow =
    prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

  const verdicts = new Map<string, number>();
  const statuses = new Map<string, number>();
  const providers = new Map<string, number>();
  for (const r of rows) {
    verdicts.set(r.proposed_verdict || "pending", (verdicts.get(r.proposed_verdict || "pending") || 0) + 1);
    statuses.set(r.status || "unknown", (statuses.get(r.status || "unknown") || 0) + 1);
    providers.set(r.provider || "unknown", (providers.get(r.provider || "unknown") || 0) + 1);
  }

  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const avgScore = scores.length
    ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1))
    : 0;
  const totalCost = Number(costs.reduce((a, b) => a + b, 0).toFixed(2));
  const avgFindings = total ? Number((findingsTotal / total).toFixed(1)) : 0;

  const recent = rows.slice(0, 8).map((r) => ({
    id: r.id,
    video_name: r.video_name,
    status: r.status,
    proposed_verdict: r.proposed_verdict,
    findings_count: r.findings_count || 0,
    quality_score: r.quality_score,
    provider: r.provider,
    created_at: r.created_at,
  }));

  const insights: string[] = [];
  if (!total) {
    insights.push("لا توجد تقييمات بعد — ابدأ بمراجعة جديدة لتظهر التحليلات.");
  } else {
    insights.push(
      `معدل الإكمال ${Math.round((completed.length / total) * 100)}% (${completed.length}/${total}).`
    );
    if (wow !== 0) {
      insights.push(
        wow > 0
          ? `النشاط ارتفع ${wow}% مقارنة بالأسبوع السابق.`
          : `النشاط انخفض ${Math.abs(wow)}% مقارنة بالأسبوع السابق.`
      );
    }
    if (avgFindings > 0) {
      insights.push(`متوسط الملاحظات لكل تقييم: ${avgFindings}.`);
    }
    if (failed.length) {
      insights.push(`هناك ${failed.length} تقييمات فاشلة تحتاج مراجعة تشغيلية.`);
    }
    if (queued.length) {
      insights.push(`${queued.length} تقييمات ما زالت في الطابور/المعالجة.`);
    }
    const topProvider = [...providers.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topProvider) {
      insights.push(`أكثر مزود استخدامًا: ${topProvider[0]} (${topProvider[1]}).`);
    }
  }

  return NextResponse.json({
    scope: isStaff(ctx.profile.role) ? "organization" : "personal",
    role: ctx.profile.role,
    totals: {
      evaluations: total,
      completed: completed.length,
      failed: failed.length,
      queued: queued.length,
      avg_duration_ms: avgDuration,
      avg_quality_score: avgScore,
      total_cost_usd: totalCost,
      findings: findingsTotal,
      avg_findings: avgFindings,
      wow_percent: wow,
    },
    trend,
    verdicts: [...verdicts.entries()].map(([label, value]) => ({ label, value })),
    statuses: [...statuses.entries()].map(([label, value]) => ({ label, value })),
    providers: [...providers.entries()].map(([label, value]) => ({ label, value })),
    recent,
    insights,
  });
}
