import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorState from '../components/ErrorState';
import JobStatusTimeline from '../components/JobStatusTimeline';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import SecondaryButton from '../components/SecondaryButton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import TagBadge from '../components/TagBadge';
import { formatTime } from '../lib/format';
import { downloadBatchReport, getBatchJob } from '../services/api';

const TERMINAL = new Set(['Complete', 'Failed', 'Cancelled', 'Canceled']);
const POLL_MS = 10000;
const REPORT_RETRIES = 3;

function readError(err) {
  const data = err?.response?.data;
  if (!data) return 'Could not reach the server.';
  return data.message || 'Could not load the job.';
}

export default function JobStatusPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
    if (downloading) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadBatchReport(jobId);
    } catch (err) {
      setDownloadError(readError(err));
    } finally {
      setDownloading(false);
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
  const finished = job ? TERMINAL.has(job.status) : false;
  const accounted = Number(counts.succeeded || 0) + Number(counts.failed || 0);
  const percent = counts.total > 0 ? Math.min(100, Math.round((accounted / counts.total) * 100)) : finished ? 100 : 0;

  return (
    <>
      <PageHeader
        title="Job Status"
        description="Task results come from the S3 Batch Operations completion report. Requested tags are not proof that an object was tagged."
        actions={job ? <StatusBadge status={job.status} /> : null}
      />

      {loading && !job && <LoadingState label="Loading job status" />}
      {error && (
        <ErrorState
          title="Unable to load job"
          message={error}
          onRetry={refresh}
        />
      )}

      {job && (
        <div className="stack">
          <section className="card card-pad">
            <p className="label">Job ID</p>
            <p className="mono">{job.jobId}</p>
            <div style={{ marginTop: 16 }}>
              <JobStatusTimeline status={job.status} created />
            </div>
            <dl className="kv">
              <div><dt>Created</dt><dd>{formatTime(job.creationTime || job.createdAt)}</dd></div>
              <div><dt>Updated</dt><dd>{formatTime(job.updatedAt || job.terminationDate)}</dd></div>
              <div><dt>Requested tags</dt><dd><TagBadge tags={job.tags} /></dd></div>
            </dl>
            {!summary?.fromReport && !finished && (
              <p className="banner banner-info" role="status">
                {refreshing ? 'Refreshing job status...' : 'Batch Operations job is currently running. Status refreshes automatically.'}
              </p>
            )}
          </section>

          <div className="stat-grid">
            <StatCard label="Total" value={counts.total} />
            <StatCard label="Successful" value={counts.succeeded} tone="success" />
            <StatCard label="Failed" value={counts.failed} tone={counts.failed > 0 ? 'failed' : 'neutral'} />
          </div>

          <section className="card card-pad">
            <div className="progress-meta">
              <span>{summary?.fromReport ? 'Reported tasks' : 'Progress'}</span>
              <span>{percent}%</span>
            </div>
            <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin="0" aria-valuemax="100" aria-label="Job progress">
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>
          </section>

          <section className="stack">
            <h2 className="section-title">Retagging Results</h2>
            {job.results?.length > 0 ? (
              <DataTable
                rows={job.results}
                getRowKey={(row) => `${row.bucket}/${row.key}/${row.taskStatus}`}
                getRowClassName={(row) => (row.taskStatus === 'succeeded' ? '' : 'row-failed')}
                columns={[
                  { key: 'status', header: 'Status', cell: (row) => <ResultStatus row={row} /> },
                  { key: 'object', header: 'Object', cell: (row) => <span className="mono">{row.key}</span> },
                  { key: 'http', header: 'HTTP Status', cell: (row) => row.httpStatusCode || '—' },
                  { key: 'requested', header: 'Requested Tags', cell: () => <TagBadge tags={job.tags} /> },
                  {
                    key: 'actual',
                    header: 'Actual S3 Tags',
                    cell: (row) => <ActualTags row={row} />,
                  },
                  {
                    key: 'message',
                    header: 'Message',
                    cell: (row) => (row.taskStatus === 'succeeded' ? row.resultMessage || 'Successful' : row.resultMessage || 'Failed'),
                  },
                ]}
              />
            ) : (
              <div className={`banner ${finished ? 'banner-warning' : 'banner-info'}`}>
                {finished
                  ? job.report?.message || 'Completion report is not available yet.'
                  : 'Batch Operations job is currently running. Results appear after it finishes.'}
              </div>
            )}
          </section>

          <section className="card card-pad">
            <h2 className="section-title">Batch Operations Report</h2>
            {job.report?.available ? (
              <p className="muted">The completion report lists each task. Download does not include AWS credentials.</p>
            ) : (
              <p className="banner banner-warning">{job.report?.message || 'Completion report is not available yet.'}</p>
            )}
            {job.report?.manifestKey && <p className="mono hint">{job.report.manifestKey}</p>}
            {downloadError && <p className="banner banner-danger" role="alert">{downloadError}</p>}
            {job.report?.available && (
              <SecondaryButton busy={downloading} busyLabel="Downloading..." onClick={downloadReport}>
                Download Report
              </SecondaryButton>
            )}
          </section>
        </div>
      )}

      <div className="button-row" style={{ marginTop: 16 }}>
        <SecondaryButton busy={refreshing} disabled={loading && !job} busyLabel="Refreshing..." onClick={refresh}>
          Refresh status
        </SecondaryButton>
        <Link to="/batch-job" className="btn btn-secondary">Back to Batch Job</Link>
        <Link to="/jobs" className="btn btn-secondary">Job History</Link>
      </div>
    </>
  );
}

function ResultStatus({ row }) {
  const succeeded = row.taskStatus === 'succeeded';
  return (
    <div>
      <StatusBadge status={succeeded ? 'succeeded' : 'failed'} />
      {!succeeded && row.errorCode && <p className="hint">{row.errorCode}</p>}
    </div>
  );
}

function ActualTags({ row }) {
  if (row.taskStatus !== 'succeeded') return <span className="muted">—</span>;
  if (row.actualTagsRetrieved) return <TagBadge tags={row.actualTags} empty="—" />;
  return <span className="muted">{row.actualTagsMessage || '—'}</span>;
}
