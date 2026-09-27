import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmCard from '../components/ConfirmCard';
import DataTable from '../components/DataTable';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import StepIndicator from '../components/StepIndicator';
import TagBadge from '../components/TagBadge';
import { useWorkflow } from '../context/WorkflowContext';
import { readErrorMessage } from '../lib/format';
import { generatePreview } from '../services/api';

export default function PreviewPage() {
  const navigate = useNavigate();
  const { validatedObjects, rules, preview, setPreview, confirmPreview } = useWorkflow();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const validObjects = validatedObjects.filter((object) => !object.status || object.status === 'VALID');

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const response = await generatePreview(
        validObjects.map((object) => ({
          bucket: object.bucket,
          key: object.key,
          size: object.size,
          contentType: object.contentType,
          lastModified: object.lastModified,
        })),
        rules
      );
      setPreview(response.data);
    } catch (err) {
      setPreview(null);
      setError(readErrorMessage(err, 'Preview failed.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (validObjects.length === 0 || rules.length === 0) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await generatePreview(
          validObjects.map((object) => ({
            bucket: object.bucket,
            key: object.key,
            size: object.size,
            contentType: object.contentType,
            lastModified: object.lastModified,
          })),
          rules
        );
        if (!cancelled) setPreview(response.data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(readErrorMessage(err, 'Preview failed.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // Reload when the validated set or saved rules change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validatedObjects, rules]);

  const summary = preview?.summary;
  const blocked = !summary || summary.conflictedObjects > 0 || summary.matchedObjects === 0;
  const selected = preview?.objects?.find((object) => `${object.bucket}/${object.key}` === selectedKey);

  function confirmAndContinue() {
    confirmPreview();
    setConfirmOpen(false);
    navigate('/batch-job');
  }

  return (
    <>
      <PageHeader
        title="Retagging Plan"
        description="Review proposed tag changes before creating an S3 Batch Operations job. Nothing has been changed yet."
      />
      <StepIndicator current="preview" />

      <div className="stack">
        {validObjects.length === 0 && <p className="banner banner-warning">No validated objects available.</p>}
        {rules.length === 0 && <p className="banner banner-warning">No rules available.</p>}
        {error && <ErrorState title="Unable to build the preview" message={error} />}
        {loading && <LoadingState label="Building preview" />}

        {summary && (
          <div className="stat-grid">
            <StatCard label="Objects" value={summary.totalObjects} tone="beige" />
            <StatCard label="Tags to Apply" value={summary.totalTagsToApply} />
            <StatCard label="Conflicts" value={summary.conflictedObjects} tone={summary.conflictedObjects ? 'warning' : 'neutral'} />
            <StatCard label="With changes" value={summary.matchedObjects} tone="success" />
            <StatCard label="Unchanged" value={summary.unchangedObjects} />
          </div>
        )}

        {preview?.currentTagsNote && <p className="banner banner-info">{preview.currentTagsNote}</p>}

        {preview?.objects && (
          <DataTable
            rows={preview.objects}
            getRowKey={(object) => `${object.bucket}/${object.key}`}
            getRowClassName={(object) => (object.status === 'CONFLICT' ? 'row-warning' : '')}
            columns={[
              { key: 'object', header: 'Object', cell: (object) => <span className="mono">{object.key}</span> },
              {
                key: 'current',
                header: 'Existing Tags',
                cell: (object) =>
                  object.currentTagsRetrieved ? <TagBadge tags={object.currentTags} /> : <span className="muted">Not retrieved</span>,
              },
              {
                key: 'next',
                header: 'New Tags',
                cell: (object) => (
                  <span className="tag-list">
                    {Object.entries(object.proposedTags || {}).length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      Object.entries(object.proposedTags).map(([key, value]) => (
                        <span key={key} className="tag-badge tag-proposed">{key}={value}</span>
                      ))
                    )}
                  </span>
                ),
              },
              { key: 'status', header: 'Status', cell: (object) => <StatusBadge status={object.status} /> },
              {
                key: 'details',
                header: 'Details',
                cell: (object) => {
                  const id = `${object.bucket}/${object.key}`;
                  return (
                    <SecondaryButton onClick={() => setSelectedKey(selectedKey === id ? '' : id)}>
                      {selectedKey === id ? 'Hide' : 'View'}
                    </SecondaryButton>
                  );
                },
              },
            ]}
          />
        )}

        {selected && <DetailPanel object={selected} />}

        <ConfirmCard title="Review carefully before creating the Batch Operations job.">
          <p className="muted">
            Confirming this plan does not modify objects. S3 objects change only after a Batch Operations job is created and that job finishes successfully.
          </p>
          {summary?.conflictedObjects > 0 && (
            <p className="banner banner-warning">Resolve tag conflicts before confirming. Conflicts do not choose a tag value.</p>
          )}
        </ConfirmCard>

        <div className="button-row">
          <SecondaryButton onClick={() => navigate('/rules')}>Back to Rules</SecondaryButton>
          <SecondaryButton busy={loading} busyLabel="Refreshing..." disabled={validObjects.length === 0 || rules.length === 0} onClick={loadPreview}>
            Refresh Preview
          </SecondaryButton>
          <PrimaryButton disabled={blocked || loading} onClick={() => setConfirmOpen(true)}>
            Confirm Retagging Plan
          </PrimaryButton>
        </div>
      </div>

      {confirmOpen && summary && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <ConfirmCard
            title="Confirm Retagging Plan"
            titleId="confirm-title"
            actions={
              <>
                <SecondaryButton onClick={() => setConfirmOpen(false)}>Cancel</SecondaryButton>
                <PrimaryButton onClick={confirmAndContinue}>Confirm and Continue</PrimaryButton>
              </>
            }
          >
            <p className="muted">
              You are about to create a retagging operation for {summary.matchedObjects} objects. S3 objects will be modified only after the AWS Batch Operations job is created and executed.
            </p>
            <dl className="kv">
              <div><dt>Objects</dt><dd>{summary.matchedObjects}</dd></div>
              <div><dt>Tags to apply</dt><dd>{summary.totalTagsToApply}</dd></div>
              <div><dt>Conflicts</dt><dd>{summary.conflictedObjects}</dd></div>
            </dl>
          </ConfirmCard>
          </div>
        </div>
      )}
    </>
  );
}

function DetailPanel({ object }) {
  return (
    <section className="card card-pad">
      <h2 className="mono">{object.key}</h2>
      <div className="summary-grid" style={{ marginTop: 12 }}>
        <div>
          <p className="label">Existing tags</p>
          <p className="muted">{object.currentTagsRetrieved ? null : 'Not retrieved in preview'}</p>
          {object.currentTagsRetrieved && <TagBadge tags={object.currentTags} />}
        </div>
        <div>
          <p className="label">Proposed tags</p>
          <p className="hint">These tags have not been applied.</p>
          <TagBadge tags={object.proposedTags} />
        </div>
        <div>
          <p className="label">Status</p>
          <StatusBadge status={object.status} />
          {object.conflicts.length > 0 && (
            <ul>
              {object.conflicts.map((conflict) => (
                <li key={conflict.key}>{conflict.key}: {conflict.values.join(' or ')}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
