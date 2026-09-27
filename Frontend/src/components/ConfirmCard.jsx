export default function ConfirmCard({ title, titleId, children, actions }) {
  return (
    <section className="card confirm-card">
      <h2 id={titleId}>{title}</h2>
      {children}
      {actions && <div className="button-row">{actions}</div>}
    </section>
  );
}
