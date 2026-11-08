export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "compact" : ""}`} aria-label="Instant Plus">
      <svg viewBox="0 0 160 40" role="img" focusable="false">
        <defs>
          <linearGradient id="ipg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f6bff" />
            <stop offset="100%" stopColor="#1a2db3" />
          </linearGradient>
        </defs>
        <rect x="0" y="4" width="32" height="32" rx="10" fill="url(#ipg)" />
        <path
          d="M10 20h12M16 14v12"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <text x="42" y="27" fill="currentColor" fontSize="18" fontWeight="700" fontFamily="inherit">
          Instant+
        </text>
      </svg>
      {!compact ? <span className="brand-sub">Evaluation</span> : null}
    </div>
  );
}
