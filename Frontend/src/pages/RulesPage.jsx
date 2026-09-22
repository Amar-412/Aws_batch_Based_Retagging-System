import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { useWorkflow } from '../context/WorkflowContext';
import {
  FIELDS,
  emptyAction,
  emptyCondition,
  emptyDraft,
  operatorsFor,
  toRule,
} from '../lib/ruleDraft';
import { evaluateRulesBatch, validateRule } from '../services/api';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

const buttonClass =
  'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

const quietButtonClass =
  'rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50';

function readError(err) {
  const data = err?.response?.data;
  if (!data) return { message: 'Could not reach the server.', details: [] };
  const details = data.error?.details;
  return {
    message: data.message || 'Request failed.',
    details: Array.isArray(details) ? details : [],
  };
}

export default function RulesPage() {
  const navigate = useNavigate();
  const { validatedObjects, rules, saveRule, removeRule } = useWorkflow();
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [testResult, setTestResult] = useState(null);

  const preview = useMemo(() => toRule(draft), [draft]);
  const conditionErrors = errors.filter((error) => error.startsWith('Condition'));
  const tagErrors = errors.filter((error) => error.startsWith('Tag') || error.includes('tag action'));
  const otherErrors = errors.filter((error) => !conditionErrors.includes(error) && !tagErrors.includes(error));

  function updateCondition(id, patch) {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition) => {
        if (condition.id !== id) return condition;
        const next = { ...condition, ...patch };
        if (patch.field) {
          const allowed = operatorsFor(patch.field).map((item) => item.id);
          if (!allowed.includes(next.operator)) next.operator = allowed[0];
          next.value = '';
        }
        return next;
      }),
    }));
    setNotice('');
  }

  function updateAction(id, patch) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((action) => (action.id === id ? { ...action, ...patch } : action)),
    }));
    setNotice('');
  }

  async function handleValidate() {
    setBusy('validate');
    setNotice('');
    setErrors([]);
    try {
      await validateRule(preview);
      setNotice('Rule is valid.');
    } catch (err) {
      const parsed = readError(err);
      setErrors(parsed.details.length ? parsed.details : [parsed.message]);
    } finally {
      setBusy('');
    }
  }

  async function handleSave() {
    setBusy('save');
    setNotice('');
    setErrors([]);
    try {
      await validateRule(preview);
      saveRule(preview);
      setNotice('Rule saved.');
      setDraft(emptyDraft());
      setTestResult(null);
    } catch (err) {
      const parsed = readError(err);
      setErrors(parsed.details.length ? parsed.details : [parsed.message]);
    } finally {
      setBusy('');
    }
  }

  async function handleTest() {
    if (validatedObjects.length === 0) return;
    setBusy('test');
    setNotice('');
    setErrors([]);
    try {
      const draftStarted = Boolean(
        draft.name.trim() ||
          draft.conditions.some((condition) => String(condition.value).trim()) ||
          draft.actions.some((action) => action.key.trim() || action.value.trim())
      );
      const draftRule = draftStarted ? preview : null;
      const selected = draftRule
        ? [...rules.filter((rule) => rule.name !== draftRule.name), draftRule]
        : rules;
      if (selected.length === 0) {
        setErrors(['Save a rule or complete the form before testing.']);
        return;
      }
      if (draftRule) await validateRule(draftRule);
      const response = await evaluateRulesBatch(
        validatedObjects.map((object) => ({
          bucket: object.bucket,
          key: object.key,
          size: object.size,
          lastModified: object.lastModified,
          contentType: object.contentType,
        })),
        selected
      );
      setTestResult(response.data);
    } catch (err) {
      const parsed = readError(err);
      setErrors(parsed.details.length ? parsed.details : [parsed.message]);
      setTestResult(null);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">S3 Batch Retagging</p>
            <h1 className="text-lg font-semibold">Rule Builder</h1>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            CSV → Rules → Preview → Batch Job
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_280px] sm:px-6">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <label className="block text-sm font-medium text-slate-700" htmlFor="rule-name">
              Rule Name
            </label>
            <input
              id="rule-name"
              className={`${inputClass} mt-2`}
              value={draft.name}
              placeholder="Finance Documents"
              onChange={(event) => {
                setDraft((current) => ({ ...current, name: event.target.value }));
                setNotice('');
              }}
            />

            <div className="mt-6 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">When</h2>
              <fieldset className="flex items-center gap-3 text-sm">
                <legend className="sr-only">Logic</legend>
                {['AND', 'OR'].map((logic) => (
                  <label key={logic} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="logic"
                      checked={draft.logic === logic}
                      onChange={() => setDraft((current) => ({ ...current, logic }))}
                    />
                    {logic}
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="mt-3 space-y-3">
              {draft.conditions.map((condition, index) => (
                <ConditionRow
                  key={condition.id}
                  condition={condition}
                  showLogic={index > 0}
                  logic={draft.logic}
                  onChange={(patch) => updateCondition(condition.id, patch)}
                  onRemove={() =>
                    setDraft((current) => ({
                      ...current,
                      conditions:
                        current.conditions.length === 1
                          ? current.conditions
                          : current.conditions.filter((item) => item.id !== condition.id),
                    }))
                  }
                />
              ))}
            </div>
            {conditionErrors.length > 0 && <ErrorList errors={conditionErrors} />}
            <button
              type="button"
              className={`${quietButtonClass} mt-3 inline-flex items-center gap-1`}
              onClick={() =>
                setDraft((current) => ({ ...current, conditions: [...current.conditions, emptyCondition()] }))
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Condition
            </button>

            <h2 className="mt-8 text-sm font-semibold tracking-wide text-slate-500 uppercase">Then</h2>
            <div className="mt-3 space-y-3">
              {draft.actions.map((action) => (
                <div key={action.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className={inputClass}
                    placeholder="Tag key"
                    aria-label="Tag key"
                    value={action.key}
                    onChange={(event) => updateAction(action.id, { key: event.target.value })}
                  />
                  <span className="hidden text-slate-400 sm:block">=</span>
                  <input
                    className={inputClass}
                    placeholder="Tag value"
                    aria-label="Tag value"
                    value={action.value}
                    onChange={(event) => updateAction(action.id, { value: event.target.value })}
                  />
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    aria-label="Remove tag"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        actions:
                          current.actions.length === 1
                            ? current.actions
                            : current.actions.filter((item) => item.id !== action.id),
                      }))
                    }
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            {tagErrors.length > 0 && <ErrorList errors={tagErrors} />}
            <button
              type="button"
              className={`${quietButtonClass} mt-3 inline-flex items-center gap-1`}
              onClick={() => setDraft((current) => ({ ...current, actions: [...current.actions, emptyAction()] }))}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Tag
            </button>

            {otherErrors.length > 0 && <ErrorList errors={otherErrors} />}
            {notice && (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-700" role="status">
                <Check className="h-4 w-4" aria-hidden="true" />
                {notice}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className={quietButtonClass} disabled={busy !== ''} onClick={handleValidate}>
                {busy === 'validate' ? 'Validating...' : 'Validate Rule'}
              </button>
              <button type="button" className={buttonClass} disabled={busy !== ''} onClick={handleSave}>
                {busy === 'save' ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
          </section>

          <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
              JSON preview
              <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </summary>
            <pre className="overflow-auto border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-700">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </details>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold">Test Rule Against Objects</h2>
            <p className="mt-1 text-sm text-slate-600">
              {validatedObjects.length} validated object{validatedObjects.length === 1 ? '' : 's'} from the upload step.
              Testing does not change Amazon S3.
            </p>
            {validatedObjects.length === 0 && (
              <p className="mt-3 text-sm text-amber-800">
                No validated objects yet. Validate a CSV on the upload page, then continue here with the valid objects.
              </p>
            )}
            <button
              type="button"
              className={`${buttonClass} mt-4`}
              disabled={busy !== '' || validatedObjects.length === 0}
              onClick={handleTest}
            >
              {busy === 'test' ? 'Testing...' : 'Test Rule'}
            </button>

            {testResult && <TestResults result={testResult} />}
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={rules.length === 0 || !testResult}
              onClick={() => navigate('/preview')}
            >
              Continue to Preview
            </button>
            <p className="self-center text-xs text-slate-500">
              {rules.length === 0 || !testResult ? 'Save and test a rule before continuing.' : 'Preview is the next step.'}
            </p>
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Saved rules</h2>
          {rules.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No rules saved yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rules.map((rule) => (
                <li key={rule.name} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{rule.name}</p>
                      <p className="text-xs text-slate-500">
                        {rule.logic} · {rule.conditions.length} condition{rule.conditions.length === 1 ? '' : 's'} ·{' '}
                        {rule.actions.length} tag{rule.actions.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Remove ${rule.name}`}
                      onClick={() => {
                        removeRule(rule.name);
                        setTestResult(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}

function ConditionRow({ condition, showLogic, logic, onChange, onRemove }) {
  const operators = operatorsFor(condition.field);
  const kind = FIELDS.find((field) => field.id === condition.field)?.kind;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {showLogic && <span className="w-10 text-xs font-medium text-slate-400">{logic}</span>}
      <select
        className={inputClass}
        aria-label="Field"
        value={condition.field}
        onChange={(event) => onChange({ field: event.target.value })}
      >
        {FIELDS.map((field) => (
          <option key={field.id} value={field.id}>
            {field.label}
          </option>
        ))}
      </select>
      <select
        className={inputClass}
        aria-label="Operator"
        value={condition.operator}
        onChange={(event) => onChange({ operator: event.target.value })}
      >
        {operators.map((operator) => (
          <option key={operator.id} value={operator.id}>
            {operator.label}
          </option>
        ))}
      </select>
      <input
        className={inputClass}
        aria-label="Condition value"
        type={kind === 'number' ? 'number' : kind === 'date' ? 'datetime-local' : 'text'}
        placeholder={condition.field === 'extension' ? '.pdf' : 'Value'}
        value={condition.value}
        onChange={(event) => onChange({ value: event.target.value })}
      />
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label="Remove condition"
        onClick={onRemove}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ErrorList({ errors }) {
  return (
    <ul className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      {errors.map((error) => (
        <li key={error} className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </li>
      ))}
    </ul>
  );
}

function TestResults({ result }) {
  return (
    <div className="mt-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Mini label="Total" value={result.total} />
        <Mini label="Matched" value={result.matched} />
        <Mini label="Unmatched" value={result.unmatched} />
        <Mini label="Conflicts" value={result.conflicts} />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="max-h-80 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Object</th>
                <th className="px-4 py-3 font-medium">Rules</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((row) => (
                <tr key={`${row.bucket}/${row.key}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">{row.key}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.matchedRules.length ? row.matchedRules.join(', ') : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {Object.keys(row.tags).length
                      ? Object.entries(row.tags)
                          .map(([key, value]) => `${key}=${value}`)
                          .join(', ')
                      : '-'}
                    {row.conflicts?.length > 0 && (
                      <p className="mt-1 text-xs text-amber-800">
                        {row.conflicts
                          .map((conflict) => `${conflict.tag}: ${conflict.values.join(' or ')}`)
                          .join('; ')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    MATCH: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    NO_MATCH: 'bg-slate-100 text-slate-600 ring-slate-200',
    CONFLICT: 'bg-amber-50 text-amber-800 ring-amber-200',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status] || styles.NO_MATCH}`}>
      {status === 'MATCH' ? 'MATCH' : status === 'CONFLICT' ? 'CONFLICT' : 'NO MATCH'}
    </span>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
