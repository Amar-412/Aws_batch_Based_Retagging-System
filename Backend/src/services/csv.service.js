// ---------------------------------------------------------------------------
// CSV parsing and validation for S3 object references.
// This service does not talk to AWS. It only reads the temporary upload and
// returns a normalized object list.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const REQUIRED_COLUMNS = ['bucket', 'key'];

/**
 * @param {string} filePath
 * @returns {Promise<{ headers: string[], rows: Record<string, string>[] }>}
 */
export function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let headers = [];
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const parser = csvParser({
      mapHeaders: ({ header }) =>
        String(header ?? '')
          .replace(/^\uFEFF/, '')
          .trim()
          .toLowerCase(),
      mapValues: ({ value }) => (typeof value === 'string' ? value.trim() : value),
      strict: false,
    });

    const stream = fs.createReadStream(filePath);

    stream.on('error', () => {
      stream.destroy();
      fail(
        new ApiError(
          400,
          'Could not read the uploaded CSV file.',
          ['The file could not be read as CSV.'],
          'INVALID_CSV'
        )
      );
    });

    parser.on('headers', (parsedHeaders) => {
      headers = parsedHeaders.filter((header) => header !== null && header !== undefined);
    });

    parser.on('data', (row) => {
      rows.push(row);
    });

    parser.on('error', (err) => {
      stream.destroy();
      const detail = err?.message || 'The CSV file is malformed.';
      fail(new ApiError(400, 'CSV validation failed', [detail], 'INVALID_CSV'));
    });

    parser.on('end', () => {
      if (settled) return;
      settled = true;
      resolve({ headers, rows });
    });

    stream.pipe(parser);
  });
}

/**
 * @param {string[]} headers
 * @returns {{ valid: boolean, missing: string[], unexpected: string[] }}
 */
export function validateHeaders(headers) {
  const normalized = (headers || [])
    .map((header) => String(header ?? '').trim().toLowerCase())
    .filter(Boolean);

  const missing = REQUIRED_COLUMNS.filter((column) => !normalized.includes(column)).map(
    (column) => `Missing required column: ${column}`
  );

  const unexpected = [...new Set(normalized.filter((header) => !REQUIRED_COLUMNS.includes(header)))];

  return { valid: missing.length === 0, missing, unexpected };
}

/**
 * Spreadsheet line number: header is line 1, first data row is line 2.
 * @param {Record<string, string>[]} rows
 * @returns {string[]}
 */
export function validateRows(rows) {
  const errors = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const bucket = String(row.bucket ?? '').trim();
    const key = String(row.key ?? '').trim();
    const values = Object.values(row).map((value) => String(value ?? '').trim());
    const completelyEmpty = values.every((value) => value === '');

    if (completelyEmpty) {
      errors.push(`Row ${line} is empty`);
      return;
    }

    if (!bucket) errors.push(`Row ${line} has an empty bucket`);
    else if (hasControlChars(bucket) || bucket.length > 255) {
      errors.push(`Row ${line} has an invalid bucket`);
    }

    if (!key) errors.push(`Row ${line} has an empty key`);
    else if (hasControlChars(key) || key.length > 1024) {
      errors.push(`Row ${line} has an invalid key`);
    }
  });

  return errors;
}

/**
 * @param {Record<string, string>[]} rows
 * @returns {{ bucket: string, key: string }[]}
 */
export function normalizeRows(rows) {
  return rows.map((row) => ({
    bucket: String(row.bucket ?? '').trim(),
    key: String(row.key ?? '').trim(),
  }));
}

/**
 * Collapse repeated bucket+key pairs. The first occurrence is kept.
 * Later copies are returned in `duplicates` and are not repeated in `objects`.
 * @param {{ bucket: string, key: string }[]} objects
 */
export function detectDuplicates(objects) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  for (const object of objects) {
    const id = `${object.bucket}\u0000${object.key}`;
    if (seen.has(id)) {
      duplicates.push({ bucket: object.bucket, key: object.key });
    } else {
      seen.add(id);
      unique.push(object);
    }
  }

  return { objects: unique, duplicates };
}

/**
 * Parse, validate, and normalize an uploaded CSV.
 * Throws ApiError for every rejected file. Does not call AWS.
 *
 * @param {{ filePath: string, originalName?: string, uploadId: string, size?: number }} file
 */
export async function parseAndValidateCsv(file) {
  if (!file?.size) {
    throw new ApiError(400, 'CSV contains no objects', undefined, 'EMPTY_CSV');
  }

  assertTextCsv(file.filePath);

  let parsed;
  try {
    parsed = await parseCsvFile(file.filePath);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      400,
      'CSV validation failed',
      ['The CSV file is malformed.'],
      'INVALID_CSV'
    );
  }

  const headerCheck = validateHeaders(parsed.headers);
  if (!headerCheck.valid) {
    throw new ApiError(400, 'CSV validation failed', headerCheck.missing, 'INVALID_CSV');
  }

  if (parsed.rows.length === 0) {
    throw new ApiError(400, 'CSV contains no objects', undefined, 'EMPTY_CSV');
  }

  if (parsed.rows.length > env.maxCsvObjects) {
    throw new ApiError(
      400,
      `CSV exceeds the maximum of ${env.maxCsvObjects} objects.`,
      [`Found ${parsed.rows.length} objects; the limit is ${env.maxCsvObjects}.`],
      'CSV_OBJECT_LIMIT'
    );
  }

  const rowErrors = validateRows(parsed.rows);
  if (rowErrors.length > 0) {
    const details = rowErrors.slice(0, 25);
    if (rowErrors.length > details.length) {
      details.push(`${rowErrors.length - details.length} additional row error(s) omitted.`);
    }
    throw new ApiError(400, 'CSV validation failed', details, 'INVALID_CSV');
  }

  const normalized = normalizeRows(parsed.rows);
  const { objects, duplicates } = detectDuplicates(normalized);

  const warnings = [];
  if (headerCheck.unexpected.length > 0) {
    warnings.push(`Ignored unexpected columns: ${headerCheck.unexpected.join(', ')}`);
  }

  return {
    uploadId: file.uploadId,
    filename: displayFilename(file.originalName),
    objectCount: objects.length,
    objects,
    duplicates,
    warnings,
  };
}

function displayFilename(originalName) {
  const base = path.basename(originalName || 'objects.csv').replace(/[\r\n\0]/g, '');
  return base || 'objects.csv';
}

function hasControlChars(value) {
  return /[\u0000-\u001F\u007F]/.test(value);
}

/**
 * Reject files that passed the extension check but are clearly not text.
 * Reads only a small prefix; it does not load the whole file.
 */
function assertTextCsv(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const sample = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, sample, 0, sample.length, 0);
    if (bytesRead === 0) {
      throw new ApiError(400, 'CSV contains no objects', undefined, 'EMPTY_CSV');
    }
    if (sample.subarray(0, bytesRead).includes(0)) {
      throw new ApiError(
        400,
        'Only CSV files are accepted.',
        ['The uploaded file is not a CSV text file.'],
        'INVALID_FILE_TYPE'
      );
    }
  } finally {
    fs.closeSync(fd);
  }
}
