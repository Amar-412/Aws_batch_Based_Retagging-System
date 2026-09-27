import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, RefreshCw, X } from 'lucide-react';
import { downloadBatchReport, getBatchJob } from '../services/api';

const TERMINAL = new Set(['Complete', 'Failed', 'Cancelled', 'Canceled']);
const POLL_MS = 10000;
const REPORT_RETRIES = 3;

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

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function JobStatusPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer;
    let reportRetries = 0;
    let started = false;

    async function load() {
      if (!started) setLoading(true);
      started = true;
      setError('');
      try {
        const response = await getBatchJob(jobId);
        if (cancelled) return;
        const next = response.data;
        setJob(next);
        const finished = TERMINAL.has(next.status);
        const waitingForReport = finished && !next.report?.available && reportRetries < REPORT_RETRIES;
        if (!finished || waitingForReport) {
          if (waitingForReport) reportRetries += 1;
          timer = setTimeout(load, POLL_MS);
        }
      } catch (err) {
        if (!cancelled) setError(readError(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Polling stays inside this effect. Refresh calls the same loader through a new mount only when jobId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const response = await getBatchJob(jobId);
      setJob(response.data);
    } catch (err) {
      setError(readError(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function downloadReport() {
    setDownloadError('');
    try {
      await downloadBatchReport(jobId);
    } catch (err) {
      setDownloadError(readError(err));
    }
  }

  const progress = job?.progressSummary;
  const summary = job?.resultSummary;
  const counts = summary?.fromReport
    ? summary
    : {
        total: progress?.numberOfTasksTotal ?? summary?.total ?? 0,
        succeeded: progress?.numberOfTasksSucceeded ?? summary?.succeeded ?? 0,
        failed: progress?.numberOfTasksFailed ?? summary?.failed ?? 0,
      };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
          <h1 className="text-lg font-semibold">Job Status</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Task results come from the S3 Batch Operations completion report. Requested tags are not proof that an
          object was tagged.
        </p>

        {loading && !job && (
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
            <section className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
              <h2 className="text-base font-semibold">Summary</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Job ID" value={job.jobId} mono />
                <Field label="Overall status" value={job.status} />
                <Field label="Objects processed" value={String(counts.total)} />
                <Field label="Tasks succeeded" value={String(counts.succeeded)} />
                <Field label="Tasks failed" value={String(counts.failed)} />
                <Field label="Tags requested" value={formatTags(job.tags)} />
                <Field label="Created" value={formatTime(job.creationTime || job.createdAt)} />
                <Field label="Updated" value={formatTime(job.updatedAt || job.terminationDate)} />
              </dl>
              {!summary?.fromReport && !TERMINAL.has(job.status) && (
                <p className="mt-4 text-sm text-slate-600" role="status">
                  {refreshing ? 'Refreshing job status...' : 'This job is still running. Status refreshes automatically.'}
                </p>
              )}
            </section>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Card label="Total" value={counts.total} />
              <Card label="Successful" value={counts.succeeded} tone="success" />
              <Card label="Failed" value={counts.failed} tone={counts.failed > 0 ? 'failure' : 'neutral'} />
            </div>

            <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold">Retagging Results</h2>
              </div>
              {job.results?.length > 0 ? (
                <div className="max-h-[32rem] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 font-medium">Object</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">HTTP Status</th>
                        <th className="px-4 py-3 font-medium">Applied/Actual Tags</th>
                        <th className="px-4 py-3 font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.results.map((row) => (
                        <ResultRow key={`${row.bucket}/${row.key}/${row.taskStatus}`} row={row} requestedTags={job.tags} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-6 text-sm text-slate-600">
                  {job.report?.message || 'Object results appear here after the completion report is available.'}
                </p>
              )}
            </section>

            <section className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
              <h2 className="text-base font-semibold">Batch Operations Report</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {job.report?.available
                  ? 'The completion report lists each task. Download does not include AWS credentials.'
                  : job.report?.message || 'The completion report is not available yet.'}
              </p>
              {job.report?.manifestKey && (
                <p className="mt-2 font-mono text-xs break-all text-slate-500">{job.report.manifestKey}</p>
              )}
              {downloadError && (
                <p className="mt-3 text-sm text-red-800" role="alert">
                  {downloadError}
                </p>
              )}
              {job.report?.available && (
                <button type="button" className={`${quietButtonClass} mt-4`} onClick={downloadReport}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download Report
                </button>
              )}
            </section>
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={quietButtonClass} disabled={loading || refreshing} onClick={refresh}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh status
          </button>
          <Link to="/batch-job" className={quietButtonClass}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Batch Job
          </Link>
          <Link to="/jobs" className={quietButtonClass}>
            Job History
          </Link>
        </div>
      </main>
    </div>
  );
}

function ResultRow({ row, requestedTags }) {
  const succeeded = row.taskStatus === 'succeeded';
  return (
    <tr className={`border-t border-slate-100 ${succeeded ? '' : 'bg-red-50'}`}>
      <td className="px-4 py-3 font-mono text-xs">{row.key}</td>
      <td className="px-4 py-3">
        {succeeded ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 ring-inset">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            SUCCESS
          </span>
        ) : (
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-200 ring-inset">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              FAILED
            </span>
            {row.errorCode && <p className="mt-1 text-xs text-red-800">{row.errorCode}</p>}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-slate-700">{row.httpStatusCode || '—'}</td>
      <td className="px-4 py-3 text-slate-700">
        {succeeded ? (
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Actual S3 Tags</p>
            <p className="mt-1">{row.actualTagsRetrieved ? formatTags(row.actualTags) : row.actualTagsMessage || '—'}</p>
            <p className="mt-2 text-xs text-slate-500">Requested: {formatTags(requestedTags)}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Requested: {formatTags(requestedTags)}</p>
        )}
      </td>
      <td className="px-4 py-3 text-slate-700">
        {succeeded ? row.resultMessage || 'Successful' : row.resultMessage || 'Failed'}
      </td>
    </tr>
  );
}

function Card({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'success' ? 'border-emerald-200 bg-emerald-50' : tone === 'failure' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm text-slate-900 ${mono ? 'font-mono break-all' : ''}`}>{value}</dd>
    </div>
  );
}
