export default function KeyBadge({
  state,
  label,
}: {
  state: "missing" | "saved" | "verified";
  label: string;
}) {
  return <span className={`key-badge ${state}`}>{label}</span>;
}
