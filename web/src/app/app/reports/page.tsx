"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { BUSINESS_CATEGORIES, categoryLabel } from "@/lib/categories";
import { isStaff } from "@/lib/auth/roles";
import { readOrgMeta } from "@/lib/orgMeta";
import { ReviewRow, hasReportContent, statusLabel, verdictLabel } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

export default function ReportsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("reviewer");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
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
      if (category !== "all" && (r.category || "general") !== category) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const hay = [
        r.video_name,
        r.id,
        r.proposed_verdict,
        r.provider,
        r.model,
        categoryLabel(r.category),
        ...(r.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, category, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReviewRow[]>();
    for (const r of filtered) {
      const key = r.category || "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [filtered]);

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
          <h1 className="page-title">التقارير</h1>
          <p className="page-sub">بحث، تصنيف، فتح، وتصدير كل تقييمات المحتوى</p>
        </div>
      </div>

      <div className="panel filters-bar settings-panel">
        <label>
          بحث
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اسم الفيديو، وسم، حكم..."
          />
        </label>
        <label>
          التصنيف
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">الكل</option>
            {BUSINESS_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
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
        {!loading && !filtered.length ? <p className="help">لا توجد تقارير مطابقة.</p> : null}

        {grouped.map(([cat, items]) => (
          <section key={cat} className="report-group">
            <div className="label-row" style={{ marginBottom: "0.65rem" }}>
              <h2 className="section-title">{categoryLabel(cat)}</h2>
              <span className="help">{items.length} تقرير</span>
            </div>
            {items.map((r) => {
              const ready = hasReportContent(r.report);
              return (
                <div key={r.id} className="report-row">
                  <div className="report-row-main">
                    <strong className="report-row-title">{r.video_name || r.id}</strong>
                    <div className="help">
                      {new Date(r.created_at).toLocaleString("ar")} · {statusLabel(r.status)} ·{" "}
                      {verdictLabel(r.proposed_verdict || r.report?.proposed_verdict)} ·{" "}
                      {r.findings_count ?? r.report?.findings?.length ?? 0} ملاحظة
                      {r.quality_score != null ? ` · جودة ${r.quality_score}` : ""}
                    </div>
                    <div className="tag-row">
                      <span className="pill">{categoryLabel(r.category)}</span>
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
                      {ready ? "فتح التقرير" : "عرض الحالة"}
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
