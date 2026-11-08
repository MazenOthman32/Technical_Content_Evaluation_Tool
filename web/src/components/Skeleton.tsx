export default function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-wrap" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}
