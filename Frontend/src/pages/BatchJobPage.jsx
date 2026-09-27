import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import JobStatusTimeline from '../components/JobStatusTimeline';
import PageHeader from '../components/PageHeader';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import StepIndicator from '../components/StepIndicator';
import TagBadge from '../components/TagBadge';
import { useWorkflow } from '../context/WorkflowContext';
import { formatTime, readErrorMessage } from '../lib/format';
import { createBatchJobs } from '../services/api';

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
  const completed = jobs.some((job) => String(job.status).toLowerCase() === 'complete');

  async function createJob() {
    if (loading || jobs.length > 0) return;
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
      setError(readErrorMessage(err, 'Could not create the batch job.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title={jobs.length > 0 ? (completed ? 'Retagging Completed' : 'Job Created') : 'Batch Job'}
        description="Creating a Batch Operations job does not immediately modify objects. S3 Batch Operations must execute the job first."
      />
      <StepIndicator current="job" />

      <div className="stack">
        <section className="card card-pad">
          {previewConfirmed && summary ? (
            <>
              <h2 className="section-title">Retagging plan confirmed</h2>
              <p className="muted">
                S3 Batch Operations will apply these tags with S3PutObjectTagging. Objects change only after the job runs. This step does not tag objects one by one.
              </p>
              <div className="stat-grid" style={{ marginTop: 16 }}>
                <StatCard label="Objects" value={summary.matchedObjects} tone="beige" />
                <StatCard label="Tags to apply" value={summary.totalTagsToApply} />
                <StatCard label="Conflicts" value={summary.conflictedObjects} />
              </div>
              {confirmationTimestamp && <p className="hint">Confirmed at {formatTime(confirmationTimestamp)}</p>}
            </>
          ) : (
            <p className="banner banner-warning">No confirmed preview yet. Confirm the preview first.</p>
          )}

          {error && <p className="banner banner-danger" role="alert">{error}</p>}
          {loading && <p className="banner banner-info" role="status">Creating S3 Batch Operations job...</p>}

          {jobs.length === 0 && previewConfirmed && summary && (
            <div style={{ marginTop: 16 }}>
              <JobStatusTimeline created={false} />
              <div style={{ marginTop: 16 }}>
                <PrimaryButton busy={loading} busyLabel="Creating job..." disabled={blocked} onClick={createJob}>
                  Create Batch Operations Job
                </PrimaryButton>
              </div>
            </div>
          )}
        </section>

        {jobs.map((job) => {
          const done = String(job.status).toLowerCase() === 'complete';
          return (
            <article key={job.jobId} className="card card-pad stack">
              <div className="rule-card-head">
                <h2 className="section-title">{done ? 'Retagging completed' : 'Job created'}</h2>
                <StatusBadge status={job.status} />
              </div>
              <p className="muted">
                {done
                  ? 'This job reports a completed status. Open job status to see object-level results and actual S3 tags.'
                  : 'The job exists. Objects are not retagged until Batch Operations finishes and the completion report shows success.'}
              </p>
              <JobStatusTimeline status={job.status} created />
              <dl className="kv">
                <div><dt>Job ID</dt><dd className="mono">{job.jobId}</dd></div>
                <div><dt>Status</dt><dd>{job.status}</dd></div>
                <div><dt>Objects</dt><dd>{job.objectCount}</dd></div>
                <div><dt>Requested tags</dt><dd><TagBadge tags={job.tags} /></dd></div>
                <div><dt>Manifest</dt><dd className="mono">{job.manifestKey}</dd></div>
              </dl>
              <div className="button-row">
                <PrimaryButton onClick={() => navigate(`/job/${job.jobId}`)}>View Job Status</PrimaryButton>
                <Link to="/jobs" className="btn btn-secondary">View Job History</Link>
              </div>
            </article>
          );
        })}

        <div className="button-row">
          <Link to="/preview" className="btn btn-secondary">Back to Preview</Link>
          <SecondaryButton onClick={() => navigate('/jobs')}>View Job History</SecondaryButton>
        </div>
      </div>
    </>
  );
}
