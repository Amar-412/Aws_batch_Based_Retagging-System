// ---------------------------------------------------------------------------
// Rule validation. Rules are data only. This module never evaluates them and
// never talks to AWS.
// ---------------------------------------------------------------------------

const FIELD_OPERATORS = {
  key: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with'],
  extension: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with'],
  bucket: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with'],
  size: ['equals', 'not_equals', 'greater_than', 'less_than'],
  lastModified: ['before', 'after'],
};

const TAG_PATTERN = /^[\p{L}\p{N} +\-.=_:/@]+$/u;
const MAX_TAG_KEY = 128;
const MAX_TAG_VALUE = 256;
const MAX_TAGS = 10;
const MAX_NAME = 128;

/**
 * Validate one rule and return a trimmed copy when it is valid.
 * @param {unknown} rule
 * @returns {{ valid: boolean, errors: string[], rule?: object }}
 */
export function validateRule(rule) {
  const errors = [];

  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { valid: false, errors: ['Rule must be an object.'] };
  }

  const name = typeof rule.name === 'string' ? rule.name.trim() : '';
  if (!name) errors.push('Rule name is required.');
  else if (name.length > MAX_NAME) errors.push(`Rule name must be ${MAX_NAME} characters or fewer.`);

  if (rule.logic !== 'AND' && rule.logic !== 'OR') {
    errors.push('Rule logic must be AND or OR.');
  }

  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    errors.push('At least one condition is required.');
  } else {
    rule.conditions.forEach((condition, index) => {
      errors.push(...validateCondition(condition, index + 1));
    });
  }

  if (!Array.isArray(rule.actions) || rule.actions.length === 0) {
    errors.push('At least one tag action is required.');
  } else if (rule.actions.length > MAX_TAGS) {
    errors.push(`A rule can set at most ${MAX_TAGS} tags.`);
  } else {
    const seen = new Set();
    rule.actions.forEach((action, index) => {
      const tagError = validateAction(action, index + 1);
      errors.push(...tagError.errors);
      if (tagError.key) {
        if (seen.has(tagError.key)) errors.push(`Tag ${index + 1} repeats the key "${tagError.key}".`);
        seen.add(tagError.key);
      }
    });
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    rule: {
      name,
      logic: rule.logic,
      conditions: rule.conditions.map(normalizeCondition),
      actions: rule.actions.map(normalizeAction),
    },
  };
}

function validateCondition(condition, index) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return [`Condition ${index} is empty.`];
  }

  const errors = [];
  const field = typeof condition.field === 'string' ? condition.field.trim() : '';
  const operator = typeof condition.operator === 'string' ? condition.operator.trim() : '';
  const operators = FIELD_OPERATORS[field];

  if (!operators) {
    errors.push(`Condition ${index} uses an unsupported field.`);
    return errors;
  }

  if (!operators.includes(operator)) {
    errors.push(`Condition ${index} uses an unsupported operator for ${field}.`);
  }

  if (typeof condition.value !== 'string' && typeof condition.value !== 'number') {
    errors.push(`Condition ${index} is missing a value.`);
    return errors;
  }

  const value = String(condition.value).trim();
  if (!value) {
    errors.push(`Condition ${index} is missing a value.`);
    return errors;
  }

  if (field === 'size' && !Number.isFinite(Number(value))) {
    errors.push(`Condition ${index} size must be a number.`);
  }

  if (field === 'lastModified' && Number.isNaN(new Date(value).getTime())) {
    errors.push(`Condition ${index} date is not valid.`);
  }

  return errors;
}

function validateAction(action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return { errors: [`Tag ${index} is empty.`] };
  }

  if (action.type !== 'SET_TAG') {
    return { errors: [`Tag ${index} must use the SET_TAG action.`] };
  }

  const key = typeof action.key === 'string' ? action.key.trim() : '';
  const value = typeof action.value === 'string' ? action.value.trim() : '';
  const errors = [];

  if (!key) errors.push(`Tag ${index} key is empty.`);
  else errors.push(...tagProblems(`Tag ${index} key`, key, MAX_TAG_KEY));

  if (!value) errors.push(`Tag ${index} value is empty.`);
  else errors.push(...tagProblems(`Tag ${index} value`, value, MAX_TAG_VALUE));

  if (key && /^aws:/i.test(key)) {
    errors.push(`Tag ${index} key cannot start with "aws:".`);
  }

  return { errors, key: key || undefined };
}

function tagProblems(label, value, max) {
  const errors = [];
  if (value.length > max) errors.push(`${label} is longer than ${max} characters.`);
  if (!TAG_PATTERN.test(value)) {
    errors.push(
      `${label} contains characters S3 does not allow. Use letters, numbers, spaces, and + - = . _ : / @.`
    );
  }
  return errors;
}

function normalizeCondition(condition) {
  const field = condition.field.trim();
  const value = String(condition.value).trim();
  return {
    field,
    operator: condition.operator.trim(),
    value: field === 'size' ? Number(value) : field === 'lastModified' ? new Date(value).toISOString() : value,
  };
}

function normalizeAction(action) {
  return {
    type: 'SET_TAG',
    key: action.key.trim(),
    value: action.value.trim(),
  };
}

export { FIELD_OPERATORS };
