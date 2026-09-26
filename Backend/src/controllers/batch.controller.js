// ---------------------------------------------------------------------------
// Batch Operations controller. Validation and AWS calls stay in services.
// ---------------------------------------------------------------------------
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { createRetaggingWorkflow, getBatchJobStatus } from '../services/batch-job.service.js';

export const createBatchJobs = asyncHandler(async (req, res) => {
  const result = await createRetaggingWorkflow(req.body);
  return sendSuccess(res, result);
});

export const getBatchJob = asyncHandler(async (req, res) => {
  const result = await getBatchJobStatus(req.params.jobId);
  return sendSuccess(res, result);
});
