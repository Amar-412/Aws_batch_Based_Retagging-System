// ---------------------------------------------------------------------------
// Map AWS SDK errors to safe API errors. Never forward credentials or raw
// request payloads.
// ---------------------------------------------------------------------------
import ApiError from './ApiError.js';

/**
 * @param {unknown} err
 * @param {{ statusCode: number, message: string, code: string }} fallback
 */
export function toAwsApiError(err, fallback) {
  const name = err?.name || err?.Code || '';
  const http = err?.$metadata?.httpStatusCode;

  if (name === 'AccessDenied' || name === 'AccessDeniedException' || http === 403) {
    return new ApiError(403, 'AWS permission denied for the requested operation.', undefined, 'AWS_ACCESS_DENIED');
  }

  if (name === 'NoSuchBucket') {
    return new ApiError(400, 'The configured S3 bucket does not exist.', undefined, 'BUCKET_NOT_FOUND');
  }

  if (name === 'NoSuchJob' || name === 'NotFoundException') {
    return new ApiError(404, 'Job not found.', undefined, 'JOB_NOT_FOUND');
  }

  if (
    name === 'InvalidRequest' ||
    name === 'InvalidRequestException' ||
    name === 'BadRequest' ||
    name === 'ValidationException'
  ) {
    return new ApiError(400, 'The Batch Operations request was rejected.', undefined, 'INVALID_BATCH_REQUEST');
  }

  return new ApiError(fallback.statusCode, fallback.message, undefined, fallback.code);
}
