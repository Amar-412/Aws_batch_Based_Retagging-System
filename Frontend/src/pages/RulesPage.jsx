import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import StepIndicator from '../components/StepIndicator';
import TagBadge from '../components/TagBadge';
import { useWorkflow } from '../context/WorkflowContext';
import { FIELDS, draftFromRule, emptyAction, emptyCondition, emptyDraft, operatorsFor, parseRuleJson, toRule } from '../lib/ruleDraft';
import { formatTime, readError } from '../lib/format';
import { evaluateRulesBatch, validateRule } from '../services/api';

export default function RulesPage() {
  const navigate = useNavigate();
  const { validatedObjects, rules, saveRule, removeRule } = useWorkflow();
  const [draft, setDraft] = useState(emptyDraft);
  const [mode, setMode] = useState('visual');
  const [jsonText, setJsonText] = useState(() => JSON.stringify(toRule(emptyDraft()), null, 2));
  const [validatedJson, setValidatedJson] = useState('');
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
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
      const parsed = readError(err, 'Rule validation failed.');
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
      saveRule({
        ...preview,
        updatedAt: new Date().toISOString(),
        validationStatus: 'valid',
      });
      setNotice('Rule saved.');
      setDraft(emptyDraft());
      setTestResult(null);
    } catch (err) {
      const parsed = readError(err, 'Could not save the rule.');
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
      const selected = draftRule ? [...rules.filter((rule) => rule.name !== draftRule.name), draftRule] : rules;
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
      const parsed = readError(err, 'Could not test the rules.');
      setErrors(parsed.details.length ? parsed.details : [parsed.message]);
      setTestResult(null);
    } finally {
      setBusy('');
    }
  }

  function showVisual() {
    if (mode === 'visual') return;
    const parsed = parseRuleJson(jsonText);
    if (!parsed.ok) {
      setSwitchError('Fix the JSON before switching to the visual builder. The current visual rule was kept.');
      return;
    }
    const mapped = draftFromRule(parsed.rule);
    if (!mapped.ok) {
      setSwitchError(`${mapped.message} The current visual rule was kept.`);
      return;
    }
    setDraft(mapped.draft);
    setErrors([]);
    setNotice('');
    setSwitchError('');
    setMode('visual');
  }

  function showJson() {
    if (mode === 'json') return;
    setJsonText(JSON.stringify(toRule(draft), null, 2));
    setValidatedJson('');
    setErrors([]);
    setNotice('');
    setSwitchError('');
    setMode('json');
  }

  function formatJson() {
    const parsed = parseRuleJson(jsonText);
    if (!parsed.ok) {
      setErrors([parsed.message]);
      setNotice('');
      return;
    }
    const pretty = JSON.stringify(parsed.rule, null, 2);
    setJsonText(pretty);
    if (validatedJson) setValidatedJson(pretty);
    setErrors([]);
  }

  async function handleValidateJson() {
    setBusy('validate-json');
    setNotice('');
    setErrors([]);
    const parsed = parseRuleJson(jsonText);
    if (!parsed.ok) {
      setValidatedJson('');
      setErrors([parsed.message]);
      setBusy('');
      return;
    }
    const mapped = draftFromRule(parsed.rule);
    if (!mapped.ok) {
      setValidatedJson('');
      setErrors([mapped.message]);
      setBusy('');
      return;
    }
    const rule = toRule(mapped.draft);
    try {
      await validateRule(rule);
      setDraft(mapped.draft);
      setValidatedJson(jsonText);
      setNotice('Rule is valid.');
      setSwitchError('');
    } catch (err) {
      setValidatedJson('');
      const parsedError = readError(err, 'Rule validation failed.');
      setErrors(parsedError.details.length ? parsedError.details : [parsedError.message]);
    } finally {
      setBusy('');
    }
  }

  async function handleSaveJson() {
    if (!validatedJson || validatedJson !== jsonText) return;
    setBusy('save-json');
    setNotice('');
    setErrors([]);
    const parsed = parseRuleJson(jsonText);
    const mapped = parsed.ok ? draftFromRule(parsed.rule) : { ok: false };
    if (!parsed.ok || !mapped.ok) {
      setErrors([parsed.message || mapped.message]);
      setValidatedJson('');
      setBusy('');
      return;
    }
    const rule = toRule(mapped.draft);
    try {
      await validateRule(rule);
      saveRule({
        ...rule,
        updatedAt: new Date().toISOString(),
        validationStatus: 'valid',
      });
      setNotice('Rule saved.');
      setSwitchError('');
      const fresh = emptyDraft();
      setDraft(fresh);
      setJsonText(JSON.stringify(toRule(fresh), null, 2));
      setValidatedJson('');
      setTestResult(null);
    } catch (err) {
      const parsedError = readError(err, 'Could not save the rule.');
      setErrors(parsedError.details.length ? parsedError.details : [parsedError.message]);
    } finally {
      setBusy('');
    }
  }

  function editRule(rule) {
    const mapped = draftFromRule(rule);
    if (!mapped.ok) {
      setErrors([mapped.message]);
      return;
    }
    setDraft(mapped.draft);
    setJsonText(JSON.stringify(toRule(mapped.draft), null, 2));
    setValidatedJson('');
    setMode('visual');
    setNotice('');
    setErrors([]);
    setSwitchError('');
  }

  async function testSaved(rule) {
    if (validatedObjects.length === 0) {
      setErrors(['No validated objects yet. Validate a CSV on the upload page, then test the rule.']);
      return;
    }
    setBusy('test');
    setNotice('');
    setErrors([]);
    try {
      const response = await evaluateRulesBatch(
        validatedObjects.map((object) => ({
          bucket: object.bucket,
          key: object.key,
          size: object.size,
          lastModified: object.lastModified,
          contentType: object.contentType,
        })),
        [rule]
      );
      setTestResult(response.data);
    } catch (err) {
      const parsedError = readError(err, 'Could not test the rule.');
      setErrors(parsedError.details.length ? parsedError.details : [parsedError.message]);
      setTestResult(null);
    } finally {
      setBusy('');
    }
  }

  async function copyJson() {
    const parsed = parseRuleJson(jsonText);
    const text = parsed.ok ? JSON.stringify(parsed.rule, null, 2) : jsonText;
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice('Copied.');
    } catch {
      setCopyNotice('Copy is not available in this browser.');
    }
  }

  const parsedJson = parseRuleJson(jsonText);
  const jsonPreview = parsedJson.ok ? JSON.stringify(parsedJson.rule, null, 2) : '';

  return (
    <>
      <PageHeader
        title="Retagging Rules"
        description="Build rules that propose tags. Saving and testing a rule does not change Amazon S3."
      />
      <StepIndicator current="rules" />

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard label="Objects" value={validatedObjects.length} tone="beige" />
        <StatCard label="Rules" value={rules.length} tone="active" />
        <StatCard
          label="Conflicts"
          value={testResult ? testResult.conflicts : '—'}
          tone={testResult?.conflicts ? 'warning' : 'neutral'}
          hint={testResult ? 'From the latest test' : 'Test the rules to count conflicts'}
        />
      </div>

      <div className="segment" role="tablist" aria-label="Rule editor">
        <button type="button" role="tab" aria-selected={mode === 'visual'} onClick={showVisual}>
          Visual Builder
        </button>
        <button type="button" role="tab" aria-selected={mode === 'json'} onClick={showJson}>
          JSON Editor
        </button>
      </div>
      {switchError && <p className="banner banner-danger" role="alert">{switchError}</p>}

      <div className="layout-2">
        <div className="stack">
          {mode === 'visual' && <section className="card card-pad">
            <h2 className="section-title">New rule</h2>
            <label className="field" htmlFor="rule-name">
              <span>Rule name</span>
              <input
                id="rule-name"
                className="input"
                value={draft.name}
                placeholder="Finance Documents"
                onChange={(event) => {
                  setDraft((current) => ({ ...current, name: event.target.value }));
                  setNotice('');
                }}
              />
            </label>

            <div className="rule-card-head" style={{ marginTop: 18 }}>
              <h3 className="section-title">When</h3>
              <fieldset className="logic-choice">
                <legend className="sr-only">Logic</legend>
                {['AND', 'OR'].map((logic) => (
                  <label key={logic}>
                    <input
                      type="radio"
                      name="logic"
                      checked={draft.logic === logic}
                      onChange={() => setDraft((current) => ({ ...current, logic }))}
                    />{' '}
                    {logic}
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="stack">
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
            <SecondaryButton
              className="btn"
              onClick={() => setDraft((current) => ({ ...current, conditions: [...current.conditions, emptyCondition()] }))}
            >
              Add Condition
            </SecondaryButton>

            <h3 className="section-title" style={{ marginTop: 20 }}>Then apply tags</h3>
            <div className="stack">
              {draft.actions.map((action, index) => (
                <div key={action.id} className="card rule-card">
                  <div className="rule-card-head">
                    <strong>Tag {index + 1}</strong>
                    <button
                      type="button"
                      className="btn btn-text"
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
                      Remove
                    </button>
                  </div>
                  <div className="form-grid" style={{ marginTop: 12 }}>
                    <label className="field">
                      <span>Tag Key</span>
                      <input
                        className="input"
                        aria-label="Tag key"
                        placeholder="environment"
                        value={action.key}
                        onChange={(event) => updateAction(action.id, { key: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Tag Value</span>
                      <input
                        className="input"
                        aria-label="Tag value"
                        placeholder="test"
                        value={action.value}
                        onChange={(event) => updateAction(action.id, { value: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {tagErrors.length > 0 && <ErrorList errors={tagErrors} />}
            <SecondaryButton onClick={() => setDraft((current) => ({ ...current, actions: [...current.actions, emptyAction()] }))}>
              Add Tag
            </SecondaryButton>

            {otherErrors.length > 0 && <ErrorList errors={otherErrors} />}
            {notice && (
              <p className="banner banner-success" role="status" style={{ marginTop: 16 }}>
                {notice}
              </p>
            )}

            <div className="button-row" style={{ marginTop: 16 }}>
              <SecondaryButton busy={busy === 'validate'} busyLabel="Validating..." disabled={busy !== ''} onClick={handleValidate}>
                Validate Rule
              </SecondaryButton>
              <SecondaryButton busy={busy === 'save'} busyLabel="Saving..." disabled={busy !== ''} onClick={handleSave}>
                Save Rule
              </SecondaryButton>
            </div>
          </section>}

          {mode === 'json' && (
            <section className="card card-pad">
              <h2 className="section-title">JSON rule editor</h2>
              <p className="muted">
                Use the existing rule schema: name, logic (AND or OR), conditions with field, operator, and value, and actions with type SET_TAG, key, and value. Fields are key, extension, bucket, size, and lastModified.
              </p>
              <label className="field" htmlFor="rule-json">
                <span>Rule JSON</span>
                <textarea
                  id="rule-json"
                  className="json-editor"
                  spellCheck="false"
                  value={jsonText}
                  onChange={(event) => {
                    setJsonText(event.target.value);
                    setValidatedJson('');
                    setNotice('');
                    setCopyNotice('');
                    setSwitchError('');
                  }}
                />
              </label>
              {errors.length > 0 && <ErrorList errors={errors} />}
              {notice && <p className="banner banner-success" role="status">{notice}</p>}
              <div className="button-row" style={{ marginTop: 16 }}>
                <SecondaryButton disabled={busy !== ''} onClick={formatJson}>Format JSON</SecondaryButton>
                <SecondaryButton busy={busy === 'validate-json'} busyLabel="Validating..." disabled={busy !== ''} onClick={handleValidateJson}>
                  Validate JSON
                </SecondaryButton>
                <SecondaryButton
                  busy={busy === 'save-json'}
                  busyLabel="Saving..."
                  disabled={busy !== '' || !validatedJson || validatedJson !== jsonText}
                  onClick={handleSaveJson}
                >
                  Save Rule
                </SecondaryButton>
              </div>
              <div className="rule-card-head" style={{ marginTop: 20 }}>
                <h3 className="section-title">Parsed rule</h3>
                <SecondaryButton onClick={copyJson}>Copy</SecondaryButton>
              </div>
              {copyNotice && <p className="hint" role="status">{copyNotice}</p>}
              {jsonPreview ? (
                <pre className="json-preview">{jsonPreview}</pre>
              ) : (
                <p className="banner banner-danger" role="alert">JSON is not valid yet. The preview appears after the text parses.</p>
              )}
            </section>
          )}

          {mode === 'visual' && <details className="card">
            <summary>JSON preview</summary>
            <pre className="json-preview">{JSON.stringify(preview, null, 2)}            </pre>
          </details>}

          <section className="card card-pad">
            <h2 className="section-title">Test rules against objects</h2>
            <p className="muted">
              {validatedObjects.length} validated object{validatedObjects.length === 1 ? '' : 's'} from the upload step.
              Testing does not change Amazon S3.
            </p>
            {validatedObjects.length === 0 && (
              <p className="banner banner-warning">No validated objects yet. Validate a CSV on the upload page, then continue here.</p>
            )}
            <SecondaryButton
              busy={busy === 'test'}
              busyLabel="Testing..."
              disabled={busy !== '' || validatedObjects.length === 0}
              onClick={handleTest}
            >
              Test Rule
            </SecondaryButton>
            {testResult && <TestResults result={testResult} />}
          </section>

          <div className="button-row">
            <PrimaryButton disabled={rules.length === 0 || !testResult} onClick={() => navigate('/preview')}>
              Continue to Preview →
            </PrimaryButton>
            <p className="hint">
              {rules.length === 0 || !testResult ? 'Save and test a rule before continuing.' : 'Preview is the next step.'}
            </p>
          </div>
        </div>

        <aside className="stack">
          <h2 className="section-title">Saved rules</h2>
          {rules.length === 0 ? (
            <p className="card card-pad muted">No rules saved yet.</p>
          ) : (
            rules.map((rule, index) => (
              <article key={rule.name} className="card rule-card">
                <div className="rule-card-head">
                  <strong>{rule.name || `Rule ${index + 1}`}</strong>
                  <button
                    type="button"
                    className="btn btn-text"
                    aria-label={`Remove ${rule.name}`}
                    onClick={() => {
                      removeRule(rule.name);
                      setTestResult(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
                <p className="hint">{rule.logic} · {rule.conditions.length} condition{rule.conditions.length === 1 ? '' : 's'}</p>
                <p className="hint">{rule.actions.length} tag{rule.actions.length === 1 ? '' : 's'}</p>
                <p className="hint">Updated {formatTime(rule.updatedAt)}</p>
                <p className="hint">Validation: {rule.validationStatus === 'valid' ? 'Valid' : 'Not checked'}</p>
                <div className="stack" style={{ marginTop: 12 }}>
                  {rule.actions.map((action) => (
                    <TagBadge key={`${action.key}-${action.value}`} tags={{ [action.key]: action.value }} />
                  ))}
                </div>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <SecondaryButton onClick={() => editRule(rule)}>Edit</SecondaryButton>
                  <SecondaryButton busy={busy === 'test'} busyLabel="Testing..." disabled={busy !== ''} onClick={() => testSaved(rule)}>
                    Test
                  </SecondaryButton>
                </div>
              </article>
            ))
          )}
        </aside>
      </div>
    </>
  );
}

function ConditionRow({ condition, showLogic, logic, onChange, onRemove }) {
  const operators = operatorsFor(condition.field);
  const kind = FIELDS.find((field) => field.id === condition.field)?.kind;

  return (
    <div className="inline-fields">
      {showLogic ? <span className="muted">{logic}</span> : <span />}
      <select className="select" aria-label="Field" value={condition.field} onChange={(event) => onChange({ field: event.target.value })}>
        {!FIELDS.some((field) => field.id === condition.field) && (
          <option value={condition.field}>{condition.field}</option>
        )}
        {FIELDS.map((field) => (
          <option key={field.id} value={field.id}>{field.label}</option>
        ))}
      </select>
      <select className="select" aria-label="Operator" value={condition.operator} onChange={(event) => onChange({ operator: event.target.value })}>
        {!operators.some((operator) => operator.id === condition.operator) && (
          <option value={condition.operator}>{condition.operator}</option>
        )}
        {operators.map((operator) => (
          <option key={operator.id} value={operator.id}>{operator.label}</option>
        ))}
      </select>
      <input
        className="input"
        aria-label="Condition value"
        type={kind === 'number' ? 'number' : kind === 'date' ? 'datetime-local' : 'text'}
        placeholder={condition.field === 'extension' ? '.pdf' : 'Value'}
        value={condition.value}
        onChange={(event) => onChange({ value: event.target.value })}
      />
      <button type="button" className="btn btn-text" onClick={onRemove}>Remove</button>
    </div>
  );
}

function ErrorList({ errors }) {
  return (
    <ul className="banner banner-danger" role="alert">
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

function TestResults({ result }) {
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <div className="stat-grid">
        <StatCard label="Total" value={result.total} />
        <StatCard label="Matched" value={result.matched} tone="success" />
        <StatCard label="Unmatched" value={result.unmatched} />
        <StatCard label="Conflicts" value={result.conflicts} tone={result.conflicts ? 'warning' : 'neutral'} />
      </div>
      <DataTable
        rows={result.results}
        getRowKey={(row) => `${row.bucket}/${row.key}`}
        getRowClassName={(row) => (row.status === 'CONFLICT' ? 'row-warning' : '')}
        columns={[
          { key: 'object', header: 'Object', cell: (row) => <span className="mono">{row.key}</span> },
          { key: 'rules', header: 'Rules', cell: (row) => (row.matchedRules.length ? row.matchedRules.join(', ') : '—') },
          {
            key: 'tags',
            header: 'Tags',
            cell: (row) => (
              <div>
                <TagBadge tags={row.tags} />
                {row.conflicts?.length > 0 && (
                  <p className="hint">
                    {row.conflicts.map((conflict) => `${conflict.tag}: ${conflict.values.join(' or ')}`).join('; ')}
                  </p>
                )}
              </div>
            ),
          },
          { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </div>
  );
}
