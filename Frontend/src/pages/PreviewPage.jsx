import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Eye, RefreshCw, ShieldCheck } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { generatePreview } from '../services/api';

const buttonClass =
  'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

const quietButtonClass =
  'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

function readError(err) {
  const data = err?.response?.data;
  if (!data) return 'Could not reach the server.';
  const details = Array.isArray(data.error?.details) ? data.error.details.join(' ') : '';
  return details ? `${data.message} ${details}` : data.message || 'Preview failed.';
}

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
      setError(readError(err));
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
            <h1 className="text-lg font-semibold">Retagging Preview</h1>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            CSV → Rules → Preview → Batch Job
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Review the tag changes before creating an AWS Batch Operations job.
        </p>

        {validObjects.length === 0 && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No validated objects available.
          </p>
        )}
        {rules.length === 0 && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No rules available.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        {summary && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card label="Objects" value={summary.totalObjects} />
            <Card label="Objects with changes" value={summary.matchedObjects} />
            <Card label="Unchanged" value={summary.unchangedObjects} />
            <Card label="Conflicts" value={summary.conflictedObjects} />
            <Card label="Tags to apply" value={summary.totalTagsToApply} />
          </div>
        )}

        {loading && (
          <p className="mt-4 text-sm text-slate-600" role="status">
            Building preview...
          </p>
        )}

        {preview?.objects && (
          <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[32rem] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Object</th>
                    <th className="px-4 py-3 font-medium">Matched Rules</th>
                    <th className="px-4 py-3 font-medium">Current Tags</th>
                    <th className="px-4 py-3 font-medium">Proposed Tags</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.objects.map((object) => {
                    const id = `${object.bucket}/${object.key}`;
                    return (
                      <tr
                        key={id}
                        className={`border-t border-slate-100 ${object.status === 'CONFLICT' ? 'bg-amber-50' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs">{object.key}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {object.matchedRules.length ? object.matchedRules.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500">Not retrieved</td>
                        <td className="px-4 py-3 text-slate-700">{formatTags(object.proposedTags)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={object.status} />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                            onClick={() => setSelectedKey(selectedKey === id ? '' : id)}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            View Details
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

        {selected && <DetailPanel object={selected} />}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={quietButtonClass} onClick={() => navigate('/rules')}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Rules
          </button>
          <button
            type="button"
            className={quietButtonClass}
            disabled={loading || validObjects.length === 0 || rules.length === 0}
            onClick={loadPreview}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh Preview
          </button>
          <button type="button" className={buttonClass} disabled={blocked || loading} onClick={() => setConfirmOpen(true)}>
            Confirm Retagging
          </button>
        </div>
        {summary?.conflictedObjects > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Resolve tag conflicts before confirming.
          </p>
        )}
      </main>

      {confirmOpen && summary && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 id="confirm-title" className="text-base font-semibold">
              Confirm Retagging
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You are about to create a retagging operation for {summary.matchedObjects} objects. S3 objects
              will be modified only after the AWS Batch Operations job is created and executed.
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Objects</dt>
                <dd className="font-medium">{summary.matchedObjects}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tags to apply</dt>
                <dd className="font-medium">{summary.totalTagsToApply}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Conflicts</dt>
                <dd className="font-medium">{summary.conflictedObjects}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={quietButtonClass} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className={buttonClass} onClick={confirmAndContinue}>
                <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
                Confirm and Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ object }) {
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-mono text-xs text-slate-900">{object.key}</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Current tags</p>
          <p className="mt-1 text-sm text-slate-700">Not retrieved in preview</p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Proposed tags</p>
          <p className="mt-1 text-sm text-slate-700">{formatTags(object.proposedTags)}</p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Status</p>
          <div className="mt-1">
            <StatusBadge status={object.status} />
          </div>
          {object.conflicts.length > 0 && (
            <ul className="mt-2 text-xs text-amber-800">
              {object.conflicts.map((conflict) => (
                <li key={conflict.key}>
                  {conflict.key}: {conflict.values.join(' or ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function formatTags(tags) {
  const entries = Object.entries(tags || {});
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key} = ${value}`).join(', ');
}

function StatusBadge({ status }) {
  const label = status === 'MATCHED' ? 'READY' : status;
  const styles = {
    MATCHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    UNCHANGED: 'bg-slate-100 text-slate-600 ring-slate-200',
    CONFLICT: 'bg-amber-50 text-amber-800 ring-amber-200',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status] || styles.UNCHANGED}`}>
      {label}
    </span>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
