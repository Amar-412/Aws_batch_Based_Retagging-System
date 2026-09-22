// ---------------------------------------------------------------------------
// Preview controller. Builds a read-only tag plan from objects and rules.
// ---------------------------------------------------------------------------
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { buildPreview } from '../services/preview.service.js';

export const createPreview = asyncHandler(async (req, res) => {
  const preview = buildPreview(req.body?.objects, req.body?.rules);
  return sendSuccess(res, preview);
});
