// ---------------------------------------------------------------------------
// Global error-handling middleware and 404 handler.
// Produces the standardized error envelope and NEVER leaks AWS credentials or
// raw internal stack traces to the client.
// ---------------------------------------------------------------------------
import ApiError from '../utils/ApiError.js';
import { sendError } from '../utils/apiResponse.js';
import env from '../config/env.js';
import { removeUploadedFile } from '../utils/uploads.js';

/**
 * Map common AWS SDK / infrastructure errors to safe client responses.
 * Returns { statusCode, message } or null if not recognized.
 */
function mapAwsError(err) {
  const name = err?.name || err?.Code || '';
  const http = err?.$metadata?.httpStatusCode;

  switch (name) {
    case 'CredentialsProviderError':
    case 'UnrecognizedClientException':
    case 'InvalidAccessKeyId':
    case 'SignatureDoesNotMatch':
      return { statusCode: 401, message: 'AWS authentication failed. Check server credentials.' };
    case 'AccessDenied':
    case 'AccessDeniedException':
      return { statusCode: 403, message: 'AWS permission denied for the requested operation.' };
    case 'NoSuchBucket':
      return { statusCode: 404, message: 'The configured S3 bucket does not exist.' };
    case 'NoSuchKey':
    case 'NotFound':
      return { statusCode: 404, message: 'The requested S3 object was not found.' };
    default:
      break;
  }

  // Fall back to the AWS-provided HTTP status when present.
  if (typeof http === 'number' && http >= 400) {
    return { statusCode: http, message: 'An AWS service error occurred.' };
  }
  return null;
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req, res) {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

/**
 * Central error handler. Must have the 4-argument signature to be recognized
 * by Express as error middleware.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log full details server-side only.
  // eslint-disable-next-line no-console
  console.error('[error]', err);

  // A failed upload must not leave the temporary CSV on disk.
  if (req.file?.path) {
    removeUploadedFile(req.file.path);
  }

  // 1) Our own controlled errors.
  if (err instanceof ApiError) {
    const payload = err.code
      ? {
          code: err.code,
          ...(err.details !== undefined ? { details: err.details } : {}),
        }
      : err.details;
    return sendError(res, err.statusCode, err.message, payload);
  }

  // 2) Multer upload errors (file too large, unexpected field, etc.).
  if (err?.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Uploaded file exceeds the maximum allowed size (${env.maxUploadSizeMb} MB).`
        : `File upload error: ${err.message}`;
    return sendError(res, 400, message, err.code);
  }

  // 3) Recognized AWS errors.
  const mapped = mapAwsError(err);
  if (mapped) {
    return sendError(res, mapped.statusCode, mapped.message);
  }

  // 4) Anything else -> generic 500 (no internal details leaked in prod).
  const isDev = env.nodeEnv !== 'production';
  return sendError(
    res,
    500,
    'Internal server error',
    isDev ? err?.message : undefined
  );
}
