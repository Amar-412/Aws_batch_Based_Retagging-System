export default function StatCard({ label, value, tone = 'neutral', hint }) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </article>
  );
}
