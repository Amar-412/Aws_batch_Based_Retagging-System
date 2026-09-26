// ---------------------------------------------------------------------------
// Create and describe S3 Batch Operations retagging jobs.
// Tagging is performed by the job operation S3PutObjectTagging.
// This service never calls PutObjectTagging on individual objects.
//
// The application already required an explicit preview confirmation.
// CreateJob therefore does not ask for a second AWS console confirmation.
// A job is still created only after this API receives confirmed: true.
// ---------------------------------------------------------------------------
import { CreateJobCommand, DescribeJobCommand } from '@aws-sdk/client-s3-control';
import env from '../config/env.js';
import { getDynamoDocClient, getS3Client, getS3ControlClient } from '../config/aws.js';
import ApiError from '../utils/ApiError.js';
import { toAwsApiError } from '../utils/awsError.js';
import { validateTagMap } from '../utils/ruleValidator.js';
import { buildManifestCsv, manifestObjectKey, uploadManifest } from './manifest.service.js';
import { findCompletedWorkflow, getRecord, putRecord, workflowRecordId } from './job.service.js';

const WORKFLOW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_ARN = /^arn:aws[a-zA-Z-]*:iam::(\d{12}):role\/.+/;
const ELIGIBLE_STATUS = new Set(['READY', 'MATCHED']);

/**
 * @param {string} roleArn
 */
export function accountIdFromRoleArn(roleArn) {
  const match = ROLE_ARN.exec(roleArn || '');
  return match ? match[1] : '';
}

/**
 * @param {object[]} objects
 */
export function groupObjectsByTags(objects) {
  const groups = new Map();
  for (const object of objects) {
    const signature = JSON.stringify(
      Object.keys(object.proposedTags)
        .sort()
        .map((key) => [key, object.proposedTags[key]])
    );
    if (!groups.has(signature)) {
      groups.set(signature, { tags: object.proposedTags, objects: [] });
    }
    groups.get(signature).objects.push(object);
  }

  return [...groups.values()].sort((left, right) =>
    JSON.stringify(left.tags).localeCompare(JSON.stringify(right.tags))
  );
}

function requireRole(roleArn) {
  if (!roleArn || !accountIdFromRoleArn(roleArn)) {
    throw new ApiError(
      400,
      'BATCH_OPERATIONS_ROLE_ARN is not configured. Set it to an IAM role that S3 Batch Operations can assume.',
      undefined,
      'BATCH_ROLE_NOT_CONFIGURED'
    );
  }
  return { roleArn, accountId: accountIdFromRoleArn(roleArn) };
}

function sortTags(tags) {
  return Object.fromEntries(Object.keys(tags).sort().map((key) => [key, tags[key]]));
}

/**
 * Keep objects that have a single agreed tag set. Reject the whole request
 * when any object is in conflict.
 * @param {unknown} body
 */
export function prepareRetaggingPlan(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'A confirmed retagging plan is required.', undefined, 'INVALID_BATCH_REQUEST');
  }

  if (body.confirmed !== true) {
    throw new ApiError(
      400,
      'Preview confirmation is required before creating a Batch Operations job.',
      undefined,
      'CONFIRMATION_REQUIRED'
    );
  }

  if (typeof body.workflowId !== 'string' || !WORKFLOW_ID.test(body.workflowId)) {
    throw new ApiError(400, 'A workflowId is required.', undefined, 'INVALID_BATCH_REQUEST');
  }

  if (!Array.isArray(body.objects) || body.objects.length === 0) {
    throw new ApiError(400, 'At least one object is required.', undefined, 'INVALID_OBJECTS');
  }

  const eligible = [];
  for (const [index, object] of body.objects.entries()) {
    const row = index + 1;
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      throw new ApiError(400, 'Invalid object list', [`Object ${row} is empty.`], 'INVALID_OBJECTS');
    }

    const hasConflict = object.status === 'CONFLICT' || (Array.isArray(object.conflicts) && object.conflicts.length > 0);
    if (hasConflict) {
      throw new ApiError(
        400,
        'Resolve tag conflicts before creating a Batch Operations job.',
        undefined,
        'RETAGGING_CONFLICT'
      );
    }

    const bucket = typeof object.bucket === 'string' ? object.bucket.trim() : '';
    const key = typeof object.key === 'string' ? object.key : '';
    if (!bucket || !key.trim()) {
      throw new ApiError(
        400,
        'Invalid object list',
        [`Object ${row} must include a bucket and key.`],
        'INVALID_OBJECTS'
      );
    }

    const proposed = object.proposedTags;
    const hasTags = proposed && typeof proposed === 'object' && !Array.isArray(proposed) && Object.keys(proposed).length > 0;
    if (object.status === 'UNCHANGED' || !hasTags) continue;

    if (!ELIGIBLE_STATUS.has(object.status)) {
      throw new ApiError(400, `Object ${row} cannot be submitted.`, undefined, 'INVALID_BATCH_REQUEST');
    }

    const tagCheck = validateTagMap(proposed);
    if (!tagCheck.valid) {
      throw new ApiError(400, 'Invalid tags.', tagCheck.errors, 'INVALID_BATCH_REQUEST');
    }

    eligible.push({
      bucket,
      key,
      proposedTags: sortTags(tagCheck.tags),
    });
  }

  if (eligible.length === 0) {
    throw new ApiError(400, 'No proposed tag changes to apply.', undefined, 'INVALID_BATCH_REQUEST');
  }

  return {
    workflowId: body.workflowId,
    objects: eligible,
  };
}

function toPublicJob(item) {
  return {
    jobId: item.jobId,
    status: item.status,
    objectCount: item.objectCount,
    tags: item.tags,
    manifestKey: item.manifestKey,
  };
}

/**
 * Create one Batch Operations job for one tag group.
 * @param {object} input
 * @param {{ send: Function }} s3ControlClient
 */
export async function createBatchJob(input, s3ControlClient) {
  const command = new CreateJobCommand({
    AccountId: input.accountId,
    ConfirmationRequired: false,
    Operation: {
      S3PutObjectTagging: {
        TagSet: Object.entries(input.tags).map(([Key, Value]) => ({ Key, Value })),
      },
    },
    Report: {
      Bucket: `arn:aws:s3:::${input.reportBucket}`,
      Format: 'Report_CSV_20180820',
      Enabled: true,
      Prefix: input.reportPrefix,
      ReportScope: 'AllTasks',
    },
    ClientRequestToken: `${input.workflowId}:${input.groupNumber}`,
    Manifest: {
      Spec: {
        Format: 'S3BatchOperations_CSV_20180820',
        Fields: ['Bucket', 'Key'],
      },
      Location: {
        ObjectArn: input.manifest.objectArn,
        ETag: input.manifest.etag,
      },
    },
    Description: `S3 Batch Retagging - ${input.workflowId}`,
    Priority: 10,
    RoleArn: input.roleArn,
  });

  try {
    const response = await s3ControlClient.send(command);
    if (!response?.JobId) {
      throw new ApiError(500, 'S3 Batch Operations did not return a job ID.', undefined, 'BATCH_JOB_CREATION_FAILED');
    }
    return response.JobId;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toAwsApiError(err, {
      statusCode: 500,
      message: 'Could not create the S3 Batch Operations job.',
      code: 'BATCH_JOB_CREATION_FAILED',
    });
  }
}

function clientsFrom(options) {
  return {
    s3Client: options.s3Client ?? getS3Client(),
    s3ControlClient: options.s3ControlClient ?? getS3ControlClient(),
    dynamo: options.dynamoClient ?? getDynamoDocClient(),
    bucket: options.bucket ?? env.s3Bucket,
    tableName: options.tableName ?? env.dynamoTable,
    manifestPrefix: options.manifestPrefix ?? env.manifestPrefix ?? 'manifests/',
    reportPrefix: options.reportPrefix ?? env.reportPrefix ?? 'reports/',
    roleArn: options.roleArn === undefined ? env.batchOperationsRoleArn : options.roleArn,
  };
}

/**
 * Validate the confirmed plan, upload one manifest per tag set, and create
 * one Batch Operations job per manifest.
 */
export async function createRetaggingWorkflow(body, options = {}) {
  const plan = prepareRetaggingPlan(body);
  const deps = clientsFrom(options);
  const { roleArn, accountId } = requireRole(deps.roleArn);

  if (!deps.bucket) {
    throw new ApiError(400, 'S3_BUCKET is not configured.', undefined, 'INVALID_BATCH_REQUEST');
  }

  const existing = await findCompletedWorkflow(plan.workflowId, deps.dynamo, deps.tableName);
  if (existing) {
    return {
      workflowId: plan.workflowId,
      jobs: existing.map(toPublicJob),
    };
  }

  const groups = groupObjectsByTags(plan.objects);
  const reportPrefix = deps.reportPrefix.endsWith('/') ? deps.reportPrefix : `${deps.reportPrefix}/`;
  const created = [];
  const now = new Date().toISOString();

  for (const [index, group] of groups.entries()) {
    const groupNumber = index + 1;
    const key = manifestObjectKey(deps.manifestPrefix, plan.workflowId, groupNumber, groups.length);
    const csv = buildManifestCsv(group.objects);
    const manifest = await uploadManifest({
      bucket: deps.bucket,
      key,
      body: csv,
      s3Client: deps.s3Client,
    });

    const jobId = await createBatchJob(
      {
        accountId,
        roleArn,
        workflowId: plan.workflowId,
        groupNumber,
        manifest,
        tags: group.tags,
        reportBucket: deps.bucket,
        reportPrefix,
      },
      deps.s3ControlClient
    );

    const item = {
      jobId,
      recordType: 'job',
      workflowId: plan.workflowId,
      status: 'NEW',
      bucket: deps.bucket,
      manifestKey: manifest.key,
      reportPrefix,
      objectCount: group.objects.length,
      tagCount: group.objects.length * Object.keys(group.tags).length,
      tags: group.tags,
      createdAt: now,
      updatedAt: now,
    };
    await putRecord(item, deps.dynamo, deps.tableName);
    created.push(item);
  }

  await putRecord(
    {
      jobId: workflowRecordId(plan.workflowId),
      recordType: 'workflow',
      workflowId: plan.workflowId,
      jobIds: created.map((item) => item.jobId),
      complete: true,
      updatedAt: now,
    },
    deps.dynamo,
    deps.tableName
  );

  return {
    workflowId: plan.workflowId,
    jobs: created.map(toPublicJob),
  };
}

function toStatusResponse(item, job) {
  const progress = job?.ProgressSummary || {};
  return {
    jobId: item.jobId,
    status: job?.Status || item.status,
    statusReason: job?.StatusUpdateReason || null,
    creationTime: job?.CreationTime ? new Date(job.CreationTime).toISOString() : item.createdAt,
    terminationDate: job?.TerminationDate ? new Date(job.TerminationDate).toISOString() : null,
    progressSummary: {
      numberOfTasksSucceeded: progress.NumberOfTasksSucceeded ?? 0,
      numberOfTasksFailed: progress.NumberOfTasksFailed ?? 0,
      numberOfTasksTotal: progress.TotalNumberOfTasks ?? item.objectCount ?? 0,
    },
    objectCount: item.objectCount,
    tags: item.tags,
    manifestKey: item.manifestKey,
    createdAt: item.createdAt,
  };
}

/**
 * Read a stored job and refresh its status from DescribeJob.
 * Creating a job is not the same as tasks finishing.
 */
export async function getBatchJobStatus(jobId, options = {}) {
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9-]{1,256}$/.test(jobId)) {
    throw new ApiError(404, 'Job not found.', undefined, 'JOB_NOT_FOUND');
  }

  const deps = clientsFrom(options);
  const item = await getRecord(jobId, deps.dynamo, deps.tableName);
  if (!item || item.recordType !== 'job') {
    throw new ApiError(404, 'Job not found.', undefined, 'JOB_NOT_FOUND');
  }

  const { accountId } = requireRole(deps.roleArn);

  let described;
  try {
    described = await deps.s3ControlClient.send(
      new DescribeJobCommand({
        AccountId: accountId,
        JobId: jobId,
      })
    );
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toAwsApiError(err, {
      statusCode: 500,
      message: 'Could not read the Batch Operations job.',
      code: 'BATCH_JOB_LOOKUP_FAILED',
    });
  }

  const updated = {
    ...item,
    status: described.Job?.Status || item.status,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(updated, deps.dynamo, deps.tableName);
  return toStatusResponse(updated, described.Job);
}
