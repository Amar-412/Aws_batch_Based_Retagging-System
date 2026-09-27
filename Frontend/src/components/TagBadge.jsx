export default function TagBadge({ tags, empty = '—' }) {
  const entries = Object.entries(tags || {});
  if (entries.length === 0) return <span className="muted">{empty}</span>;
  return (
    <span className="tag-list">
      {entries.map(([key, value]) => (
        <span key={key} className="tag-badge">
          {key}={value}
        </span>
      ))}
    </span>
  );
}
