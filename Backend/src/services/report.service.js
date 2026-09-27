// ---------------------------------------------------------------------------
// S3 Batch Operations completion reports.
// A finished job is not proof that every object was tagged. Task outcomes
// come from the completion report. Actual tags are read with GetObjectTagging.
// This module never writes object tags.
// ---------------------------------------------------------------------------
import { GetObjectCommand, GetObjectTaggingCommand } from '@aws-sdk/client-s3';

const DEFAULT_SCHEMA = ['Bucket', 'Key', 'VersionId', 'TaskStatus', 'ErrorCode', 'HTTPStatusCode', 'ResultMessage'];
const TAG_LOOKUP_CONCURRENCY = 5;

/**
 * Decode a Batch Operations object key. %20, %28, and %29 become space, (, and ).
 * A key that is not valid percent-encoding is returned unchanged.
 * @param {string} encoded
 */
export function decodeReportObjectKey(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) return '';
  try {
    return decodeURIComponent(encoded.replaceAll('+', ' '));
  } catch {
    return encoded;
  }
}

/**
 * Parse one CSV line, including quoted fields and doubled quotes.
 * @param {string} line
 */
export function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function schemaColumns(schema) {
  if (typeof schema !== 'string' || !schema.trim()) return DEFAULT_SCHEMA;
  const columns = schema.split(',').map((column) => column.trim()).filter(Boolean);
  return columns.length > 0 ? columns : DEFAULT_SCHEMA;
}

/**
 * Example reports put the HTTP status in the ErrorCode column and the error
 * code in the HTTPStatusCode column. Swap only when that pattern is present.
 */
function statusFields(row) {
  let httpStatusCode = (row.HTTPStatusCode || '').trim();
  let errorCode = (row.ErrorCode || '').trim();
  const errorLooksLikeHttp = /^\d{3}$/.test(errorCode);
  const httpLooksLikeHttp = /^\d{3}$/.test(httpStatusCode);

  if (errorLooksLikeHttp && !httpLooksLikeHttp) {
    const swapped = httpStatusCode;
    httpStatusCode = errorCode;
    errorCode = swapped;
  }

  return { httpStatusCode, errorCode };
}

function bucketName(value) {
  const text = (value || '').trim();
  const arn = /^arn:aws[a-zA-Z-]*:s3:::([^/]+)$/.exec(text);
  return arn ? arn[1] : text;
}

/**
 * Parse a completion-report CSV using the schema from manifest.json.
 * @param {string} csv
 * @param {string} [schema]
 */
export function parseReportCsv(csv, schema) {
  if (typeof csv !== 'string') {
    return { rows: [], malformed: true };
  }

  const columns = schemaColumns(schema);
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows = [];

  for (const line of lines) {
    const fields = parseCsvLine(line);
    if (fields.every((field) => field.trim() === '')) continue;

    const raw = {};
    columns.forEach((name, index) => {
      raw[name] = fields[index] ?? '';
    });

    const bucket = bucketName(raw.Bucket);
    const key = decodeReportObjectKey((raw.Key || '').trim());
    if (!bucket && !key) continue;

    const taskStatus = (raw.TaskStatus || '').trim().toLowerCase();
    const { httpStatusCode, errorCode } = statusFields(raw);
    rows.push({
      bucket,
      key,
      taskStatus: taskStatus || 'unknown',
      httpStatusCode,
      errorCode,
      resultMessage: (raw.ResultMessage || '').trim(),
    });
  }

  return { rows, malformed: false };
}

export function summarizeResults(results) {
  const succeeded = results.filter((row) => row.taskStatus === 'succeeded').length;
  const failed = results.filter((row) => row.taskStatus === 'failed').length;
  return {
    total: results.length,
    succeeded,
    failed,
    fromReport: true,
  };
}

export function resultsToCsv(results) {
  const header = 'bucket,key,taskStatus,httpStatusCode,errorCode,resultMessage';
  const lines = results.map((row) =>
    [row.bucket, row.key, row.taskStatus, row.httpStatusCode, row.errorCode, row.resultMessage]
      .map(csvField)
      .join(',')
  );
  return `${[header, ...lines].join('\n')}\n`;
}

function csvField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/**
 * Batch Operations writes the completion report at
 * `{Report.Prefix}/job-{jobId}/manifest.json`.
 * The prefix is copied exactly. `reports/` therefore becomes
 * `reports//job-{jobId}/manifest.json`. That double slash is the object key.
 */
function reportIndexKey(reportPrefix, jobId) {
  const prefix = typeof reportPrefix === 'string' ? reportPrefix : '';
  return `${prefix}/job-${jobId}/manifest.json`;
}

function isMissingObject(err) {
  const name = err?.name || err?.Code || '';
  return name === 'NotFound' || name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
}

async function readObjectText(s3Client, bucket, key) {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  return readBody(response?.Body);
}

async function readBody(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body.transformToString === 'function') return body.transformToString();
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return '';
}

function unavailable(message, extra = {}) {
  return {
    report: {
      available: false,
      malformed: Boolean(extra.malformed),
      manifestKey: extra.manifestKey || null,
      files: [],
      message,
    },
    results: [],
    resultSummary: { total: 0, succeeded: 0, failed: 0, fromReport: false },
  };
}

async function readActualTags(s3Client, bucket, key) {
  try {
    const response = await s3Client.send(
      new GetObjectTaggingCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const actualTags = {};
    for (const tag of response?.TagSet || []) {
      if (tag?.Key) actualTags[tag.Key] = tag.Value ?? '';
    }
    return { actualTags, actualTagsRetrieved: true, actualTagsMessage: null };
  } catch {
    return {
      actualTags: null,
      actualTagsRetrieved: false,
      actualTagsMessage: 'Actual S3 tags could not be retrieved.',
    };
  }
}

async function attachActualTags(rows, s3Client) {
  const successes = rows.filter((row) => row.taskStatus === 'succeeded' && row.bucket && row.key);
  const pending = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < successes.length) {
      const row = successes[cursor];
      cursor += 1;
      const id = `${row.bucket}/${row.key}`;
      if (!pending.has(id)) pending.set(id, readActualTags(s3Client, row.bucket, row.key));
      await pending.get(id);
    }
  }

  const workers = Math.min(TAG_LOOKUP_CONCURRENCY, successes.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return Promise.all(
    rows.map(async (row) => {
      if (row.taskStatus !== 'succeeded') {
        return { ...row, actualTags: null, actualTagsRetrieved: false, actualTagsMessage: null };
      }
      const tags = await pending.get(`${row.bucket}/${row.key}`);
      return { ...row, ...(tags || { actualTags: null, actualTagsRetrieved: false, actualTagsMessage: null }) };
    })
  );
}

/**
 * Load and parse the completion report for one job.
 * Missing or unreadable reports do not throw.
 * @param {{ s3Client: { send: Function }, bucket: string, reportPrefix: string, jobId: string, includeActualTags?: boolean }} input
 */
export async function loadCompletionReport(input) {
  const manifestKey = reportIndexKey(input.reportPrefix, input.jobId);
  let manifestText;

  try {
    manifestText = await readObjectText(input.s3Client, input.bucket, manifestKey);
  } catch (err) {
    if (isMissingObject(err)) {
      return unavailable('The completion report is not available yet.', { manifestKey });
    }
    return unavailable('The completion report could not be read.', { manifestKey });
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    return unavailable('The completion report could not be parsed.', { manifestKey, malformed: true });
  }

  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.Results)) {
    return unavailable('The completion report could not be parsed.', { manifestKey, malformed: true });
  }

  const files = [];
  const results = [];

  for (const entry of manifest.Results) {
    const key = typeof entry?.Key === 'string' ? entry.Key : '';
    if (!key) continue;
    files.push({
      key,
      taskExecutionStatus: entry.TaskExecutionStatus || null,
    });

    let csv;
    try {
      csv = await readObjectText(input.s3Client, input.bucket, key);
    } catch (err) {
      if (isMissingObject(err)) continue;
      return unavailable('The completion report could not be read.', { manifestKey });
    }

    const parsed = parseReportCsv(csv, manifest.ReportSchema);
    if (parsed.malformed) {
      return unavailable('The completion report could not be parsed.', { manifestKey, malformed: true });
    }
    results.push(...parsed.rows);
  }

  const withTags =
    input.includeActualTags === false ? results.map((row) => ({ ...row, actualTags: null, actualTagsRetrieved: false, actualTagsMessage: null })) : await attachActualTags(results, input.s3Client);

  return {
    report: {
      available: true,
      malformed: false,
      manifestKey,
      files,
      message: null,
    },
    results: withTags,
    resultSummary: summarizeResults(withTags),
  };
}
