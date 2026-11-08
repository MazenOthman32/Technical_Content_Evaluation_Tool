"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isStaff } from "@/lib/auth/roles";
import { COURSE_CATALOG, courseLabel, normalizeTags } from "@/lib/categories";
import { readOrgMeta } from "@/lib/orgMeta";
import { exportReviewPdf } from "@/lib/pdfReport";
import {
  Finding,
  ReportPayload,
  ReviewRow,
  countBySeverity,
  displaySessionTitle,
  hasReportContent,
  severityLabel,
  statusLabel,
  verdictLabel,
} from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = decodeURIComponent(params.id || "");
  const [row, setRow] = useState<ReviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [role, setRole] = useState("reviewer");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sev, setSev] = useState("");
  const [cat, setCat] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [courseDraft, setCourseDraft] = useState("general");
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load(first = false) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (!cancelled) setRole(profile?.role || "reviewer");
      }
      let { data, error } = await supabase
        .from("reviews")
        .select(
          "id,video_name,session_title,drive_url,provider,model,status,proposed_verdict,findings_count,quality_score,duration_ms,cost,created_at,report,category,tags"
        )
        .eq("id", id)
        .maybeSingle();
      if (
        error &&
        (String(error.message || "").includes("category") ||
          String(error.message || "").includes("session_title"))
      ) {
        const fallback = await supabase
          .from("reviews")
          .select(
            "id,video_name,drive_url,provider,model,status,proposed_verdict,findings_count,quality_score,duration_ms,cost,created_at,report"
          )
          .eq("id", id)
          .maybeSingle();
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (cancelled) return;
      if (error) setErr(error.message);
      else if (!data) setErr("التقرير غير موجود");
      else {
        const enriched = { ...(data as ReviewRow), ...readOrgMeta(data as ReviewRow) };
        setRow(enriched);
        if (first) {
          setTitleDraft(enriched.session_title || "");
          setCourseDraft(courseLabel(enriched.category || "general"));
        }
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

  async function retryProcessing() {
    if (!row?.drive_url) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/process/reviews/${encodeURIComponent(row.id)}/retry`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "فشل إعادة المعالجة");
      setRow((prev) =>
        prev ? { ...prev, status: "queued", report: null, proposed_verdict: null, findings_count: 0 } : prev
      );
      toast.push("تمت إعادة إرسال المراجعة للمعالج", "ok");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل إعادة المعالجة", "error");
    } finally {
      setRetrying(false);
    }
  }

  async function saveMeta(next: { category?: string; tags?: string[]; session_title?: string }) {
    if (!row) return;
    setSavingMeta(true);
    const previous = row;
    setRow({ ...row, ...next });
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "فشل الحفظ");
      setRow((prev) =>
        prev
          ? {
              ...prev,
              category: json.category || next.category || prev.category,
              tags: json.tags || next.tags || prev.tags,
              session_title: json.session_title ?? next.session_title ?? prev.session_title,
            }
          : prev
      );
      if (json.session_title != null) setTitleDraft(json.session_title);
      if (json.category != null) setCourseDraft(courseLabel(json.category));
      toast.push("تم حفظ بيانات السيشن", "ok");
    } catch (ex: unknown) {
      setRow(previous);
      toast.push(ex instanceof Error ? ex.message : "فشل الحفظ", "error");
    } finally {
      setSavingMeta(false);
    }
  }

  async function exportPdf() {
    if (!row) return;
    setPdfBusy(true);
    try {
      await exportReviewPdf(row);
      toast.push("تم تنزيل PDF", "ok");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل تصدير PDF", "error");
    } finally {
      setPdfBusy(false);
    }
  }

  async function confirmDelete() {
    if (!row) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "فشل الحذف");
      toast.push("تم حذف التقرير", "ok");
      router.replace("/app/reports");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل الحذف", "error");
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page-fill">
        <Skeleton rows={6} />
      </div>
    );
  }

  if ((err && !row) || !row) {
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
          <h1 className="page-title">{displaySessionTitle(row)}</h1>
          <p className="page-sub">
            {courseLabel(row.category)} · {new Date(row.created_at).toLocaleString("ar")} ·{" "}
            {row.provider || "—"} / {row.model || report?.model || "—"}
          </p>
        </div>
        <div className="row-actions">
          <Link className="btn secondary btn-sm" href="/app/reports">
            كل التقارير
          </Link>
          <button className="btn btn-sm" type="button" disabled={pdfBusy} onClick={exportPdf}>
            {pdfBusy ? "جاري PDF..." : "تنزيل PDF"}
          </button>
          {isStaff(role) ? (
            <button className="btn secondary btn-sm btn-danger" type="button" onClick={() => setDeleteOpen(true)}>
              حذف
            </button>
          ) : null}
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

      <div className="panel meta-editor settings-panel">
        <div className="form-grid">
          <label>
            عنوان السيشن
            <div className="inline-add">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="عنوان واضح للسيشن"
                maxLength={160}
                disabled={savingMeta}
              />
              <button
                className="btn secondary btn-sm"
                type="button"
                disabled={savingMeta || !titleDraft.trim() || titleDraft.trim() === (row.session_title || "")}
                onClick={() => saveMeta({ session_title: titleDraft })}
              >
                حفظ
              </button>
            </div>
          </label>
          <label>
            الكورس
            <div className="inline-add">
              <input
                list="course-catalog"
                value={courseDraft}
                onChange={(e) => setCourseDraft(e.target.value)}
                placeholder="اسم الكورس أو اختر من القائمة"
                maxLength={80}
                disabled={savingMeta}
              />
              <datalist id="course-catalog">
                {COURSE_CATALOG.map((c) => (
                  <option key={c.id} value={c.labelAr} />
                ))}
              </datalist>
              <button
                className="btn secondary btn-sm"
                type="button"
                disabled={savingMeta || !courseDraft.trim() || courseDraft.trim() === (row.category || "")}
                onClick={() => saveMeta({ category: courseDraft })}
              >
                حفظ
              </button>
            </div>
          </label>
          <label>
            وحدة / وسم
            <div className="inline-add">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="مثل: Module 3, Hooks, Auth"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = normalizeTags([...(row.tags || []), tagDraft]);
                    setTagDraft("");
                    saveMeta({ tags: next });
                  }
                }}
              />
              <button
                className="btn secondary btn-sm"
                type="button"
                disabled={savingMeta || !tagDraft.trim()}
                onClick={() => {
                  const next = normalizeTags([...(row.tags || []), tagDraft]);
                  setTagDraft("");
                  saveMeta({ tags: next });
                }}
              >
                إضافة
              </button>
            </div>
          </label>
        </div>
        <div className="tag-row" style={{ marginTop: "0.75rem" }}>
          <span className="pill">{courseLabel(row.category)}</span>
          {(row.tags || []).map((t) => (
            <button
              key={t}
              type="button"
              className="pill clickable"
              disabled={savingMeta}
              onClick={() => saveMeta({ tags: (row.tags || []).filter((x) => x !== t) })}
              title="إزالة الوسم"
            >
              {t} ×
            </button>
          ))}
        </div>
      </div>

      {row.status === "failed" ? (
        <div className="panel banner warn settings-panel" style={{ marginBottom: "1rem" }}>
          <strong>فشلت المعالجة — التقرير غير مكتمل.</strong>
          <p className="help" style={{ margin: "0.4rem 0 0" }}>
            {(report?.limitations || []).find((l) => l.includes("فشل")) ||
              "حدث خطأ أثناء التحليل. يمكنك إعادة المعالجة."}
          </p>
          <div className="row-actions" style={{ marginTop: "0.85rem" }}>
            {row.drive_url ? (
              <button className="btn" type="button" disabled={retrying} onClick={retryProcessing}>
                {retrying ? "جاري إعادة المعالجة..." : "إعادة المعالجة"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!ready && row.status !== "failed" ? (
        <div className="panel banner warn settings-panel">
          <strong>التقرير غير جاهز بعد للمراجعة.</strong>
          <p className="help" style={{ margin: "0.4rem 0 0" }}>
            الحالة الحالية «{statusLabel(row.status)}». يجري التحليل أو بانتظار المعالج، وستُحدَّث الصفحة تلقائياً.
          </p>
        </div>
      ) : ready ? (
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
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteOpen}
        title="حذف التقرير"
        message="سيتم حذف هذا التقييم نهائياً ولن يمكن استرجاعه."
        confirmLabel="حذف نهائي"
        danger
        busy={deleteBusy}
        onClose={() => (!deleteBusy ? setDeleteOpen(false) : null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
