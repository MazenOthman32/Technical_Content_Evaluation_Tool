type LogoProps = {
  compact?: boolean;
  tone?: "light" | "dark";
};

export default function Logo({ compact = false, tone = "light" }: LogoProps) {
  return (
    <div className={`brand-mark ${compact ? "is-compact" : ""} tone-${tone}`} aria-label="Instant Plus">
      <div className="brand-logo-box">
        <img
          src="/brand/instant-plus-logo.png"
          alt="Instant Plus"
          className="brand-logo-img"
          width={990}
          height={412}
          decoding="async"
          draggable={false}
        />
      </div>
      {!compact ? <span className="brand-sub">Evaluation</span> : null}
    </div>
  );
}
