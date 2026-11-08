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
    .select("id,status,proposed_verdict,findings_count,quality_score,duration_ms,cost,created_at,user_id")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!isStaff(ctx.profile.role)) {
    query = query.eq("user_id", ctx.user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const total = rows.length;
  const completed = rows.filter((r) => ["done", "completed", "ready"].includes((r.status || "").toLowerCase()));
  const durations = rows.map((r) => r.duration_ms).filter((n): n is number => typeof n === "number" && n > 0);
  const scores = rows
    .map((r) => r.quality_score)
    .filter((n): n is number => typeof n === "number");
  const costs = rows.map((r) => Number(r.cost || 0));

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    byDay.set(k, (byDay.get(k) || 0) + 1);
  }
  const trend = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, count]) => ({ date, count }));

  const verdicts = new Map<string, number>();
  for (const r of rows) {
    const v = r.proposed_verdict || "pending";
    verdicts.set(v, (verdicts.get(v) || 0) + 1);
  }

  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const avgScore = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;
  const totalCost = Number(costs.reduce((a, b) => a + b, 0).toFixed(2));

  return NextResponse.json({
    scope: isStaff(ctx.profile.role) ? "organization" : "personal",
    totals: {
      evaluations: total,
      completed: completed.length,
      avg_duration_ms: avgDuration,
      avg_quality_score: avgScore,
      total_cost_usd: totalCost,
      findings: rows.reduce((a, r) => a + (r.findings_count || 0), 0),
    },
    trend,
    verdicts: [...verdicts.entries()].map(([label, value]) => ({ label, value })),
  });
}
