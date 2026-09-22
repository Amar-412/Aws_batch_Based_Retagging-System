import { Link } from 'react-router-dom';
import { useWorkflow } from '../context/WorkflowContext';

export default function BatchJobPage() {
  const { preview, previewConfirmed, confirmationTimestamp } = useWorkflow();
  const summary = preview?.summary;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
          <h1 className="text-lg font-semibold">Batch Job</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-10 shadow-sm">
          <h2 className="text-base font-semibold">Batch Job Creation — Next Step</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Your retagging configuration has been confirmed. The next step will create the S3 Batch
            Operations manifest and job.
          </p>
          {previewConfirmed && summary ? (
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <dt className="text-xs text-slate-500">Confirmed objects</dt>
                <dd className="text-2xl font-semibold">{summary.matchedObjects}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <dt className="text-xs text-slate-500">Tags to apply</dt>
                <dd className="text-2xl font-semibold">{summary.totalTagsToApply}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-amber-800">No confirmed preview yet. Confirm the preview first.</p>
          )}
          {confirmationTimestamp && (
            <p className="mt-4 text-xs text-slate-500">Confirmed at {new Date(confirmationTimestamp).toLocaleString()}</p>
          )}
          <Link
            to="/preview"
            className="mt-6 inline-flex rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to Preview
          </Link>
        </section>
      </main>
    </div>
  );
}
