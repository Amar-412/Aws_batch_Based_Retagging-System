export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatTags(tags) {
  const entries = Object.entries(tags || {});
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

export function readError(err, fallback = 'Request failed.') {
  const data = err?.response?.data;
  if (!data) return { message: 'Could not reach the server. Check that the backend is running.', details: [] };
  const details = data.error?.details;
  return {
    message: data.message || fallback,
    details: Array.isArray(details) ? details : [],
  };
}

export function readErrorMessage(err, fallback = 'Request failed.') {
  const parsed = readError(err, fallback);
  return parsed.details.length ? `${parsed.message} ${parsed.details.join(' ')}` : parsed.message;
}

const STATUS_MAP = {
  new: ['NEW', 'warning'],
  active: ['ACTIVE', 'active'],
  complete: ['COMPLETE', 'success'],
  completed: ['COMPLETE', 'success'],
  failed: ['FAILED', 'failed'],
  failing: ['FAILED', 'failed'],
  cancelled: ['CANCELLED', 'cancelled'],
  canceled: ['CANCELLED', 'cancelled'],
  cancelling: ['CANCELLED', 'cancelled'],
  succeeded: ['SUCCESS', 'success'],
  success: ['SUCCESS', 'success'],
  matched: ['READY', 'success'],
  ready: ['READY', 'success'],
  unchanged: ['UNCHANGED', 'neutral'],
  conflict: ['CONFLICT', 'warning'],
  valid: ['VALID', 'success'],
  not_found: ['NOT FOUND', 'warning'],
  access_denied: ['ACCESS DENIED', 'failed'],
  error: ['ERROR', 'failed'],
  no_match: ['NO MATCH', 'neutral'],
  match: ['MATCH', 'success'],
};

export function statusPresentation(status) {
  const key = String(status || '').toLowerCase();
  const mapped = STATUS_MAP[key];
  if (mapped) return { label: mapped[0], tone: mapped[1] };
  return { label: status || 'UNKNOWN', tone: 'neutral' };
}

export function jobGroup(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'active') return 'active';
  if (key === 'complete') return 'success';
  if (key === 'failed' || key === 'failing') return 'failed';
  return 'other';
}
