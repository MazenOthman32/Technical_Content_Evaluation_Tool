"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Skeleton from "@/components/Skeleton";
import { ReviewRow, hasReportContent, statusLabel, verdictLabel } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export default function ReportsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("reviews")
        .select(
          "id,video_name,status,proposed_verdict,findings_count,quality_score,created_at,report,provider,model"
        )
        .order("created_at", { ascending: false });
      setRows((data as ReviewRow[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">التقارير</h1>
          <p className="page-sub">افتح أي تقييم وراجع الملاحظات والحكم المقترح بالكامل</p>
        </div>
      </div>
      <div className="panel settings-panel reports-list">
        {loading ? <Skeleton rows={4} /> : null}
        {!loading && !rows.length ? <p className="help">لا توجد تقارير بعد. ابدأ من «مراجعة جديدة».</p> : null}
        {rows.map((r) => {
          const ready = hasReportContent(r.report);
          return (
            <div key={r.id} className="report-row">
              <div className="report-row-main">
                <strong className="report-row-title">{r.video_name || r.id}</strong>
                <div className="help">
                  {new Date(r.created_at).toLocaleString("ar")} · {statusLabel(r.status)} ·{" "}
                  {verdictLabel(r.proposed_verdict || r.report?.proposed_verdict)} ·{" "}
                  {r.findings_count ?? r.report?.findings?.length ?? 0} ملاحظة
                </div>
                {!ready ? (
                  <div className="help" style={{ color: "var(--warn)", marginTop: 4 }}>
                    لسه مفيش نتائج تحليل — التقرير مش جاهز للمراجعة
                  </div>
                ) : null}
              </div>
              <div className="row-actions">
                <Link className={`btn ${ready ? "" : "secondary"} btn-sm`} href={`/app/reports/${encodeURIComponent(r.id)}`}>
                  {ready ? "فتح التقرير" : "عرض الحالة"}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
