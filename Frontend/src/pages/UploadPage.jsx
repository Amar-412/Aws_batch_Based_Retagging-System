import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import PageHeader from '../components/PageHeader';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import StepIndicator from '../components/StepIndicator';
import { useWorkflow } from '../context/WorkflowContext';
import { formatBytes, formatTime, readError } from '../lib/format';
import { uploadCsv, validateObjects } from '../services/api';

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
      setError(readError(err, 'Validation failed.'));
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
      setError(readError(err, 'Upload failed.'));
      setStatus('error');
    }
  }

  const busy = status === 'uploading';
  const validObjects = (validation?.objects || []).filter((object) => object.status === 'VALID');
  const allValid = validation && validation.total > 0 && validation.valid === validation.total;

  return (
    <>
      <PageHeader
        title="Upload CSV"
        description="Upload a CSV of S3 bucket and object keys. This step lists references only. Nothing in Amazon S3 is changed."
      />
      <StepIndicator current="upload" />

      {error && <ErrorState title="Upload needs attention" message={error.message} details={error.details} />}

      {status !== 'success' && (
        <section className="card card-pad">
          <div
            className={`dropzone ${dragging ? 'active' : ''}`}
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
          >
            <h2>Upload your CSV</h2>
            <p className="muted">Drag and drop your file here</p>
            <p className="hint">or</p>
            <SecondaryButton disabled={busy} onClick={() => inputRef.current?.click()}>
              Browse Files
            </SecondaryButton>
            <p className="hint">CSV files only</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="file-row">
              <div>
                <p><strong>{file.name}</strong></p>
                <p className="hint">{formatBytes(file.size)}</p>
              </div>
              <div className="button-row">
                <SecondaryButton onClick={reset} disabled={busy}>Remove</SecondaryButton>
                <PrimaryButton onClick={handleUpload} busy={busy} busyLabel="Uploading CSV...">
                  Upload CSV
                </PrimaryButton>
              </div>
            </div>
          )}
        </section>
      )}

      {status === 'success' && result && (
        <div className="stack">
          <div className="banner banner-success" role="status">
            <strong>CSV uploaded successfully.</strong> {result.objectCount} object{result.objectCount === 1 ? '' : 's'} detected.
          </div>

          <section className="card card-pad">
            <div className="file-row" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
              <div>
                <p><strong>{file?.name}</strong></p>
                <p className="hint">
                  {file ? formatBytes(file.size) : '—'} · {result.objectCount} objects · Validation:{' '}
                  {validation ? (allValid ? 'All valid' : `${validation.valid} of ${validation.total} valid`) : 'Not validated yet'}
                </p>
              </div>
              <SecondaryButton onClick={reset}>Remove / Replace</SecondaryButton>
            </div>
          </section>

          <div className="stat-grid">
            <StatCard label="Objects detected" value={result.objectCount} />
            <StatCard label="Duplicates" value={result.duplicates?.length ?? 0} />
            <StatCard label="Warnings" value={result.warnings?.length ?? 0} tone={result.warnings?.length ? 'warning' : 'neutral'} />
          </div>

          {result.warnings?.length > 0 && (
            <div className="banner banner-warning">
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <section>
            <h2 className="section-title">Parsed objects</h2>
            <DataTable
              rows={result.objects}
              getRowKey={(object) => `${object.bucket}/${object.key}`}
              columns={[
                { key: 'bucket', header: 'Bucket', cell: (object) => object.bucket },
                { key: 'key', header: 'Object Key', cell: (object) => <span className="mono">{object.key}</span> },
              ]}
            />
          </section>

          {validating && <LoadingState label={`Validating ${result.objectCount} S3 objects`} lines={3} />}

          {validation && (
            <ValidationResults
              validation={validation}
              onBack={() => setValidation(null)}
              onContinue={continueWith}
            />
          )}

          {!validation && (
            <div>
              <PrimaryButton onClick={handleValidate} busy={validating} busyLabel="Validating S3 objects...">
                Validate Objects
              </PrimaryButton>
              <p className="hint">Checks object metadata in S3. Nothing in the bucket is changed.</p>
            </div>
          )}
        </div>
      )}
    </>
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
    <div className="stack">
      <div className={`banner ${allValid ? 'banner-success' : 'banner-warning'}`} role="status">
        {allValid ? 'All S3 objects are valid.' : `${validation.valid} of ${validation.total} objects are valid.`}
      </div>
      <div className="stat-grid">
        <StatCard label="Total" value={validation.total} />
        <StatCard label="Valid" value={validation.valid} tone="success" />
        <StatCard label="Not Found" value={notFound} tone={notFound ? 'warning' : 'neutral'} />
        <StatCard label="Access Denied" value={accessDenied} tone={accessDenied ? 'failed' : 'neutral'} />
        <StatCard label="Errors" value={errors} tone={errors ? 'failed' : 'neutral'} />
      </div>
      <section>
        <h2 className="section-title">Validation results</h2>
        <DataTable
          rows={objects}
          getRowKey={(object) => `${object.bucket}/${object.key}`}
          columns={[
            { key: 'bucket', header: 'Bucket', cell: (object) => object.bucket },
            { key: 'key', header: 'Object Key', cell: (object) => <span className="mono">{object.key}</span> },
            {
              key: 'status',
              header: 'Status',
              cell: (object) => (
                <div>
                  <StatusBadge status={object.status} />
                  {object.reason && <p className="hint">{object.reason}</p>}
                </div>
              ),
            },
            { key: 'size', header: 'Size', cell: (object) => (typeof object.size === 'number' ? formatBytes(object.size) : '—') },
            { key: 'type', header: 'Content Type', cell: (object) => object.contentType || '—' },
            { key: 'modified', header: 'Last Modified', cell: (object) => formatTime(object.lastModified) },
          ]}
        />
      </section>
      <div className="button-row">
        {allValid && <PrimaryButton onClick={() => onContinue(validObjects)}>Continue to Rules →</PrimaryButton>}
        {!allValid && validObjects.length > 0 && (
          <PrimaryButton onClick={() => onContinue(validObjects)}>Continue with Valid Objects</PrimaryButton>
        )}
        <SecondaryButton onClick={onBack}>Back to Upload</SecondaryButton>
      </div>
    </div>
  );
}
