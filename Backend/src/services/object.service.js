// ---------------------------------------------------------------------------
// Read-only S3 object validation.
// Uses HeadObject only. This service never downloads, uploads, deletes,
// copies, or retags objects, and it never creates a Batch Operations job.
// ---------------------------------------------------------------------------
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import env from '../config/env.js';
import { getS3Client } from '../config/aws.js';
import ApiError from '../utils/ApiError.js';

/** How many HeadObject calls may run at once. */
export const HEAD_OBJECT_CONCURRENCY = 5;

/**
 * Validate the request body before any AWS call.
 * @param {unknown} objects
 * @returns {{ bucket: string, key: string }[]}
 */
export function prepareObjectList(objects) {
  if (!Array.isArray(objects) || objects.length === 0) {
    throw new ApiError(400, 'Invalid object list', undefined, 'INVALID_OBJECTS');
  }

  if (objects.length > env.maxCsvObjects) {
    throw new ApiError(
      400,
      `Object list exceeds the maximum of ${env.maxCsvObjects} objects.`,
      [`Found ${objects.length} objects; the limit is ${env.maxCsvObjects}.`],
      'CSV_OBJECT_LIMIT'
    );
  }

  return objects.map((item, index) => {
    const row = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError(
        400,
        'Invalid object list',
        [`Object ${row} must include bucket and key.`],
        'INVALID_OBJECTS'
      );
    }

    if (typeof item.bucket !== 'string' || typeof item.key !== 'string') {
      throw new ApiError(
        400,
        'Invalid object list',
        [`Object ${row} must include string bucket and key values.`],
        'INVALID_OBJECTS'
      );
    }

    const bucket = item.bucket.trim();
    const key = item.key.trim();
    const details = [];
    if (!bucket) details.push(`Object ${row} is missing a bucket`);
    if (!key) details.push(`Object ${row} is missing a key`);
    if (details.length > 0) {
      throw new ApiError(400, 'Invalid object list', details, 'INVALID_OBJECTS');
    }

    return { bucket, key };
  });
}

/**
 * Check one object with HeadObject and return a safe result.
 * @param {string} bucket
 * @param {string} key
 * @param {{ send: (command: import('@aws-sdk/client-s3').HeadObjectCommand) => Promise<any> }} [s3Client]
 */
export async function validateObject(bucket, key, s3Client = getS3Client()) {
  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return withoutUndefined({
      bucket,
      key,
      exists: true,
      status: 'VALID',
      size: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified
        ? new Date(response.LastModified).toISOString()
        : undefined,
      etag: response.ETag,
    });
  } catch (err) {
    return toFailedResult(bucket, key, err);
  }
}

/**
 * Validate every object with a small worker pool so HeadObject calls stay bounded.
 * One failure does not stop the remaining checks.
 * @param {{ bucket: string, key: string }[]} objects
 * @param {{ s3Client?: { send: Function }, concurrency?: number }} [options]
 */
export async function validateObjects(objects, options = {}) {
  const s3Client = options.s3Client ?? getS3Client();
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? HEAD_OBJECT_CONCURRENCY, objects.length)
  );
  const results = new Array(objects.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < objects.length) {
      const current = nextIndex;
      nextIndex += 1;
      const object = objects[current];
      results[current] = await validateObject(object.bucket, object.key, s3Client);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const valid = results.filter((object) => object.status === 'VALID').length;

  return {
    total: results.length,
    valid,
    invalid: results.length - valid,
    objects: results,
  };
}

function toFailedResult(bucket, key, err) {
  const name = err?.name || err?.Code || 'Error';
  const statusCode = err?.$metadata?.httpStatusCode;
  // Server log only. Do not include credentials or the raw SDK object.
  // eslint-disable-next-line no-console
  console.error(
    `[s3] HeadObject failed bucket=${bucket} key=${key} name=${name} status=${statusCode ?? 'n/a'}`
  );

  if (isAccessDenied(err)) {
    return {
      bucket,
      key,
      exists: null,
      status: 'ACCESS_DENIED',
      reason: 'Access denied while checking the object',
    };
  }

  if (isNotFound(err)) {
    return {
      bucket,
      key,
      exists: false,
      status: 'NOT_FOUND',
      reason: 'Object does not exist',
    };
  }

  return {
    bucket,
    key,
    exists: null,
    status: 'ERROR',
    reason: 'Unable to validate object',
  };
}

function isAccessDenied(err) {
  const name = err?.name || err?.Code || '';
  const statusCode = err?.$metadata?.httpStatusCode;
  return name === 'AccessDenied' || name === 'AccessDeniedException' || statusCode === 403;
}

function isNotFound(err) {
  const name = err?.name || err?.Code || '';
  const statusCode = err?.$metadata?.httpStatusCode;
  return name === 'NotFound' || name === 'NoSuchKey' || statusCode === 404;
}

function withoutUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
