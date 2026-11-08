type LogoProps = {
  compact?: boolean;
  tone?: "light" | "dark";
};

export default function Logo({ compact = false, tone = "light" }: LogoProps) {
  const gradId = compact ? "ipg-compact" : "ipg-full";
  return (
    <div className={`brand-mark ${compact ? "is-compact" : ""} tone-${tone}`} aria-label="Instant Plus">
      <div className="brand-logo-box">
        <svg viewBox="0 0 168 40" role="img" focusable="false" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
          </defs>
          <rect x="0" y="4" width="32" height="32" rx="10" fill={`url(#${gradId})`} />
          <path
            d="M10 20h12M16 14v12"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <text
            x="42"
            y="26.5"
            fill="currentColor"
            fontSize="17"
            fontWeight="700"
            fontFamily="var(--font-ui), sans-serif"
          >
            Instant+
          </text>
        </svg>
      </div>
      {!compact ? <span className="brand-sub">Evaluation</span> : null}
    </div>
  );
}
