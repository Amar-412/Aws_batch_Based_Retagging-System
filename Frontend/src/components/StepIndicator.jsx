const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'rules', label: 'Rules' },
  { id: 'preview', label: 'Preview' },
  { id: 'job', label: 'Batch Job' },
];

export default function StepIndicator({ current }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="steps" aria-label="Retagging workflow">
      {STEPS.map((step, stepIndex) => {
        const state = stepIndex < index ? 'done' : stepIndex === index ? 'current' : '';
        return (
          <li key={step.id} className={state} aria-current={stepIndex === index ? 'step' : undefined}>
            <span>{stepIndex + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
