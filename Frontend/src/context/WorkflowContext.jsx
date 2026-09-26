import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const OBJECTS_KEY = 'retag.validatedObjects';
const RULES_KEY = 'retag.rules';
const PREVIEW_KEY = 'retag.preview';
const CONFIRMED_KEY = 'retag.previewConfirmed';
const TIMESTAMP_KEY = 'retag.confirmationTimestamp';
const WORKFLOW_KEY = 'retag.workflowId';
const JOBS_KEY = 'retag.batchJobs';

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
  const [workflowId, setWorkflowIdState] = useState(() => sessionStorage.getItem(WORKFLOW_KEY) || '');
  const [batchJobs, setBatchJobsState] = useState(() => readJson(JOBS_KEY, null));

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

  useEffect(() => {
    if (workflowId) sessionStorage.setItem(WORKFLOW_KEY, workflowId);
    else sessionStorage.removeItem(WORKFLOW_KEY);
  }, [workflowId]);

  useEffect(() => {
    if (batchJobs) sessionStorage.setItem(JOBS_KEY, JSON.stringify(batchJobs));
    else sessionStorage.removeItem(JOBS_KEY);
  }, [batchJobs]);

  function clearJobPlan() {
    setPreviewConfirmed(false);
    setConfirmationTimestamp(null);
    setPreviewState(null);
    setWorkflowIdState('');
    setBatchJobsState(null);
  }

  const value = useMemo(
    () => ({
      validatedObjects,
      setValidatedObjects(next) {
        setValidatedObjectsState(next);
        clearJobPlan();
      },
      rules,
      setRules(next) {
        setRulesState(next);
        clearJobPlan();
      },
      saveRule(rule) {
        setRulesState((current) => {
          const next = current.filter((item) => item.name !== rule.name);
          return [...next, rule];
        });
        clearJobPlan();
      },
      removeRule(name) {
        setRulesState((current) => current.filter((item) => item.name !== name));
        clearJobPlan();
      },
      preview,
      setPreview(next) {
        setPreviewState(next);
        setPreviewConfirmed(false);
        setConfirmationTimestamp(null);
        setWorkflowIdState('');
        setBatchJobsState(null);
      },
      previewConfirmed,
      confirmationTimestamp,
      workflowId,
      batchJobs,
      setBatchJobs: setBatchJobsState,
      confirmPreview() {
        setPreviewConfirmed(true);
        setConfirmationTimestamp(new Date().toISOString());
        setWorkflowIdState((current) => current || crypto.randomUUID());
      },
    }),
    [validatedObjects, rules, preview, previewConfirmed, confirmationTimestamp, workflowId, batchJobs]
  );

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) throw new Error('useWorkflow must be used inside WorkflowProvider');
  return value;
}
