"use client";

import { useEffect, useMemo, useState } from "react";
import { statusLabel } from "@/lib/reports";

const DEFAULT_ESTIMATE_MS = 12 * 60 * 1000;
const MIN_ESTIMATE_MS = 3 * 60 * 1000;
const MAX_ESTIMATE_MS = 45 * 60 * 1000;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type ProcessTimerProps = {
  startedAt: number;
  status?: string | null;
  estimateMs?: number | null;
  title?: string;
  compact?: boolean;
};

export default function ProcessTimer({
  startedAt,
  status,
  estimateMs,
  title = "جاري معالجة المراجعة",
  compact = false,
}: ProcessTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const estimate = useMemo(() => {
    const raw = typeof estimateMs === "number" && estimateMs > 0 ? estimateMs : DEFAULT_ESTIMATE_MS;
    return clamp(raw, MIN_ESTIMATE_MS, MAX_ESTIMATE_MS);
  }, [estimateMs]);

  const elapsed = Math.max(0, now - startedAt);
  const remaining = Math.max(0, estimate - elapsed);
  const overdue = elapsed >= estimate;
  const progress = overdue ? 0.96 : clamp(elapsed / estimate, 0.04, 0.95);
  const active =
    !status ||
    status === "queued" ||
    status === "running" ||
    status === "downloading" ||
    status === "awaiting_backend";

  if (!active) return null;

  const pct = Math.round(progress * 100);

  return (
    <div className={`process-timer ${compact ? "compact" : ""}`}>
      <div className="process-timer-head">
        <div className="process-loader" aria-hidden>
          <span className="process-loader-ring" />
          <span className="process-loader-pct">{pct}%</span>
        </div>
        <div className="process-timer-copy">
          <strong>{title}</strong>
          <p className="help" style={{ margin: "0.25rem 0 0" }}>
            الحالة: {statusLabel(status)} · تقديري حتى الانتهاء ≈ {formatClock(estimate)}
          </p>
        </div>
      </div>

      <div className="process-timer-grid">
        <div className="stat-card">
          <div className="help">الوقت المنقضي</div>
          <strong className="process-timer-clock">{formatClock(elapsed)}</strong>
        </div>
        <div className="stat-card">
          <div className="help">{overdue ? "تجاوز التقدير" : "المتبقي تقريباً"}</div>
          <strong className="process-timer-clock">
            {overdue ? "أوشكت على الانتهاء…" : formatClock(remaining)}
          </strong>
        </div>
      </div>

      <div
        className="process-timer-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="تقدم المعالجة التقديري"
      >
        <div className="process-timer-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="help" style={{ margin: "0.55rem 0 0" }}>
        التقدير تقريبي ويختلف حسب طول الفيديو وسرعة المعالج.
      </p>
    </div>
  );
}

export async function fetchProcessEstimateMs(): Promise<number> {
  try {
    const res = await fetch("/api/analytics", { cache: "no-store" });
    if (!res.ok) return DEFAULT_ESTIMATE_MS;
    const json = await res.json();
    const avg = Number(json?.totals?.avg_duration_ms || 0);
    if (!Number.isFinite(avg) || avg <= 0) return DEFAULT_ESTIMATE_MS;
    // review duration_ms often stores video length; blend with a processing baseline
    return clamp(Math.max(avg, DEFAULT_ESTIMATE_MS * 0.6), MIN_ESTIMATE_MS, MAX_ESTIMATE_MS);
  } catch {
    return DEFAULT_ESTIMATE_MS;
  }
}
