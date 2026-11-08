export default function MetricCard({
  label,
  value,
  hint,
  ring,
}: {
  label: string;
  value: string | number;
  hint?: string;
  ring?: number;
}) {
  const pct = Math.max(0, Math.min(100, ring ?? 0));
  return (
    <article className="metric-card glass">
      <div className="metric-copy">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
        {hint ? <span className="metric-hint">{hint}</span> : null}
      </div>
      {ring != null ? (
        <div
          className="ring"
          style={{ background: `conic-gradient(var(--brand) ${pct}%, var(--ring-track) 0)` }}
          aria-hidden
        >
          <span>{Math.round(pct)}%</span>
        </div>
      ) : null}
    </article>
  );
}
