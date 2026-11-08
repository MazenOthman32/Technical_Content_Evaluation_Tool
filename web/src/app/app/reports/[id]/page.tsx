"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Skeleton from "@/components/Skeleton";
import {
  Finding,
  ReportPayload,
  ReviewRow,
  countBySeverity,
  hasReportContent,
  severityLabel,
  statusLabel,
  verdictLabel,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id || "");
  const [row, setRow] = useState<ReviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sev, setSev] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load(first = false) {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id,video_name,drive_url,provider,model,status,proposed_verdict,findings_count,quality_score,duration_ms,cost,created_at,report"
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) setErr(error.message);
      else if (!data) setErr("التقرير غير موجود");
      else {
        setRow(data as ReviewRow);
        setErr("");
        const st = data.status;
        if (st === "queued" || st === "running" || st === "downloading") {
          timer = setTimeout(() => load(false), 4000);
        }
      }
      if (first) setLoading(false);
    }

    load(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const report = (row?.report || null) as ReportPayload | null;
  const findings = useMemo(() => (report?.findings || []) as Finding[], [report]);
  const filtered = useMemo(
    () =>
      findings.filter((f) => {
        if (sev && f.severity !== sev) return false;
        if (cat && f.category !== cat) return false;
        return true;
      }),
    [findings, sev, cat]
  );
  const selected = findings.find((f) => f.id === selectedId) || filtered[0] || null;
  const counts = countBySeverity(findings);
  const ready = hasReportContent(report);

  function downloadJson() {
    if (!row) return;
    const blob = new Blob([JSON.stringify(report || row, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown() {
    if (!row) return;
    const md =
      report?.markdown ||
      [
        `# تقرير مراجعة — ${row.video_name || row.id}`,
        "",
        `**الحالة:** ${statusLabel(row.status)}`,
        `**الحكم:** ${verdictLabel(report?.proposed_verdict || row.proposed_verdict)}`,
        `**الملاحظات:** ${findings.length}`,
        "",
        ...findings.flatMap((f) => [
          `## ${f.id} — ${f.summary || ""}`,
          `- الوقت: ${f.t_start || "—"} → ${f.t_end || "—"}`,
          `- الخطورة: ${severityLabel(f.severity)}`,
          `- الفئة: ${f.category || "—"}`,
          `- الدليل: ${f.evidence?.quote || "—"}`,
          `- المتوقع: ${f.expected || "—"}`,
          `- التصحيح: ${f.correction || "—"}`,
          "",
        ]),
      ].join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="page-fill">
        <Skeleton rows={6} />
      </div>
    );
  }

  if (err || !row) {
    return (
      <div className="page-fill">
        <div className="page-head">
          <div>
            <h1 className="page-title">التقرير</h1>
            <p className="page-sub">{err || "غير موجود"}</p>
          </div>
          <Link className="btn secondary" href="/app/reports">
            رجوع للتقارير
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">{row.video_name || row.id}</h1>
          <p className="page-sub">
            {new Date(row.created_at).toLocaleString("ar")} · {row.provider || "—"} / {row.model || report?.model || "—"}
          </p>
        </div>
        <div className="row-actions">
          <Link className="btn secondary btn-sm" href="/app/reports">
            كل التقارير
          </Link>
          <button className="btn secondary btn-sm" type="button" onClick={downloadMarkdown}>
            تنزيل Markdown
          </button>
          <button className="btn secondary btn-sm" type="button" onClick={downloadJson}>
            تنزيل JSON
          </button>
        </div>
      </div>

      <div className="report-summary">
        <div className="stat-card">
          <div className="help">الحالة</div>
          <strong>{statusLabel(row.status)}</strong>
        </div>
        <div className="stat-card">
          <div className="help">الحكم</div>
          <strong>{verdictLabel(report?.proposed_verdict || row.proposed_verdict)}</strong>
        </div>
        <div className="stat-card">
          <div className="help">الملاحظات</div>
          <strong>{findings.length || row.findings_count || 0}</strong>
        </div>
        <div className="stat-card">
          <div className="help">الجودة</div>
          <strong>{row.quality_score ?? "—"}</strong>
        </div>
        <div className="stat-card">
          <div className="help">حرج / متوسط / بسيط</div>
          <strong>
            {counts.critical} / {counts.medium} / {counts.minor}
          </strong>
        </div>
      </div>

      {!ready ? (
        <div className="panel banner warn settings-panel">
          <strong>التقرير لسه مش جاهز للمراجعة.</strong>
          <p className="help" style={{ margin: "0.4rem 0 0" }}>
            الطلب محفوظ بحالة «{statusLabel(row.status)}» بدون نتائج تحليل. شغّل معالج الفيديو واربط{" "}
            <code>NEXT_PUBLIC_PROCESS_API_URL</code> ثم أعد إرسال المراجعة عشان يظهر تقرير كامل هنا.
          </p>
          {row.drive_url ? (
            <p className="help" style={{ marginTop: "0.55rem" }}>
              المصدر:{" "}
              <a href={row.drive_url} target="_blank" rel="noreferrer">
                رابط Drive
              </a>
            </p>
          ) : null}
          <div className="row-actions" style={{ marginTop: "0.85rem" }}>
            <Link className="btn" href="/app/review">
              مراجعة جديدة
            </Link>
          </div>
        </div>
      ) : (
        <div className="report-layout">
          <div className="panel report-list">
            <div className="label-row" style={{ marginBottom: "0.75rem" }}>
              <h2 className="section-title">الملاحظات</h2>
              <span className="help">{filtered.length} ظاهرة</span>
            </div>
            <div className="form-grid" style={{ marginBottom: "0.75rem" }}>
              <label>
                الخطورة
                <select value={sev} onChange={(e) => setSev(e.target.value)}>
                  <option value="">الكل</option>
                  <option value="critical">حرج</option>
                  <option value="medium">متوسط</option>
                  <option value="minor">بسيط</option>
                  <option value="unsure">غير مؤكد</option>
                </select>
              </label>
              <label>
                الفئة
                <select value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">الكل</option>
                  {[...new Set(findings.map((f) => f.category).filter(Boolean))].map((c) => (
                    <option key={String(c)} value={String(c)}>
                      {String(c)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="findings-list">
              {!filtered.length ? <p className="help">لا توجد ملاحظات مطابقة.</p> : null}
              {filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`finding-card ${selected?.id === f.id ? "active" : ""}`}
                  onClick={() => setSelectedId(f.id)}
                >
                  <strong>
                    {f.id} — {f.summary || "بدون ملخص"}
                  </strong>
                  <div className="meta">
                    <span className={`pill sev-${f.severity || "unsure"}`}>{severityLabel(f.severity)}</span>
                    <span className="pill">{f.category || "—"}</span>
                    <span className="pill">
                      {f.t_start || "—"} → {f.t_end || "—"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel report-detail">
            {!selected ? (
              <p className="help">اختر ملاحظة لعرض التفاصيل.</p>
            ) : (
              <>
                <h2 className="section-title">
                  {selected.id} — {selected.summary}
                </h2>
                <div className="meta" style={{ margin: "0.65rem 0 1rem" }}>
                  <span className={`pill sev-${selected.severity || "unsure"}`}>
                    {severityLabel(selected.severity)}
                  </span>
                  <span className="pill">{selected.category || "—"}</span>
                  <span className="pill">{selected.confidence || "—"}</span>
                  <span className="pill">
                    {selected.t_start || "—"} → {selected.t_end || "—"}
                  </span>
                </div>
                <div className="evidence-block">
                  <div className="help">الدليل</div>
                  <p>{selected.evidence?.quote || "—"}</p>
                </div>
                {selected.evidence?.ocr_text ? (
                  <div className="evidence-block">
                    <div className="help">OCR</div>
                    <p>
                      <code>{selected.evidence.ocr_text}</code>
                    </p>
                  </div>
                ) : null}
                <div className="evidence-block">
                  <div className="help">المتوقع</div>
                  <p>{selected.expected || "—"}</p>
                </div>
                <div className="evidence-block">
                  <div className="help">التصحيح المقترح</div>
                  <p>{selected.correction || "—"}</p>
                </div>
                {selected.note ? (
                  <div className="evidence-block">
                    <div className="help">تنبيه</div>
                    <p>{selected.note}</p>
                  </div>
                ) : null}
              </>
            )}

            {report?.limitations?.length ? (
              <div style={{ marginTop: "1.25rem" }}>
                <h3 className="section-title" style={{ fontSize: "1rem" }}>
                  حدود المعالجة
                </h3>
                <ul className="limits-list">
                  {report.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
