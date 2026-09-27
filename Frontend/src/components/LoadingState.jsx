export default function LoadingState({ label = 'Loading', lines = 4 }) {
  return (
    <div className="skeleton-card" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={`skeleton-line ${index === 0 ? 'short' : ''}`} />
      ))}
    </div>
  );
}
