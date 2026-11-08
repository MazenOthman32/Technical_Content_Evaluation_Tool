"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Review = {
  id: string;
  video_name: string | null;
  status: string;
  proposed_verdict: string | null;
  findings_count: number | null;
  created_at: string;
  cost: number | null;
};

export default function HistoryPage() {
  const [rows, setRows] = useState<Review[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reviews")
        .select("id,video_name,status,proposed_verdict,findings_count,created_at,cost")
        .order("created_at", { ascending: false });
      if (error) setErr(error.message);
      else setRows((data as Review[]) || []);
    })();
  }, []);

  return (
    <div>
      <h1 className="page-title">السجل</h1>
      <div className="panel">
        {err ? <div className="banner error">{err}</div> : null}
        {!rows.length && !err ? <p className="help">لا توجد مراجعات بعد.</p> : null}
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>الفيديو</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>الحكم</th>
                <th>الملاحظات</th>
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
                  <td>{r.findings_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
