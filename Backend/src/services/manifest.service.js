// ---------------------------------------------------------------------------
// S3 Batch Operations CSV manifests.
// A manifest lists bucket name + URL-encoded object key only.
// Tag values belong in the CreateJob operation, not in this file.
// ---------------------------------------------------------------------------
import { PutObjectCommand } from '@aws-sdk/client-s3';
import ApiError from '../utils/ApiError.js';
import { toAwsApiError } from '../utils/awsError.js';

/**
 * Encode an object key the way S3 Batch Operations CSV manifests expect.
 * Spaces become %20. Slashes and parentheses stay literal.
 * @param {string} key
 */
export function encodeManifestObjectKey(key) {
  try {
    return encodeURI(key);
  } catch {
    throw new ApiError(
      400,
      'Object key cannot be encoded for a Batch Operations manifest.',
      undefined,
      'INVALID_BATCH_REQUEST'
    );
  }
}

/**
 * Quote a CSV field when it contains a comma, quote, or line break.
 * @param {string} value
 */
function csvField(value) {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/**
 * Build a headerless S3BatchOperations_CSV_20180820 manifest.
 * @param {{ bucket: string, key: string }[]} objects
 */
export function buildManifestCsv(objects) {
  const rows = objects.map((object) => {
    const encodedKey = csvField(encodeManifestObjectKey(object.key));
    return `${object.bucket},${encodedKey}`;
  });

  return `${rows.join('\n')}\n`;
}
/**
 * Manifest object key under the configured prefix.
 * One tag group uses manifests/<workflowId>.csv.
 * Several groups use manifests/<workflowId>-group-N.csv.
 */
export function manifestObjectKey(prefix, workflowId, groupNumber, groupCount) {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const fileName = groupCount === 1 ? `${workflowId}.csv` : `${workflowId}-group-${groupNumber}.csv`;
  return `${normalized}${fileName}`;
}

/**
 * Upload a manifest and return the ETag from PutObject.
 * @param {{ bucket: string, key: string, body: string, s3Client: { send: Function } }} input
 */
export async function uploadManifest({ bucket, key, body, s3Client }) {
  try {
    const response = await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'text/csv',
      })
    );

    if (!response?.ETag) {
      throw new ApiError(500, 'Manifest upload did not return an ETag.', undefined, 'MANIFEST_CREATION_FAILED');
    }

    return {
      bucket,
      key,
      etag: response.ETag,
      objectArn: `arn:aws:s3:::${bucket}/${key}`,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toAwsApiError(err, {
      statusCode: 500,
      message: 'Could not upload the Batch Operations manifest.',
      code: 'MANIFEST_CREATION_FAILED',
    });
  }
}
