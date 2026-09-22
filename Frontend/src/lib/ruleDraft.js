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
