"use client";

import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import Skeleton from "@/components/Skeleton";

type Analytics = {
  scope: string;
  totals: {
    evaluations: number;
    completed: number;
    avg_duration_ms: number;
    avg_quality_score: number;
    total_cost_usd: number;
    findings: number;
  };
  trend: { date: string; count: number }[];
  verdicts: { label: string; value: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "فشل التحميل");
        setData(json);
      } catch (ex: unknown) {
        setErr(ex instanceof Error ? ex.message : "خطأ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxBar = Math.max(1, ...(data?.trend.map((t) => t.count) || [1]));
  const verdictMax = Math.max(1, ...(data?.verdicts.map((v) => v.value) || [1]));
  const completionRate = data?.totals.evaluations
    ? Math.round((data.totals.completed / data.totals.evaluations) * 100)
    : 0;

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <h1 className="page-title">لوحة التحليلات</h1>
        <p className="page-sub">
          مؤشرات الأداء والجودة {data ? `· نطاق: ${data.scope === "organization" ? "المؤسسة" : "حسابك"}` : ""}
        </p>
      </div>

      {loading ? <Skeleton rows={6} /> : null}
      {err ? <div className="banner error">{err}</div> : null}

      {data ? (
        <>
          <section className="metrics">
            <MetricCard
              label="إجمالي التقييمات"
              value={data.totals.evaluations}
              hint={`${data.totals.completed} مكتملة`}
              ring={completionRate}
            />
            <MetricCard
              label="متوسط زمن الاستجابة"
              value={data.totals.avg_duration_ms ? `${(data.totals.avg_duration_ms / 1000).toFixed(1)}ث` : "—"}
              hint="من بيانات المعالجة"
            />
            <MetricCard
              label="متوسط جودة النتيجة"
              value={data.totals.avg_quality_score || "—"}
              hint="quality score"
              ring={Math.min(100, Number(data.totals.avg_quality_score) || 0)}
            />
            <MetricCard
              label="الاستخدام / التكلفة"
              value={`$${data.totals.total_cost_usd}`}
              hint={`${data.totals.findings} ملاحظة`}
            />
          </section>

          <section className="grid-2">
            <article className="chart-card glass">
              <h2 style={{ margin: 0, fontSize: "1rem" }}>اتجاه التقييمات (14 يوم)</h2>
              <div className="bars">
                {data.trend.length ? (
                  data.trend.map((t) => (
                    <div
                      key={t.date}
                      className="bar"
                      style={{ height: `${Math.max(8, (t.count / maxBar) * 140)}px` }}
                      title={`${t.date}: ${t.count}`}
                    >
                      <span>{t.date.slice(5)}</span>
                    </div>
                  ))
                ) : (
                  <p className="help">لا توجد بيانات كافية بعد.</p>
                )}
              </div>
            </article>

            <article className="chart-card glass">
              <h2 style={{ margin: 0, fontSize: "1rem" }}>توزيع الأحكام</h2>
              <div className="verdict-list">
                {data.verdicts.length ? (
                  data.verdicts.map((v) => (
                    <div className="verdict-row" key={v.label}>
                      <span>{v.label}</span>
                      <div className="verdict-track">
                        <div
                          className="verdict-fill"
                          style={{ width: `${(v.value / verdictMax) * 100}%` }}
                        />
                      </div>
                      <strong>{v.value}</strong>
                    </div>
                  ))
                ) : (
                  <p className="help">ابدأ بمراجعة لتظهر الإحصاءات.</p>
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
