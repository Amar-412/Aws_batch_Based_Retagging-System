// ---------------------------------------------------------------------------
// Rule controller. Validates and evaluates JSON rules. No AWS calls.
// ---------------------------------------------------------------------------
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  assertEvaluationObjects,
  assertRules,
  evaluateBatch,
  generateTags,
  validateRule,
} from '../services/rule.service.js';

export const validateRuleRequest = asyncHandler(async (req, res) => {
  const result = validateRule(req.body?.rule);
  if (!result.valid) {
    throw new ApiError(400, 'Invalid rule', result.errors, 'INVALID_RULE');
  }
  return sendSuccess(res, { valid: true, errors: [] });
});

export const evaluateRuleRequest = asyncHandler(async (req, res) => {
  const rules = assertRules(req.body?.rules);
  const object = req.body?.object;
  if (!object || typeof object.bucket !== 'string' || typeof object.key !== 'string' || !object.bucket.trim() || !object.key.trim()) {
    throw new ApiError(400, 'Invalid object', ['Object must include bucket and key.'], 'INVALID_OBJECT');
  }
  return sendSuccess(res, generateTags(object, rules));
});

export const evaluateBatchRequest = asyncHandler(async (req, res) => {
  const rules = assertRules(req.body?.rules);
  const objects = assertEvaluationObjects(req.body?.objects);
  return sendSuccess(res, evaluateBatch(objects, rules));
});
