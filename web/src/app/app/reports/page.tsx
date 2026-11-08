"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { COURSE_CATALOG, courseLabel } from "@/lib/categories";
import { isStaff } from "@/lib/auth/roles";
import { readOrgMeta } from "@/lib/orgMeta";
import { exportReviewsZip } from "@/lib/pdfReport";
import { ReviewRow, hasReportContent, statusLabel, verdictLabel } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export default function ReportsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("reviewer");
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", auth.user.id)
          .maybeSingle();
        setRole(profile?.role || "reviewer");
      }
      let { data, error } = await supabase
        .from("reviews")
        .select(
          "id,video_name,status,proposed_verdict,findings_count,quality_score,created_at,report,provider,model,category,tags"
        )
        .order("created_at", { ascending: false });
      if (error && String(error.message || "").includes("category")) {
        const fallback = await supabase
          .from("reviews")
          .select(
            "id,video_name,status,proposed_verdict,findings_count,quality_score,created_at,report,provider,model"
          )
          .order("created_at", { ascending: false });
        data = fallback.data as typeof data;
      }
      setRows(((data as ReviewRow[]) || []).map((r) => ({ ...r, ...readOrgMeta(r) })));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (course !== "all" && (r.category || "general") !== course) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const hay = [
        r.video_name,
        r.id,
        r.proposed_verdict,
        r.provider,
        r.model,
        courseLabel(r.category),
        ...(r.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, course, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReviewRow[]>();
    for (const r of filtered) {
      const key = r.category || "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [filtered]);

  const selectedRows = filtered.filter((r) => selected[r.id]);

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    const previous = rows;
    setRows((curr) => curr.filter((r) => r.id !== deleteId));
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "فشل الحذف");
      toast.push("تم حذف التقرير", "ok");
      setDeleteId(null);
    } catch (ex: unknown) {
      setRows(previous);
      toast.push(ex instanceof Error ? ex.message : "فشل الحذف", "error");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBulk() {
    const targets = selectedRows.length ? selectedRows : filtered.filter((r) => hasReportContent(r.report));
    if (!targets.length) {
      toast.push("لا توجد تقارير جاهزة للتنزيل", "error");
      return;
    }
    setZipBusy(true);
    try {
      await exportReviewsZip(targets);
      toast.push(`تم تنزيل ${targets.length} تقرير PDF`, "ok");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل التنزيل الجماعي", "error");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">التقارير</h1>
          <p className="page-sub">تنظيم حسب الكورس، فتح، حذف، وتنزيل PDF</p>
        </div>
        <button className="btn" type="button" disabled={zipBusy} onClick={downloadBulk}>
          {zipBusy
            ? "جاري تجهيز PDF..."
            : selectedRows.length
              ? `تنزيل المحدد (${selectedRows.length})`
              : "تنزيل الكل PDF"}
        </button>
      </div>

      <div className="panel filters-bar settings-panel">
        <label>
          بحث
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم الفيديو، كورس، وسم..." />
        </label>
        <label>
          الكورس
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="all">كل الكورسات</option>
            {COURSE_CATALOG.map((c) => (
              <option key={c.id} value={c.id}>
                {c.labelAr}
              </option>
            ))}
          </select>
        </label>
        <label>
          الحالة
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">الكل</option>
            <option value="completed">مكتمل</option>
            <option value="queued">في الطابور</option>
            <option value="running">قيد المعالجة</option>
            <option value="failed">فشل</option>
            <option value="awaiting_backend">بانتظار المعالج</option>
          </select>
        </label>
      </div>

      <div className="panel settings-panel reports-list">
        {loading ? <Skeleton rows={4} /> : null}
        {!loading && !filtered.length ? (
          <EmptyState title="لا توجد تقارير مطابقة" hint="جرّب تغيير الفلتر أو ابدأ مراجعة جديدة." />
        ) : null}

        {grouped.map(([cat, items]) => (
          <section key={cat} className="report-group">
            <div className="label-row" style={{ marginBottom: "0.65rem" }}>
              <h2 className="section-title">{courseLabel(cat)}</h2>
              <span className="help">{items.length} تقرير</span>
            </div>
            {items.map((r) => {
              const ready = hasReportContent(r.report);
              return (
                <div key={r.id} className="report-row">
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[r.id])}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                    />
                  </label>
                  <div className="report-row-main">
                    <strong className="report-row-title">{r.video_name || r.id}</strong>
                    <div className="help">
                      {new Date(r.created_at).toLocaleString("ar")} · {statusLabel(r.status)} ·{" "}
                      {verdictLabel(r.proposed_verdict || r.report?.proposed_verdict)} ·{" "}
                      {r.findings_count ?? r.report?.findings?.length ?? 0} ملاحظة
                      {r.quality_score != null ? ` · جودة ${r.quality_score}` : ""}
                    </div>
                    <div className="tag-row">
                      <span className="pill">{courseLabel(r.category)}</span>
                      {(r.tags || []).slice(0, 4).map((t) => (
                        <span key={t} className="pill">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="row-actions">
                    <Link
                      className={`btn ${ready ? "" : "secondary"} btn-sm`}
                      href={`/app/reports/${encodeURIComponent(r.id)}`}
                    >
                      {ready ? "فتح" : "الحالة"}
                    </Link>
                    {isStaff(role) ? (
                      <button
                        className="btn secondary btn-sm btn-danger"
                        type="button"
                        onClick={() => setDeleteId(r.id)}
                      >
                        حذف
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="حذف التقرير"
        message="هذا الإجراء نهائي. سيتم حذف التقييم وكل نتائجه من النظام."
        confirmLabel="حذف نهائي"
        danger
        busy={busy}
        onClose={() => (!busy ? setDeleteId(null) : null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
