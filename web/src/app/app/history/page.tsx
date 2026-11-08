"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { isStaff } from "@/lib/auth/roles";
import { courseDisplayName } from "@/lib/courses";
import { readOrgMeta } from "@/lib/orgMeta";
import { ReviewRow, displaySessionTitle, statusLabel, verdictLabel } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

function normalizeCourseRelation(row: ReviewRow): ReviewRow {
  const course = Array.isArray(row.course) ? row.course[0] || null : row.course;
  return { ...row, course: course || null };
}

export default function HistoryPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [role, setRole] = useState("reviewer");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          "id,video_name,session_title,status,proposed_verdict,findings_count,created_at,cost,duration_ms,quality_score,category,course_id,course:courses(id,name,slug),report"
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
            "id,video_name,session_title,status,proposed_verdict,findings_count,created_at,cost,duration_ms,quality_score,report"
          )
          .order("created_at", { ascending: false });
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) setErr(error.message);
      else {
        setRows(
          ((data as ReviewRow[]) || []).map((r) => normalizeCourseRelation({ ...r, ...readOrgMeta(r) }))
        );
      }
      setLoading(false);
    })();
  }, []);

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

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">السجل</h1>
          <p className="page-sub">كل التقييمات — افتح التقرير أو احذفه بصلاحيات المسؤول</p>
        </div>
      </div>
      <div className="panel settings-panel">
        {loading ? <Skeleton rows={5} /> : null}
        {err ? <div className="banner error">{err}</div> : null}
        {!loading && !rows.length && !err ? (
          <EmptyState title="لا توجد مراجعات بعد" hint="ابدأ مراجعة جديدة من صفحة المراجعة." />
        ) : null}
        {rows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>عنوان السيشن</th>
                  <th>الكورس</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>الحكم</th>
                  <th>الجودة</th>
                  <th>الزمن</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{displaySessionTitle(r)}</td>
                    <td>{courseDisplayName(r.course, r.category)}</td>
                    <td>{new Date(r.created_at).toLocaleString("ar")}</td>
                    <td>
                      <span className="pill">{statusLabel(r.status)}</span>
                    </td>
                    <td>{verdictLabel(r.proposed_verdict)}</td>
                    <td>{r.quality_score ?? "—"}</td>
                    <td>{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}ث` : "—"}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn secondary btn-sm" href={`/app/reports/${encodeURIComponent(r.id)}`}>
                          فتح
                        </Link>
                        {isStaff(role) ? (
                          <button className="btn secondary btn-sm btn-danger" type="button" onClick={() => setDeleteId(r.id)}>
                            حذف
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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
