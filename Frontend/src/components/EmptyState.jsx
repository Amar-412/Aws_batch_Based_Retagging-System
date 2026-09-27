export default function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}
