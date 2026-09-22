// ---------------------------------------------------------------------------
// Wraps an async Express route/controller so that any rejected promise is
// forwarded to the global error handler instead of crashing the process.
// Usage: router.post('/x', asyncHandler(async (req, res) => { ... }))
// ---------------------------------------------------------------------------

/**
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} fn
 */
export default function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
