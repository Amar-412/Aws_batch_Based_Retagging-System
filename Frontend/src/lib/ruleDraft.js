export const FIELDS = [
  { id: 'key', label: 'Object Key', kind: 'string' },
  { id: 'extension', label: 'Extension', kind: 'string' },
  { id: 'bucket', label: 'Bucket', kind: 'string' },
  { id: 'size', label: 'Size', kind: 'number' },
  { id: 'lastModified', label: 'Last Modified', kind: 'date' },
];

export const OPERATORS = {
  string: [
    { id: 'equals', label: 'equals' },
    { id: 'not_equals', label: 'not equals' },
    { id: 'contains', label: 'contains' },
    { id: 'starts_with', label: 'starts with' },
    { id: 'ends_with', label: 'ends with' },
  ],
  number: [
    { id: 'equals', label: 'equals' },
    { id: 'not_equals', label: 'not equals' },
    { id: 'greater_than', label: 'greater than' },
    { id: 'less_than', label: 'less than' },
  ],
  date: [
    { id: 'before', label: 'before' },
    { id: 'after', label: 'after' },
  ],
};

export function fieldKind(field) {
  return FIELDS.find((item) => item.id === field)?.kind ?? 'string';
}

export function operatorsFor(field) {
  return OPERATORS[fieldKind(field)];
}

export function emptyCondition() {
  return { id: crypto.randomUUID(), field: 'key', operator: 'contains', value: '' };
}

export function emptyAction() {
  return { id: crypto.randomUUID(), key: '', value: '' };
}

export function emptyDraft() {
  return {
    name: '',
    logic: 'AND',
    conditions: [emptyCondition()],
    actions: [emptyAction()],
  };
}

function conditionValue(condition) {
  if (condition.field === 'size') {
    const raw = String(condition.value).trim();
    if (!raw) return '';
    return Number(raw);
  }
  if (condition.field === 'lastModified') {
    const date = new Date(condition.value);
    return Number.isNaN(date.getTime()) ? String(condition.value).trim() : date.toISOString();
  }
  return String(condition.value).trim();
}

export function toRule(draft) {
  return {
    name: draft.name.trim(),
    logic: draft.logic,
    conditions: draft.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: conditionValue(condition),
    })),
    actions: draft.actions.map((action) => ({
      type: 'SET_TAG',
      key: action.key.trim(),
      value: action.value.trim(),
    })),
  };
}

function dateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Turn a stored rule into the visual builder draft.
 * Returns ok: false when the JSON shape cannot be shown without dropping the current draft.
 */
export function draftFromRule(rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { ok: false, message: 'Rule JSON must be an object using name, logic, conditions, and actions.' };
  }
  if (rule.conditions !== undefined && !Array.isArray(rule.conditions)) {
    return { ok: false, message: 'conditions must be an array of { field, operator, value }.' };
  }
  if (rule.actions !== undefined && !Array.isArray(rule.actions)) {
    return { ok: false, message: 'actions must be an array of { type, key, value }.' };
  }
  if (rule.logic !== undefined && rule.logic !== 'AND' && rule.logic !== 'OR') {
    return { ok: false, message: 'logic must be AND or OR.' };
  }

  const conditions = (rule.conditions || []).map((condition) => ({
    id: crypto.randomUUID(),
    field: typeof condition?.field === 'string' && condition.field.trim() ? condition.field.trim() : 'key',
    operator: typeof condition?.operator === 'string' && condition.operator.trim() ? condition.operator.trim() : 'contains',
    value:
      condition?.field === 'lastModified' && condition?.value
        ? dateTimeLocalValue(condition.value)
        : condition?.value ?? '',
  }));
  const actions = (rule.actions || []).map((action) => ({
    id: crypto.randomUUID(),
    key: typeof action?.key === 'string' ? action.key : '',
    value: typeof action?.value === 'string' ? action.value : '',
  }));

  return {
    ok: true,
    draft: {
      name: typeof rule.name === 'string' ? rule.name : '',
      logic: rule.logic === 'OR' ? 'OR' : 'AND',
      conditions: conditions.length ? conditions : [emptyCondition()],
      actions: actions.length ? actions : [emptyAction()],
    },
  };
}

export function parseRuleJson(text) {
  try {
    return { ok: true, rule: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      message: 'JSON could not be parsed. Check commas, quotes, and brackets before switching or saving.',
    };
  }
}
