import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listBatchJobs } from '../services/api';

const quietButtonClass =
  'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

const buttonClass =
  'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETE', label: 'Complete' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function readError(err) {
  const data = err?.response?.data;
  if (!data) return 'Could not reach the server.';
  return data.message || 'Could not load job history.';
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function badgeFor(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'new') return { label: 'NEW', className: 'bg-slate-100 text-slate-700 ring-slate-200' };
  if (value === 'active') return { label: 'ACTIVE', className: 'bg-sky-50 text-sky-800 ring-sky-200' };
  if (value === 'complete') return { label: 'COMPLETE', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (value === 'failed' || value === 'failing') return { label: 'FAILED', className: 'bg-red-50 text-red-800 ring-red-200' };
  if (value === 'cancelled' || value === 'canceled' || value === 'cancelling') {
    return { label: 'CANCELLED', className: 'bg-amber-50 text-amber-800 ring-amber-200' };
  }
  return { label: status || 'UNKNOWN', className: 'bg-slate-100 text-slate-700 ring-slate-200' };
}

export default function JobsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [jobs, setJobs] = useState([]);
  const [cursorStack, setCursorStack] = useState([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await listBatchJobs({
          status,
          jobId: appliedSearch,
          limit: PAGE_SIZE,
          cursor: cursorStack[pageIndex],
        });
        if (cancelled) return;
        setJobs(response.data?.jobs || []);
        setNextCursor(response.data?.nextCursor || null);
      } catch (err) {
        if (!cancelled) {
          setJobs([]);
          setNextCursor(null);
          setError(readError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [status, appliedSearch, cursorStack, pageIndex]);

  function applySearch(event) {
    event.preventDefault();
    setAppliedSearch(search.trim());
    setCursorStack([null]);
    setPageIndex(0);
  }

  function changeStatus(event) {
    setStatus(event.target.value);
    setCursorStack([null]);
    setPageIndex(0);
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorStack((current) => {
      const copy = current.slice(0, pageIndex + 1);
      copy.push(nextCursor);
      return copy;
    });
    setPageIndex((current) => current + 1);
  }

  function previousPage() {
    if (pageIndex === 0) return;
    setPageIndex((current) => current - 1);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
            <h1 className="text-lg font-semibold">Job History</h1>
          </div>
          <Link to="/batch-job" className={quietButtonClass}>
            Back to Batch Job
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Previously created retagging jobs. Opening a job shows its status and does not create another one.
        </p>

        <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={applySearch}>
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-500">Job ID</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by job ID"
              className="mt-1 block w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-500">Status</span>
            <select
              value={status}
              onChange={changeStatus}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass}>
            Search
          </button>
        </form>

        {loading && (
          <p className="mt-4 text-sm text-slate-600" role="status">
            Loading job history...
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && jobs.length === 0 && (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
            No retagging jobs found.
          </p>
        )}

        {jobs.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Job ID</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Objects</th>
                    <th className="px-4 py-3 font-medium">Successful</th>
                    <th className="px-4 py-3 font-medium">Failed</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const badge = badgeFor(job.status);
                    return (
                      <tr key={job.jobId} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-mono text-xs">{job.jobId}</td>
                        <td className="px-4 py-3 text-slate-700">{formatTime(job.createdAt)}</td>
                        <td className="px-4 py-3">{job.objectCount ?? '—'}</td>
                        <td className="px-4 py-3">{job.tasksSucceeded ?? '—'}</td>
                        <td className="px-4 py-3">{job.tasksFailed ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" className={quietButtonClass} onClick={() => navigate(`/job/${job.jobId}`)}>
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button type="button" className={quietButtonClass} disabled={pageIndex === 0 || loading} onClick={previousPage}>
            Previous
          </button>
          <button type="button" className={quietButtonClass} disabled={!nextCursor || loading} onClick={nextPage}>
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
