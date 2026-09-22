import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, File, Trash2, Upload, X } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import { uploadCsv, validateObjects } from '../services/api';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readError(err) {
  const data = err?.response?.data;
  if (!data) {
    return { message: 'Could not reach the server. Check that the backend is running.' };
  }

  const details = data.error?.details;
  return {
    message: data.message || 'Upload failed.',
    details: Array.isArray(details) ? details : [],
  };
}

const STATUS_STYLES = {
  VALID: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  NOT_FOUND: 'bg-amber-50 text-amber-800 ring-amber-200',
  ACCESS_DENIED: 'bg-red-50 text-red-700 ring-red-200',
  ERROR: 'bg-red-50 text-red-700 ring-red-200',
};

export default function UploadPage() {
  const navigate = useNavigate();
  const { setValidatedObjects } = useWorkflow();
  const inputRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  function reset() {
    setStatus('idle');
    setFile(null);
    setResult(null);
    setValidation(null);
    setValidating(false);
    setError(null);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function acceptFile(nextFile) {
    if (!nextFile) return;

    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setResult(null);
      setValidation(null);
      setError({ message: 'Only CSV files are accepted.', details: [] });
      setStatus('error');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setFile(nextFile);
    setResult(null);
    setValidation(null);
    setError(null);
    setStatus('selected');
  }

  async function handleValidate() {
    if (!result?.objects?.length || validating) return;

    setValidating(true);
    setError(null);

    try {
      const response = await validateObjects(result.objects);
      setValidation(response.data);
    } catch (err) {
      setValidation(null);
      setError(readError(err));
    } finally {
      setValidating(false);
    }
  }

  function continueWith(objects) {
    setValidatedObjects(objects);
    navigate('/rules');
  }

  async function handleUpload() {
    if (!file || status === 'uploading') return;

    setStatus('uploading');
    setError(null);

    try {
      const response = await uploadCsv(file);
      setResult(response.data);
      setStatus('success');
    } catch (err) {
      setResult(null);
      setError(readError(err));
      setStatus('error');
    }
  }

  const busy = status === 'uploading';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              S3 Batch Retagging
            </p>
            <h1 className="text-lg font-semibold text-slate-900">Upload S3 Object List</h1>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            CSV → Rules → Preview → Batch Job
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Upload a CSV containing your S3 bucket and object keys. The file lists object
          references only. Nothing is changed in Amazon S3 during this step.
        </p>

        {error && (
          <div
            className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">{error.message}</p>
              {error.details?.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-red-700">
                  {error.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {status !== 'success' && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!busy) acceptFile(event.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center transition ${
                dragging
                  ? 'border-slate-900 bg-slate-100'
                  : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white'
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                <Upload className="h-5 w-5 text-slate-700" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-semibold text-slate-900">Upload CSV</h2>
              <p className="mt-1 text-sm text-slate-600">Drag and drop your CSV here</p>
              <p className="mt-2 text-xs text-slate-400">or</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Browse Files
              </button>
              <p className="mt-3 text-xs text-slate-500">CSV files only</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => acceptFile(event.target.files?.[0])}
              />
            </div>

            {file && (
              <div className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <File className="mt-0.5 h-5 w-5 text-slate-500" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={busy}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Uploading CSV...' : 'Upload CSV'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {status === 'success' && result && (
          <section className="mt-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium text-emerald-950">CSV uploaded successfully</p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {result.objectCount} object{result.objectCount === 1 ? '' : 's'} detected
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Objects detected" value={result.objectCount} />
              <Stat label="Duplicates" value={result.duplicates?.length ?? 0} />
              <Stat label="Warnings" value={result.warnings?.length ?? 0} />
            </div>

            {result.warnings?.length > 0 && (
              <ul className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Parsed objects</h2>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload another
                </button>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Bucket</th>
                      <th className="px-4 py-3 font-medium">Object Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.objects.map((object) => (
                      <tr key={`${object.bucket}/${object.key}`} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-700">{object.bucket}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-900">{object.key}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {validating && (
              <p className="mt-4 text-sm text-slate-600" role="status">
                Validating S3 objects... Checking {result.objectCount} objects...
              </p>
            )}

            {validation && (
              <ValidationResults
                validation={validation}
                onBack={() => setValidation(null)}
                onContinue={continueWith}
              />
            )}

            {!validation && (
              <div className="mt-6 flex flex-col items-start gap-2">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={validating}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {validating ? 'Validating S3 objects...' : 'Validate Objects'}
                </button>
                <p className="text-xs text-slate-500">
                  Checks object metadata in S3. Nothing in the bucket is changed.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function ValidationResults({ validation, onBack, onContinue }) {
  const objects = validation.objects ?? [];
  const notFound = objects.filter((object) => object.status === 'NOT_FOUND').length;
  const accessDenied = objects.filter((object) => object.status === 'ACCESS_DENIED').length;
  const errors = objects.filter((object) => object.status === 'ERROR').length;
  const allValid = validation.total > 0 && validation.valid === validation.total;
  const validObjects = objects.filter((object) => object.status === 'VALID');

  return (
    <div className="mt-6">
      <div
        className={`rounded-xl border px-4 py-4 shadow-sm ${
          allValid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {allValid ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" aria-hidden="true" />
          )}
          <p className={`text-sm font-medium ${allValid ? 'text-emerald-950' : 'text-amber-950'}`}>
            {allValid
              ? 'All S3 objects are valid.'
              : `${validation.valid} of ${validation.total} objects are valid.`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total" value={validation.total} />
        <Stat label="Valid" value={validation.valid} />
        <Stat label="Not Found" value={notFound} />
        <Stat label="Access Denied" value={accessDenied} />
        <Stat label="Errors" value={errors} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Validation results</h2>
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Bucket</th>
                <th className="px-4 py-3 font-medium">Object Key</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Content Type</th>
                <th className="px-4 py-3 font-medium">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {objects.map((object) => (
                <tr key={`${object.bucket}/${object.key}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">{object.bucket}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-900">{object.key}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUS_STYLES[object.status] || STATUS_STYLES.ERROR
                      }`}
                    >
                      {object.status}
                    </span>
                    {object.reason && (
                      <p className="mt-1 text-xs text-slate-500">{object.reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {typeof object.size === 'number' ? formatBytes(object.size) : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{object.contentType || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{formatModified(object.lastModified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {allValid && (
          <button
            type="button"
            onClick={() => onContinue(validObjects)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Continue to Rules
          </button>
        )}
        {!allValid && validObjects.length > 0 && (
          <button
            type="button"
            onClick={() => onContinue(validObjects)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Continue with Valid Objects
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          Back to Upload
        </button>
      </div>
    </div>
  );
}

function formatModified(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
