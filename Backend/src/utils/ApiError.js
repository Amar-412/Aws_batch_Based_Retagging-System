// ---------------------------------------------------------------------------
// Custom application error carrying an HTTP status code and a safe,
// client-facing message. Use this to throw controlled errors from anywhere
// in the app; the global error handler turns it into a consistent response.
// ---------------------------------------------------------------------------
export default class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status code (e.g. 400, 404, 500).
   * @param {string} message     Safe, human-readable message for the client.
   * @param {string|string[]|object} [details]  Optional extra detail (never include secrets).
   * @param {string} [code]      Optional machine-readable error code.
   */
  constructor(statusCode, message, details = undefined, code = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static notFound(message, details) {
    return new ApiError(404, message, details);
  }

  static internal(message = 'Internal server error', details) {
    return new ApiError(500, message, details);
  }
}
