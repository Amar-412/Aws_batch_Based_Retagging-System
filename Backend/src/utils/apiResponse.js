// ---------------------------------------------------------------------------
// Helpers for the standardized API response envelope used across all routes.
//
//   Success: { "success": true, "data": {...} }
//   Error:   { "success": false, "message": "...", "error": "..." }
// ---------------------------------------------------------------------------

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {*} data              Payload placed under "data".
 * @param {number} [statusCode] HTTP status (default 200).
 */
export function sendSuccess(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message   Safe, client-facing summary.
 * @param {string} [error]   Optional extra (non-sensitive) detail.
 */
export function sendError(res, statusCode, message, error = undefined) {
  const body = { success: false, message };
  if (error) body.error = error;
  return res.status(statusCode).json(body);
}
