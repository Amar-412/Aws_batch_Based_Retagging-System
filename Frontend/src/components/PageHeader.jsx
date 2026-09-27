import { useEffect } from 'react';

export default function PageHeader({ title, description, actions }) {
  useEffect(() => {
    document.title = `${title} · S3 Batch Retagging`;
  }, [title]);

  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="lede">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
