"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MetricCard from "@/components/MetricCard";
import Skeleton from "@/components/Skeleton";
import { courseLabel } from "@/lib/categories";
import { statusLabel, verdictLabel } from "@/lib/reports";

type Analytics = {
  scope: string;
  role?: string;
  totals: {
    evaluations: number;
    completed: number;
    failed: number;
    queued: number;
    avg_duration_ms: number;
    avg_quality_score: number;
    total_cost_usd: number;
    findings: number;
    avg_findings: number;
    wow_percent: number;
    success_rate: number;
    fail_rate: number;
  };
  trend: { date: string; count: number }[];
  verdicts: { label: string; value: number }[];
  statuses: { label: string; value: number }[];
  providers: { label: string; value: number }[];
  categories: { label: string; value: number }[];
  recent: {
    id: string;
    video_name: string | null;
    status: string;
    proposed_verdict: string | null;
    findings_count: number;
    quality_score: number | null;
    provider: string | null;
    category?: string | null;
    created_at: string;
  }[];
  insights: string[];
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
  const statusMax = Math.max(1, ...(data?.statuses.map((v) => v.value) || [1]));
  const providerMax = Math.max(1, ...(data?.providers.map((v) => v.value) || [1]));
  const categoryMax = Math.max(1, ...(data?.categories?.map((v) => v.value) || [1]));

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">لوحة التحليل</h1>
          <p className="page-sub">
            نظرة تنفيذية على جودة التقييمات والأداء
            {data
              ? ` · ${data.scope === "organization" ? "نطاق المؤسسة" : "نطاقك الشخصي"}${
                  data.role ? ` · ${data.role}` : ""
                }`
              : ""}
          </p>
        </div>
        <Link className="btn" href="/app/review">
          مراجعة جديدة
        </Link>
      </div>

      {loading ? <Skeleton rows={8} /> : null}
      {err ? <div className="banner error">{err}</div> : null}

      {data ? (
        <div className="dash-stack">
          <section className="metrics">
            <MetricCard
              label="إجمالي التقييمات"
              value={data.totals.evaluations}
              hint={`${data.totals.completed} مكتملة · WoW ${data.totals.wow_percent}%`}
              ring={data.totals.success_rate}
            />
            <MetricCard
              label="معدل النجاح"
              value={`${data.totals.success_rate}%`}
              hint={`فشل ${data.totals.fail_rate}% · قيد الانتظار ${data.totals.queued}`}
              ring={data.totals.success_rate}
            />
            <MetricCard
              label="متوسط الجودة"
              value={data.totals.avg_quality_score || "—"}
              hint={`زمن متوسط ${
                data.totals.avg_duration_ms ? `${(data.totals.avg_duration_ms / 1000).toFixed(1)}ث` : "—"
              }`}
              ring={Math.min(100, Number(data.totals.avg_quality_score) || 0)}
            />
            <MetricCard
              label="التكلفة والملاحظات"
              value={`$${data.totals.total_cost_usd}`}
              hint={`${data.totals.findings} ملاحظة · متوسط ${data.totals.avg_findings}`}
            />
          </section>

          <section className="insights glass">
            <h2>ملخص تشغيلي</h2>
            <ul>
              {data.insights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="grid-2">
            <article className="chart-card glass">
              <h2>اتجاه التقييمات (14 يوم)</h2>
              <div className="bars">
                {data.trend.length ? (
                  data.trend.map((t) => (
                    <div
                      key={t.date}
                      className="bar"
                      style={{ height: `${Math.max(8, (t.count / maxBar) * 160)}px` }}
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
              <h2>حسب الكورس</h2>
              <div className="verdict-list">
                {(data.categories || []).length ? (
                  data.categories.map((v) => (
                    <div className="verdict-row" key={v.label}>
                      <span>{courseLabel(v.label)}</span>
                      <div className="verdict-track">
                        <div className="verdict-fill" style={{ width: `${(v.value / categoryMax) * 100}%` }} />
                      </div>
                      <strong>{v.value}</strong>
                    </div>
                  ))
                ) : (
                  <p className="help">ابدأ بتصنيف التقييمات لتظهر هنا.</p>
                )}
              </div>
            </article>
          </section>

          <section className="grid-2">
            <article className="chart-card glass">
              <h2>توزيع الأحكام</h2>
              <div className="verdict-list">
                {data.verdicts.length ? (
                  data.verdicts.map((v) => (
                    <div className="verdict-row" key={v.label}>
                      <span>{verdictLabel(v.label)}</span>
                      <div className="verdict-track">
                        <div className="verdict-fill" style={{ width: `${(v.value / verdictMax) * 100}%` }} />
                      </div>
                      <strong>{v.value}</strong>
                    </div>
                  ))
                ) : (
                  <p className="help">ابدأ بمراجعة لتظهر الإحصاءات.</p>
                )}
              </div>
            </article>
            <article className="chart-card glass">
              <h2>الحالات والمزوّدون</h2>
              <div className="verdict-list">
                {data.statuses.map((v) => (
                  <div className="verdict-row" key={`s-${v.label}`}>
                    <span>{statusLabel(v.label)}</span>
                    <div className="verdict-track">
                      <div className="verdict-fill" style={{ width: `${(v.value / statusMax) * 100}%` }} />
                    </div>
                    <strong>{v.value}</strong>
                  </div>
                ))}
                {data.providers.map((v) => (
                  <div className="verdict-row" key={`p-${v.label}`}>
                    <span>{v.label}</span>
                    <div className="verdict-track">
                      <div
                        className="verdict-fill"
                        style={{ width: `${(v.value / providerMax) * 100}%`, background: "var(--brand-2)" }}
                      />
                    </div>
                    <strong>{v.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel recent-panel">
            <div className="label-row" style={{ marginBottom: "0.8rem" }}>
              <h2 className="section-title">أحدث التقييمات</h2>
              <Link className="btn secondary btn-sm" href="/app/reports">
                كل التقارير
              </Link>
            </div>
            {data.recent.length ? (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الفيديو</th>
                      <th>الكورس</th>
                      <th>الحالة</th>
                      <th>الحكم</th>
                      <th>الجودة</th>
                      <th>التاريخ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.id}>
                        <td>{r.video_name || r.id}</td>
                        <td>{courseLabel(r.category)}</td>
                        <td>
                          <span className="pill">{statusLabel(r.status)}</span>
                        </td>
                        <td>{verdictLabel(r.proposed_verdict)}</td>
                        <td>{r.quality_score ?? "—"}</td>
                        <td>{new Date(r.created_at).toLocaleString("ar")}</td>
                        <td>
                          <Link className="btn secondary btn-sm" href={`/app/reports/${encodeURIComponent(r.id)}`}>
                            فتح
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="help">لا توجد تقييمات حديثة.</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
