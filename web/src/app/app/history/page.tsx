"use client";

import { useEffect, useState } from "react";
import Skeleton from "@/components/Skeleton";
import { createClient } from "@/lib/supabase/client";

type Review = {
  id: string;
  video_name: string | null;
  status: string;
  proposed_verdict: string | null;
  findings_count: number | null;
  created_at: string;
  cost: number | null;
  duration_ms: number | null;
  quality_score: number | null;
};

export default function HistoryPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reviews")
        .select("id,video_name,status,proposed_verdict,findings_count,created_at,cost,duration_ms,quality_score")
        .order("created_at", { ascending: false });
      if (error) setErr(error.message);
      else setRows((data as Review[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page-fill">
      <div className="page-head">
        <div>
          <h1 className="page-title">السجل</h1>
          <p className="page-sub">كل التقييمات المرتبطة بصلاحياتك</p>
        </div>
      </div>
      <div className="panel settings-panel">
        {loading ? <Skeleton rows={5} /> : null}
        {err ? <div className="banner error">{err}</div> : null}
        {!loading && !rows.length && !err ? <p className="help">لا توجد مراجعات بعد.</p> : null}
        {rows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>الفيديو</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>الحكم</th>
                  <th>الجودة</th>
                  <th>الزمن</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.video_name || r.id}</td>
                    <td>{new Date(r.created_at).toLocaleString("ar")}</td>
                    <td>
                      <span className="pill">{r.status}</span>
                    </td>
                    <td>{r.proposed_verdict || "—"}</td>
                    <td>{r.quality_score ?? "—"}</td>
                    <td>{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}ث` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
