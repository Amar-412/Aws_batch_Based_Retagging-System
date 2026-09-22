// ---------------------------------------------------------------------------
// CSV upload controller. Verifies the multipart file and delegates parsing
// to csv.service. No AWS calls happen here.
// ---------------------------------------------------------------------------
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { parseAndValidateCsv } from '../services/csv.service.js';

export const uploadCsv = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(
      400,
      'No CSV file was uploaded. Send the file in the "file" field.',
      undefined,
      'MISSING_FILE'
    );
  }

  const result = await parseAndValidateCsv({
    filePath: req.file.path,
    originalName: req.file.originalname,
    uploadId: req.uploadId,
    size: req.file.size,
  });

  return sendSuccess(res, result);
});
