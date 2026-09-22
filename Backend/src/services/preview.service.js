// ---------------------------------------------------------------------------
// Read-only retagging preview.
// Reuses the rule engine. Does not call AWS, read object bytes, or apply tags.
// An empty currentTags list means tags were not retrieved, not that none exist.
// ---------------------------------------------------------------------------
import ApiError from '../utils/ApiError.js';
import { assertEvaluationObjects, assertRules, generateTags } from './rule.service.js';

export const CURRENT_TAGS_NOTE =
  'Current tags were not retrieved. An empty list does not mean the object has no tags.';

/**
 * @param {unknown} objects
 * @param {unknown} rules
 */
export function buildPreview(objects, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new ApiError(400, 'At least one rule is required.', undefined, 'INVALID_RULES');
  }

  const normalizedRules = assertRules(rules);
  const normalizedObjects = assertEvaluationObjects(objects);

  const previewObjects = normalizedObjects.map((object) => toPreviewObject(object, normalizedRules));

  const matchedObjects = previewObjects.filter((object) => object.status === 'MATCHED').length;
  const unchangedObjects = previewObjects.filter((object) => object.status === 'UNCHANGED').length;
  const conflictedObjects = previewObjects.filter((object) => object.status === 'CONFLICT').length;
  const totalTagsToApply = previewObjects.reduce(
    (count, object) => count + Object.keys(object.proposedTags).length,
    0
  );

  return {
    currentTagsRetrieved: false,
    currentTagsNote: CURRENT_TAGS_NOTE,
    summary: {
      totalObjects: previewObjects.length,
      matchedObjects,
      unchangedObjects,
      conflictedObjects,
      totalTagsToApply,
    },
    objects: previewObjects,
  };
}

function toPreviewObject(object, rules) {
  const outcome = generateTags(object, rules);

  return {
    bucket: object.bucket,
    key: object.key,
    currentTags: [],
    currentTagsRetrieved: false,
    matchedRules: outcome.matchedRules,
    proposedTags: outcome.tags,
    conflicts: outcome.conflicts.map((conflict) => ({
      key: conflict.tag,
      values: conflict.values,
    })),
    status: previewStatus(outcome.status),
  };
}

function previewStatus(ruleStatus) {
  if (ruleStatus === 'CONFLICT') return 'CONFLICT';
  if (ruleStatus === 'MATCH') return 'MATCHED';
  return 'UNCHANGED';
}
