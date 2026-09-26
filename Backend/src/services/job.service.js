// ---------------------------------------------------------------------------
// DynamoDB job metadata. Stores one item per Batch Operations job plus a
// workflow index so a repeated create request can return the original jobs.
// Credentials are never written.
// ---------------------------------------------------------------------------
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import ApiError from '../utils/ApiError.js';
import { toAwsApiError } from '../utils/awsError.js';

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
