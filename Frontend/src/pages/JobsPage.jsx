import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import StatusBadge from '../components/StatusBadge';
import TagBadge from '../components/TagBadge';
import { formatTime, readError } from '../lib/format';
import { listBatchJobs } from '../services/api';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETE', label: 'Complete' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

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
          setError(readError(err, 'Could not load job history.').message);
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
    if (!nextCursor || loading) return;
    setCursorStack((current) => {
      const copy = current.slice(0, pageIndex + 1);
      copy.push(nextCursor);
      return copy;
    });
    setPageIndex((current) => current + 1);
  }

  function previousPage() {
    if (pageIndex === 0 || loading) return;
    setPageIndex((current) => current - 1);
  }

  return (
    <>
      <PageHeader
        title="Job History"
        description="Previously created retagging jobs. Opening a job shows its status and does not create another one."
      />

      <form className="filter-bar" onSubmit={applySearch}>
        <label className="field">
          <span>Search by Job ID</span>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by job ID" />
        </label>
        <label className="field">
          <span>Status</span>
          <select className="select" value={status} onChange={changeStatus}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <PrimaryButton type="submit">Search</PrimaryButton>
      </form>

      <div className="stack" style={{ marginTop: 16 }}>
        {loading && <LoadingState label="Loading job history" />}
        {error && (
          <ErrorState
            title="Unable to load job history"
            message={error}
            onRetry={() => {
              setCursorStack([null]);
              setPageIndex(0);
            }}
          />
        )}
        {!loading && !error && jobs.length === 0 && (
          <EmptyState title="No retagging jobs found" message="Try another job ID or status, or start a new retagging workflow." />
        )}
        {jobs.length > 0 && (
          <DataTable
            rows={jobs}
            getRowKey={(job) => job.jobId}
            columns={[
              { key: 'id', header: 'Job ID', cell: (job) => <span className="mono">{job.jobId}</span> },
              { key: 'status', header: 'Status', cell: (job) => <StatusBadge status={job.status} /> },
              { key: 'objects', header: 'Objects', cell: (job) => job.objectCount ?? '—' },
              { key: 'ok', header: 'Successful', cell: (job) => job.tasksSucceeded ?? '—' },
              { key: 'bad', header: 'Failed', cell: (job) => job.tasksFailed ?? '—' },
              { key: 'tags', header: 'Tags', cell: (job) => <TagBadge tags={job.tags} /> },
              { key: 'created', header: 'Created', cell: (job) => formatTime(job.createdAt) },
              { key: 'updated', header: 'Updated', cell: (job) => formatTime(job.updatedAt) },
              {
                key: 'action',
                header: 'Action',
                cell: (job) => <SecondaryButton onClick={() => navigate(`/job/${job.jobId}`)}>View</SecondaryButton>,
              },
            ]}
          />
        )}
        <div className="pager">
          <SecondaryButton disabled={pageIndex === 0 || loading} onClick={previousPage}>Previous</SecondaryButton>
          <span className="muted">Page {pageIndex + 1}</span>
          <SecondaryButton disabled={!nextCursor || loading} onClick={nextPage}>Next</SecondaryButton>
        </div>
      </div>
    </>
  );
}
