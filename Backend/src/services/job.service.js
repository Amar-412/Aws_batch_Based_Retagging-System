// ---------------------------------------------------------------------------
// DynamoDB job metadata. Stores one item per Batch Operations job plus a
// workflow index so a repeated create request can return the original jobs.
// Credentials are never written.
// ---------------------------------------------------------------------------
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import env from '../config/env.js';
import { getDynamoDocClient } from '../config/aws.js';
import ApiError from '../utils/ApiError.js';
import { toAwsApiError } from '../utils/awsError.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const HISTORY_FAILURE = {
  statusCode: 500,
  message: 'Could not read job history.',
  code: 'JOB_HISTORY_FAILED',
};

const STATUS_GROUPS = {
  NEW: ['NEW', 'New'],
  ACTIVE: ['Active'],
  COMPLETE: ['Complete'],
  FAILED: ['Failed'],
  CANCELLED: ['Cancelled', 'Canceled'],
};

const METADATA_FAILURE = {
  statusCode: 500,
  message: 'Could not store job metadata. Check that the DynamoDB table exists.',
  code: 'JOB_METADATA_FAILED',
};

export function workflowRecordId(workflowId) {
  return `workflow#${workflowId}`;
}

export async function getRecord(jobId, dynamo, tableName) {
  try {
    const response = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { jobId },
      })
    );
    return response.Item || null;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toAwsApiError(err, METADATA_FAILURE);
  }
}

export async function putRecord(item, dynamo, tableName) {
  try {
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      })
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toAwsApiError(err, METADATA_FAILURE);
  }
}

/**
 * Return previously stored jobs for a completed workflow, or null.
 */
export async function findCompletedWorkflow(workflowId, dynamo, tableName) {
  const index = await getRecord(workflowRecordId(workflowId), dynamo, tableName);
  if (!index?.complete || !Array.isArray(index.jobIds) || index.jobIds.length === 0) return null;

  const jobs = [];
  for (const jobId of index.jobIds) {
    const job = await getRecord(jobId, dynamo, tableName);
    if (!job || job.recordType !== 'job') return null;
    jobs.push(job);
  }
  return jobs;
}

/**
 * Fields safe to show in job history. Credentials and report internals stay out.
 * @param {object} item
 */
export function toHistoryJob(item) {
  return {
    jobId: item.jobId,
    workflowId: item.workflowId ?? null,
    status: item.status ?? null,
    bucket: item.bucket ?? null,
    objectCount: item.objectCount ?? 0,
    tagCount: item.tagCount ?? 0,
    tags: item.tags && typeof item.tags === 'object' ? item.tags : {},
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    tasksSucceeded: item.tasksSucceeded ?? null,
    tasksFailed: item.tasksFailed ?? null,
  };
}

export function normalizeHistoryQuery(query = {}) {
  const rawLimit = query.limit === undefined || query.limit === '' ? DEFAULT_LIMIT : Number(query.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    throw new ApiError(400, 'Limit must be an integer from 1 to 100.', undefined, 'INVALID_LIMIT');
  }

  const status = typeof query.status === 'string' ? query.status.trim().toUpperCase() : '';
  if (status && !STATUS_GROUPS[status]) {
    throw new ApiError(400, 'Status filter is not valid.', undefined, 'INVALID_STATUS');
  }

  const jobId = typeof query.jobId === 'string' ? query.jobId.trim() : '';
  if (jobId.length > 256) {
    throw new ApiError(400, 'Job ID search is not valid.', undefined, 'INVALID_JOB_SEARCH');
  }

  return {
    limit: rawLimit,
    cursor: typeof query.cursor === 'string' && query.cursor ? query.cursor : undefined,
    status: status || undefined,
    jobId: jobId || undefined,
  };
}

export function encodeHistoryCursor(key) {
  if (!key) return null;
  return Buffer.from(JSON.stringify({ jobId: key.jobId }), 'utf8').toString('base64url');
}

export function decodeHistoryCursor(cursor) {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.jobId !== 'string' || !parsed.jobId) {
      throw new Error('Invalid cursor');
    }
    return { jobId: parsed.jobId };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'The page cursor is not valid.', undefined, 'INVALID_CURSOR');
  }
}

/**
 * Read job history from DynamoDB. This does not call S3 or create jobs.
 * Limit is the number of table items DynamoDB evaluates for the page.
 */
export async function listJobHistory(query = {}, options = {}) {
  const normalized = normalizeHistoryQuery(query);
  const dynamo = options.dynamoClient ?? getDynamoDocClient();
  const tableName = options.tableName ?? env.dynamoTable;
  const names = { '#recordType': 'recordType' };
  const values = { ':job': 'job' };
  const filters = ['#recordType = :job'];

  if (normalized.status) {
    names['#status'] = 'status';
    const parts = STATUS_GROUPS[normalized.status].map((value, index) => {
      const key = `:status${index}`;
      values[key] = value;
      return `#status = ${key}`;
    });
    filters.push(`(${parts.join(' OR ')})`);
  }

  if (normalized.jobId) {
    names['#jobId'] = 'jobId';
    values[':jobSearch'] = normalized.jobId;
    filters.push('contains(#jobId, :jobSearch)');
  }

  try {
    const response = await dynamo.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: filters.join(' AND '),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: decodeHistoryCursor(normalized.cursor),
        Limit: normalized.limit,
      })
    );

    const jobs = (response.Items || [])
      .map(toHistoryJob)
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));

    return {
      jobs,
      nextCursor: encodeHistoryCursor(response.LastEvaluatedKey),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toAwsApiError(err, HISTORY_FAILURE);
  }
}
