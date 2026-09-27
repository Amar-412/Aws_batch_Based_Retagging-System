// ---------------------------------------------------------------------------
// Batch Operations controller. Validation and AWS calls stay in services.
// ---------------------------------------------------------------------------
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { createRetaggingWorkflow, getBatchJobReportCsv, getBatchJobStatus } from '../services/batch-job.service.js';
import { listJobHistory } from '../services/job.service.js';

export const listBatchJobs = asyncHandler(async (req, res) => {
  const result = await listJobHistory(req.query);
  return sendSuccess(res, result);
});

export const createBatchJobs = asyncHandler(async (req, res) => {
  const result = await createRetaggingWorkflow(req.body);
  return sendSuccess(res, result);
});

export const getBatchJob = asyncHandler(async (req, res) => {
  const result = await getBatchJobStatus(req.params.jobId);
  return sendSuccess(res, result);
});

export const downloadBatchReport = asyncHandler(async (req, res) => {
  const report = await getBatchJobReportCsv(req.params.jobId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  return res.status(200).send(report.csv);
});
