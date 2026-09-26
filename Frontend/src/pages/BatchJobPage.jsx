import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { createBatchJobs } from '../services/api';

const buttonClass =
  'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

const quietButtonClass =
  'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

function readError(err) {
  const data = err?.response?.data;
  if (!data) return 'Could not reach the server.';
  const details = Array.isArray(data.error?.details) ? data.error.details.join(' ') : '';
  return details ? `${data.message} ${details}` : data.message || 'Could not create the batch job.';
}

function formatTags(tags) {
  const entries = Object.entries(tags || {});
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key} = ${value}`).join(', ');
}

export default function BatchJobPage() {
  const navigate = useNavigate();
  const { preview, previewConfirmed, confirmationTimestamp, workflowId, batchJobs, setBatchJobs, confirmPreview } =
    useWorkflow();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const summary = preview?.summary;
  const jobs = batchJobs?.jobs || [];

  useEffect(() => {
    if (previewConfirmed && !workflowId) confirmPreview();
  }, [previewConfirmed, workflowId, confirmPreview]);
  const blocked = !summary || summary.conflictedObjects > 0 || summary.matchedObjects === 0 || !workflowId;

  async function createJob() {
    setLoading(true);
    setError('');
    try {
      const response = await createBatchJobs({
        workflowId,
        confirmed: true,
        objects: (preview?.objects || []).map((object) => ({
          bucket: object.bucket,
          key: object.key,
          proposedTags: object.proposedTags || {},
          status: object.status === 'MATCHED' ? 'READY' : object.status,
          conflicts: object.conflicts || [],
        })),
      });
      setBatchJobs(response.data);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
          <h1 className="text-lg font-semibold">Batch Job</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
          {previewConfirmed && summary ? (
            <>
              <h2 className="text-base font-semibold">Retagging Plan Confirmed</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                S3 Batch Operations will apply these tags with S3PutObjectTagging. Objects change only after the
                job runs. This step does not tag objects one by one.
              </p>
              <dl className="mt-6 grid gap-3 sm:grid-cols-3">
                <Stat label="Objects" value={summary.matchedObjects} />
                <Stat label="Tags to apply" value={summary.totalTagsToApply} />
                <Stat label="Conflicts" value={summary.conflictedObjects} />
              </dl>
              {confirmationTimestamp && (
                <p className="mt-4 text-xs text-slate-500">
                  Confirmed at {new Date(confirmationTimestamp).toLocaleString()}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-amber-800">No confirmed preview yet. Confirm the preview first.</p>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          {loading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Creating S3 Batch Operations job...
            </p>
          )}

          {jobs.length > 0 && (
            <div className="mt-6 space-y-4">
              <h2 className="text-base font-semibold">Batch Operations Job Created</h2>
              {jobs.map((job) => (
                <article key={job.jobId} className="rounded-xl border border-slate-200 px-4 py-4">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Field label="Job ID" value={job.jobId} mono />
                    <Field label="Status" value={job.status} />
                    <Field label="Objects" value={String(job.objectCount)} />
                    <Field label="Tags" value={formatTags(job.tags)} />
                    <Field label="Manifest" value={job.manifestKey} mono />
                  </dl>
                  <button type="button" className={`${buttonClass} mt-4`} onClick={() => navigate(`/job/${job.jobId}`)}>
                    View Job Status
                  </button>
                </article>
              ))}
              <p className="text-sm text-slate-600">
                Job creation does not mean the objects were retagged. Task results appear on the job status page.
              </p>
            </div>
          )}

          {jobs.length === 0 && previewConfirmed && summary && (
            <button type="button" className={`${buttonClass} mt-6`} disabled={blocked || loading} onClick={createJob}>
              Create Batch Operations Job
            </button>
          )}

          <div className="mt-6">
            <Link to="/preview" className={quietButtonClass}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Preview
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono break-all' : ''}`}>{value}</dd>
    </div>
  );
}
