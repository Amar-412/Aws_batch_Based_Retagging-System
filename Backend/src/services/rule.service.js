// ---------------------------------------------------------------------------
// Rule engine. Evaluates plain JSON rules against object metadata.
// It does not call AWS and does not change objects or tags.
// ---------------------------------------------------------------------------
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { validateRule } from '../utils/ruleValidator.js';

export { validateRule };

const STRING_FIELDS = new Set(['key', 'extension', 'bucket']);

/**
 * Derive a file extension from an object key. Includes the leading dot.
 * README and names like ".gitignore" have no extension.
 * @param {string} key
 */
export function extensionFromKey(key) {
  const base = String(key ?? '').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot);
}

/**
 * @param {object} object
 */
export function normalizeObject(object) {
  const key = String(object?.key ?? '');
  const size = object?.size;
  const numericSize = size === undefined || size === null || size === '' ? undefined : Number(size);

  return {
    bucket: String(object?.bucket ?? ''),
    key,
    size: Number.isFinite(numericSize) ? numericSize : undefined,
    contentType: object?.contentType,
    lastModified: object?.lastModified,
    extension: extensionFromKey(key),
  };
}

/**
 * @param {object} object
 * @param {{ field: string, operator: string, value: string|number }} condition
 */
export function evaluateCondition(object, condition) {
  const normalized = normalizeObject(object);
  const actual = normalized[condition.field];
  const expected = condition.value;

  if (condition.field === 'size') return compareNumber(actual, condition.operator, expected);
  if (condition.field === 'lastModified') return compareDate(actual, condition.operator, expected);
  if (!STRING_FIELDS.has(condition.field)) return false;
  return compareString(actual, condition.operator, expected);
}

/**
 * @param {object} object
 * @param {object} rule
 */
export function evaluateRule(object, rule) {
  const checks = (rule.conditions ?? []).map((condition) => evaluateCondition(object, condition));
  if (checks.length === 0) return false;
  return rule.logic === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
}

/**
 * @param {object} object
 * @param {object[]} rules
 */
export function evaluateRules(object, rules) {
  return rules.filter((rule) => evaluateRule(object, rule));
}

/**
 * Apply every matching rule. Conflicting tag values are reported and not assigned.
 * @param {object} object
 * @param {object[]} rules
 */
export function generateTags(object, rules) {
  const matched = evaluateRules(object, rules);
  const grouped = new Map();

  for (const rule of matched) {
    for (const action of rule.actions ?? []) {
      if (action.type !== 'SET_TAG') continue;
      const current = grouped.get(action.key) ?? { values: [], rules: [] };
      if (!current.values.includes(action.value)) current.values.push(action.value);
      if (!current.rules.includes(rule.name)) current.rules.push(rule.name);
      grouped.set(action.key, current);
    }
  }

  const tags = {};
  const conflicts = [];

  for (const [tag, entry] of grouped) {
    if (entry.values.length === 1) {
      tags[tag] = entry.values[0];
    } else {
      conflicts.push({ tag, values: entry.values, rules: entry.rules });
    }
  }

  let status = 'NO_MATCH';
  if (matched.length > 0) status = conflicts.length > 0 ? 'CONFLICT' : 'MATCH';

  return {
    matchedRules: matched.map((rule) => rule.name),
    tags,
    conflicts,
    status,
  };
}

/**
 * Validate every rule and return the normalized copies.
 * @param {unknown} rules
 */
export function assertRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new ApiError(400, 'Invalid rule', ['At least one rule is required.'], 'INVALID_RULE');
  }

  const errors = [];
  const normalized = [];

  rules.forEach((rule, index) => {
    const result = validateRule(rule);
    if (!result.valid) {
      const label = typeof rule?.name === 'string' && rule.name.trim() ? rule.name.trim() : `Rule ${index + 1}`;
      errors.push(...result.errors.map((error) => `${label}: ${error}`));
    } else {
      normalized.push(result.rule);
    }
  });

  if (errors.length > 0) {
    throw new ApiError(400, 'Invalid rule', errors.slice(0, 25), 'INVALID_RULE');
  }

  return normalized;
}

/**
 * @param {unknown} objects
 */
export function assertEvaluationObjects(objects) {
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new ApiError(400, 'Invalid object list', undefined, 'INVALID_OBJECTS');
  }

  if (objects.length > env.maxCsvObjects) {
    throw new ApiError(
      400,
      `Object list exceeds the maximum of ${env.maxCsvObjects} objects.`,
      [`Found ${objects.length} objects; the limit is ${env.maxCsvObjects}.`],
      'CSV_OBJECT_LIMIT'
    );
  }

  return objects.map((object, index) => {
    const row = index + 1;
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      throw new ApiError(400, 'Invalid object list', [`Object ${row} must include bucket and key.`], 'INVALID_OBJECTS');
    }
    if (typeof object.bucket !== 'string' || typeof object.key !== 'string') {
      throw new ApiError(
        400,
        'Invalid object list',
        [`Object ${row} must include string bucket and key values.`],
        'INVALID_OBJECTS'
      );
    }
    const bucket = object.bucket.trim();
    const key = object.key.trim();
    if (!bucket || !key) {
      throw new ApiError(400, 'Invalid object list', [`Object ${row} is missing a bucket or key.`], 'INVALID_OBJECTS');
    }
    return {
      bucket,
      key,
      size: object.size,
      contentType: object.contentType,
      lastModified: object.lastModified,
    };
  });
}

/**
 * @param {object[]} objects
 * @param {object[]} rules
 */
export function evaluateBatch(objects, rules) {
  const results = objects.map((object) => {
    const outcome = generateTags(object, rules);
    return {
      bucket: object.bucket,
      key: object.key,
      ...outcome,
    };
  });

  const conflicts = results.filter((result) => result.status === 'CONFLICT').length;
  const matched = results.filter((result) => result.status === 'MATCH').length;
  const unmatched = results.filter((result) => result.status === 'NO_MATCH').length;

  return {
    total: results.length,
    matched,
    unmatched,
    conflicts,
    results,
  };
}

function compareString(actual, operator, expected) {
  const left = String(actual ?? '');
  const right = String(expected ?? '');
  switch (operator) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'starts_with':
      return left.startsWith(right);
    case 'ends_with':
      return left.endsWith(right);
    default:
      return false;
  }
}

function compareNumber(actual, operator, expected) {
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (operator) {
    case 'equals':
      return left === right;
    case 'not_equals':
      return left !== right;
    case 'greater_than':
      return left > right;
    case 'less_than':
      return left < right;
    default:
      return false;
  }
}

function compareDate(actual, operator, expected) {
  const left = new Date(actual).getTime();
  const right = new Date(expected).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  if (operator === 'before') return left < right;
  if (operator === 'after') return left > right;
  return false;
}
