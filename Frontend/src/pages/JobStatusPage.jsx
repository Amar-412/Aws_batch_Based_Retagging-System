import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { getBatchJob } from '../services/api';

const quietButtonClass =
  'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

function readError(err) {
  const data = err?.response?.data;
  if (!data) return 'Could not reach the server.';
  return data.message || 'Could not load the job.';
}

function formatTags(tags) {
  const entries = Object.entries(tags || {});
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key} = ${value}`).join(', ');
}

export default function JobStatusPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await getBatchJob(jobId);
      setJob(response.data);
    } catch (err) {
      setJob(null);
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Reload when the route job id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const progress = job?.progressSummary;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
          <h1 className="text-lg font-semibold">Job Status</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            This status comes from S3 Batch Operations. A created job is not the same as completed tagging.
          </p>

          {loading && (
            <p className="mt-4 text-sm text-slate-600" role="status">
              Loading job status...
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          {job && (
            <>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                <Field label="Job ID" value={job.jobId} mono />
                <Field label="Status" value={job.status} />
                <Field label="Object count" value={String(job.objectCount ?? progress?.numberOfTasksTotal ?? '—')} />
                <Field label="Tags" value={formatTags(job.tags)} />
                <Field label="Created time" value={formatTime(job.creationTime || job.createdAt)} />
                <Field label="Status reason" value={job.statusReason || '—'} />
              </dl>
              {progress && (
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Field label="Tasks total" value={String(progress.numberOfTasksTotal)} />
                  <Field label="Tasks succeeded" value={String(progress.numberOfTasksSucceeded)} />
                  <Field label="Tasks failed" value={String(progress.numberOfTasksFailed)} />
                </dl>
              )}
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" className={quietButtonClass} disabled={loading} onClick={load}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh status
            </button>
            <Link to="/batch-job" className={quietButtonClass}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Batch Job
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Field({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono break-all' : ''}`}>{value}</dd>
    </div>
  );
}
