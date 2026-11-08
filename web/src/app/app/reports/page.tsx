"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isStaff } from "@/lib/auth/roles";
import { Course, courseDisplayName } from "@/lib/courses";
import { readOrgMeta } from "@/lib/orgMeta";
import { exportReviewsZip } from "@/lib/pdfReport";
import { ReviewRow, displaySessionTitle, hasReportContent, statusLabel, verdictLabel } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

function normalizeCourseRelation(row: ReviewRow): ReviewRow {
  const course = Array.isArray(row.course) ? row.course[0] || null : row.course;
  return { ...row, course: course || null };
}

export default function ReportsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("reviewer");
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [courseZipBusy, setCourseZipBusy] = useState<string | null>(null);

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

      const coursesRes = await fetch("/api/courses").then((r) => r.json()).catch(() => ({ courses: [] }));
      setCourses((coursesRes.courses || []) as Course[]);

      let { data, error } = await supabase
        .from("reviews")
        .select(
          "id,video_name,session_title,status,proposed_verdict,findings_count,quality_score,created_at,report,provider,model,category,tags,course_id,course:courses(id,name,slug)"
        )
        .order("created_at", { ascending: false });
      if (
        error &&
        (String(error.message || "").includes("category") ||
          String(error.message || "").includes("session_title") ||
          String(error.message || "").includes("course") ||
          String(error.message || "").includes("courses"))
      ) {
        const fallback = await supabase
          .from("reviews")
          .select(
            "id,video_name,session_title,status,proposed_verdict,findings_count,quality_score,created_at,report,provider,model,category,tags"
          )
          .order("created_at", { ascending: false });
        data = fallback.data as typeof data;
      }
      setRows(
        ((data as ReviewRow[]) || []).map((r) => normalizeCourseRelation({ ...r, ...readOrgMeta(r) }))
      );
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (course !== "all" && (r.course_id || r.category || "general") !== course) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const hay = [
        r.session_title,
        r.video_name,
        r.id,
        r.proposed_verdict,
        r.provider,
        r.model,
        courseDisplayName(r.course, r.category),
        ...(r.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, course, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: ReviewRow[] }>();
    for (const r of filtered) {
      const key = r.course_id || r.category || "uncategorized";
      const label = courseDisplayName(r.course, r.category || "بدون كورس");
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(r);
    }
    return [...map.values()];
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

  async function downloadCourse(groupKey: string, label: string, items: ReviewRow[]) {
    const targets = items.filter((r) => hasReportContent(r.report));
    if (!targets.length) {
      toast.push("لا توجد تقارير جاهزة في هذا الكورس", "error");
      return;
    }
    setCourseZipBusy(groupKey);
    try {
      const safe = label.replace(/[^\w\u0600-\u06FF.-]+/g, "_").slice(0, 60);
      await exportReviewsZip(targets, `${safe}-reports.zip`);
      toast.push(`تم تنزيل ${targets.length} تقرير لكورس ${label}`, "ok");
    } catch (ex: unknown) {
      toast.push(ex instanceof Error ? ex.message : "فشل تنزيل الكورس", "error");
    } finally {
      setCourseZipBusy(null);
    }
  }

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">التقارير</h1>
          <p className="page-sub">سيشنات مجمّعة حسب الكورس مع تنزيل ZIP لكل كورس</p>
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
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="عنوان سيشن، كورس، وسم..."
          />
        </label>
        <label>
          الكورس
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="all">كل الكورسات</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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

        {grouped.map((group) => {
          const readyCount = group.items.filter((r) => hasReportContent(r.report)).length;
          return (
            <section key={group.key} className="report-group">
              <div className="label-row" style={{ marginBottom: "0.65rem" }}>
                <div>
                  <h2 className="section-title">{group.label}</h2>
                  <span className="help">
                    {group.items.length} سيشن · {readyCount} جاهز للتنزيل
                  </span>
                </div>
                <button
                  className="btn secondary btn-sm"
                  type="button"
                  disabled={courseZipBusy === group.key || !readyCount}
                  onClick={() => downloadCourse(group.key, group.label, group.items)}
                >
                  {courseZipBusy === group.key ? "جاري تنزيل الكورس..." : "تنزيل كورس PDF"}
                </button>
              </div>
              {group.items.map((r) => {
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
                      <strong className="report-row-title">{displaySessionTitle(r)}</strong>
                      <div className="help">
                        {new Date(r.created_at).toLocaleString("ar")} · {statusLabel(r.status)} ·{" "}
                        {verdictLabel(r.proposed_verdict || r.report?.proposed_verdict)} ·{" "}
                        {r.findings_count ?? r.report?.findings?.length ?? 0} ملاحظة
                        {r.quality_score != null ? ` · جودة ${r.quality_score}` : ""}
                      </div>
                      <div className="tag-row">
                        <span className="pill">{courseDisplayName(r.course, r.category)}</span>
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
          );
        })}
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
