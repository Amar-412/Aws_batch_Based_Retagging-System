import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const OBJECTS_KEY = 'retag.validatedObjects';
const RULES_KEY = 'retag.rules';
const PREVIEW_KEY = 'retag.preview';
const CONFIRMED_KEY = 'retag.previewConfirmed';
const TIMESTAMP_KEY = 'retag.confirmationTimestamp';

const WorkflowContext = createContext(null);

function readStored(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readJson(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function WorkflowProvider({ children }) {
  const [validatedObjects, setValidatedObjectsState] = useState(() => readStored(OBJECTS_KEY, []));
  const [rules, setRulesState] = useState(() => readStored(RULES_KEY, []));
  const [preview, setPreviewState] = useState(() => readJson(PREVIEW_KEY, null));
  const [previewConfirmed, setPreviewConfirmed] = useState(() => sessionStorage.getItem(CONFIRMED_KEY) === 'true');
  const [confirmationTimestamp, setConfirmationTimestamp] = useState(() => sessionStorage.getItem(TIMESTAMP_KEY));

  useEffect(() => {
    sessionStorage.setItem(OBJECTS_KEY, JSON.stringify(validatedObjects));
  }, [validatedObjects]);

  useEffect(() => {
    sessionStorage.setItem(RULES_KEY, JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    if (preview) sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(preview));
    else sessionStorage.removeItem(PREVIEW_KEY);
  }, [preview]);

  useEffect(() => {
    sessionStorage.setItem(CONFIRMED_KEY, previewConfirmed ? 'true' : 'false');
    if (confirmationTimestamp) sessionStorage.setItem(TIMESTAMP_KEY, confirmationTimestamp);
    else sessionStorage.removeItem(TIMESTAMP_KEY);
  }, [previewConfirmed, confirmationTimestamp]);

  function clearConfirmation() {
    setPreviewConfirmed(false);
    setConfirmationTimestamp(null);
    setPreviewState(null);
  }

  const value = useMemo(
    () => ({
      validatedObjects,
      setValidatedObjects(next) {
        setValidatedObjectsState(next);
        clearConfirmation();
      },
      rules,
      setRules(next) {
        setRulesState(next);
        clearConfirmation();
      },
      saveRule(rule) {
        setRulesState((current) => {
          const next = current.filter((item) => item.name !== rule.name);
          return [...next, rule];
        });
        clearConfirmation();
      },
      removeRule(name) {
        setRulesState((current) => current.filter((item) => item.name !== name));
        clearConfirmation();
      },
      preview,
      setPreview(next) {
        setPreviewState(next);
        setPreviewConfirmed(false);
        setConfirmationTimestamp(null);
      },
      previewConfirmed,
      confirmationTimestamp,
      confirmPreview() {
        setPreviewConfirmed(true);
        setConfirmationTimestamp(new Date().toISOString());
      },
    }),
    [validatedObjects, rules, preview, previewConfirmed, confirmationTimestamp]
  );

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) throw new Error('useWorkflow must be used inside WorkflowProvider');
  return value;
}
