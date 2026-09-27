function timelineState(status, created) {
  const key = String(status || '').toLowerCase();
  if (!created) {
    return [
      { label: 'Job Created', state: 'current' },
      { label: 'Running', state: '' },
      { label: 'Completed', state: '' },
    ];
  }
  if (key === 'complete') {
    return [
      { label: 'Job Created', state: 'done' },
      { label: 'Running', state: 'done' },
      { label: 'Completed', state: 'done' },
    ];
  }
  if (key === 'failed' || key === 'failing') {
    return [
      { label: 'Job Created', state: 'done' },
      { label: 'Running', state: 'done' },
      { label: 'Failed', state: 'failed' },
    ];
  }
  if (key === 'cancelled' || key === 'canceled' || key === 'cancelling') {
    return [
      { label: 'Job Created', state: 'done' },
      { label: 'Running', state: 'done' },
      { label: 'Cancelled', state: 'cancelled' },
    ];
  }
  if (key === 'active') {
    return [
      { label: 'Job Created', state: 'done' },
      { label: 'Running', state: 'current' },
      { label: 'Completed', state: '' },
    ];
  }
  return [
    { label: 'Job Created', state: 'done' },
    { label: 'Running', state: '' },
    { label: 'Completed', state: '' },
  ];
}

export default function JobStatusTimeline({ status, created = false }) {
  const steps = timelineState(status, created);
  return (
    <ol className="timeline" aria-label="Job progress">
      {steps.map((step) => (
        <li key={step.label} className={step.state}>
          <span className="timeline-mark" aria-hidden="true" />
          {step.label}
        </li>
      ))}
    </ol>
  );
}
