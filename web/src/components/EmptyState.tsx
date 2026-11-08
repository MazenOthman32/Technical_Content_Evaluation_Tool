export default function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}
