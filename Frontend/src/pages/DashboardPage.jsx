import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { formatTime, jobGroup, readError } from '../lib/format';
import { listBatchJobs } from '../services/api';

const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const collected = [];
        let cursor = null;
        let pages = 0;
        let more = false;
        do {
          const response = await listBatchJobs({ limit: PAGE_LIMIT, cursor });
          collected.push(...(response.data?.jobs || []));
          cursor = response.data?.nextCursor || null;
          pages += 1;
          if (pages >= MAX_PAGES && cursor) {
            more = true;
            cursor = null;
          }
        } while (cursor);
        if (!cancelled) {
          setJobs(collected);
          setTruncated(more);
        }
      } catch (err) {
        if (!cancelled) {
          setJobs([]);
          setError(readError(err, 'Could not load job history.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const counts = jobs.reduce(
    (summary, job) => {
      summary.total += 1;
      const group = jobGroup(job.status);
      if (group === 'active') summary.active += 1;
      if (group === 'success') summary.success += 1;
      if (group === 'failed') summary.failed += 1;
      return summary;
    },
    { total: 0, active: 0, success: 0, failed: 0 }
  );

  const recent = [...jobs]
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Summary of retagging jobs already stored for this workspace."
        actions={<PrimaryButton onClick={() => navigate('/upload')}>Start New Retagging</PrimaryButton>}
      />

      {loading && <LoadingState label="Loading dashboard" />}
      {error && (
        <ErrorState
          title="Unable to load jobs"
          message={error.message}
          details={error.details}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      )}

      {!loading && !error && (
        <div className="stack">
          <div className="stat-grid">
            <StatCard label="Total Jobs" value={counts.total} />
            <StatCard label="Active Jobs" value={counts.active} tone="active" />
            <StatCard label="Successful Jobs" value={counts.success} tone="success" />
            <StatCard label="Failed Jobs" value={counts.failed} tone={counts.failed ? 'failed' : 'neutral'} />
          </div>
          {truncated && (
            <p className="hint">Counts include the jobs returned by job history. Additional older jobs were not loaded.</p>
          )}

          <section>
            <h2 className="section-title">Recent Jobs</h2>
            {recent.length === 0 ? (
              <EmptyState
                title="No retagging jobs yet"
                message="Start a new retagging workflow to upload objects, preview tag changes, and create a batch job."
                action={<PrimaryButton onClick={() => navigate('/upload')}>Start New Retagging</PrimaryButton>}
              />
            ) : (
              <DataTable
                rows={recent}
                getRowKey={(job) => job.jobId}
                columns={[
                  { key: 'id', header: 'Job ID', cell: (job) => <span className="mono">{job.jobId}</span> },
                  { key: 'status', header: 'Status', cell: (job) => <StatusBadge status={job.status} /> },
                  { key: 'objects', header: 'Objects', cell: (job) => job.objectCount ?? '—' },
                  { key: 'ok', header: 'Successful', cell: (job) => job.tasksSucceeded ?? '—' },
                  { key: 'bad', header: 'Failed', cell: (job) => job.tasksFailed ?? '—' },
                  { key: 'created', header: 'Created', cell: (job) => formatTime(job.createdAt) },
                  {
                    key: 'action',
                    header: 'Action',
                    cell: (job) => (
                      <SecondaryButton onClick={() => navigate(`/job/${job.jobId}`)}>View</SecondaryButton>
                    ),
                  },
                ]}
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
