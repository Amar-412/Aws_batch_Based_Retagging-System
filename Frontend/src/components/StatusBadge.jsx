import { statusPresentation } from '../lib/format';

export default function StatusBadge({ status, label }) {
  const presentation = statusPresentation(status);
  const text = label || presentation.label;
  return (
    <span className={`badge badge-${presentation.tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {text}
    </span>
  );
}
