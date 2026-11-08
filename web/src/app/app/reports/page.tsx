"use client";

import { useEffect, useState } from "react";
import Skeleton from "@/components/Skeleton";
import { createClient } from "@/lib/supabase/client";

type Review = {
  id: string;
  video_name: string | null;
  status: string;
  proposed_verdict: string | null;
  created_at: string;
  report: unknown;
};

export default function ReportsPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("reviews")
        .select("id,video_name,status,proposed_verdict,created_at,report")
        .order("created_at", { ascending: false });
      setRows((data as Review[]) || []);
      setLoading(false);
    })();
  }, []);

  function downloadJson(r: Review) {
    const blob = new Blob([JSON.stringify(r.report || r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="page-title">التقارير</h1>
      <p className="page-sub">تنزيل مخرجات التقييم بصيغة JSON</p>
      <div className="panel" style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
        {loading ? <Skeleton rows={4} /> : null}
        {!loading && !rows.length ? <p className="help">لا توجد تقارير بعد.</p> : null}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              alignItems: "center",
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: "0.9rem",
              background: "color-mix(in srgb, var(--panel-solid) 70%, transparent)",
            }}
          >
            <div>
              <strong>{r.video_name || r.id}</strong>
              <div className="help">
                {new Date(r.created_at).toLocaleString("ar")} · {r.status} · {r.proposed_verdict || "—"}
              </div>
            </div>
            <button className="btn secondary" type="button" onClick={() => downloadJson(r)}>
              تنزيل JSON
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
