import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import test from 'node:test';
import { CreateJobCommand, DescribeJobCommand } from '@aws-sdk/client-s3-control';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createApp } from '../src/app.js';
import { createRetaggingWorkflow, getBatchJobStatus } from '../src/services/batch-job.service.js';
import ApiError from '../src/utils/ApiError.js';

const workflowId = '11111111-1111-4111-8111-111111111111';
const roleArn = 'arn:aws:iam::866731631203:role/S3BatchRetaggingRole';
const bucket = 's3-retagging-866731631203';

function object(key, tags, status = 'READY') {
  return {
    bucket,
    key,
    proposedTags: tags,
    status,
  };
}

function plan(objects, extra = {}) {
  return {
    workflowId,
    confirmed: true,
    objects,
    ...extra,
  };
}

function memoryAws() {
  const items = new Map();
  const calls = { s3: [], control: [], dynamo: [] };
  let jobNumber = 0;

  return {
    calls,
    items,
    s3Client: {
      async send(command) {
        calls.s3.push(command);
        return { ETag: '"manifest-etag"' };
      },
    },
    s3ControlClient: {
      async send(command) {
        calls.control.push(command);
        if (command instanceof DescribeJobCommand) {
          return {
            Job: {
              JobId: command.input.JobId,
              Status: 'Active',
              StatusUpdateReason: 'Running',
              CreationTime: new Date('2026-09-22T15:00:00.000Z'),
              TerminationDate: undefined,
              ProgressSummary: {
                NumberOfTasksSucceeded: 0,
                NumberOfTasksFailed: 0,
                TotalNumberOfTasks: 2,
              },
              RoleArn: roleArn,
            },
          };
        }
        jobNumber += 1;
        return { JobId: `job-${jobNumber}` };
      },
    },
    dynamoClient: {
      async send(command) {
        calls.dynamo.push(command);
        if (command instanceof GetCommand) {
          return { Item: items.get(command.input.Key.jobId) };
        }
        if (command instanceof PutCommand) {
          items.set(command.input.Item.jobId, command.input.Item);
          return {};
        }
        throw new Error(`Unexpected DynamoDB command ${command.constructor.name}`);
      },
    },
  };
}

function deps(aws = memoryAws()) {
  return {
    ...aws,
    roleArn,
    bucket,
    tableName: 'RetaggingJobs',
    manifestPrefix: 'manifests/',
    reportPrefix: 'reports/',
  };
}

async function withServer(run) {
  const server = createApp().listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('one shared tag set creates one S3PutObjectTagging job', async () => {
  const aws = memoryAws();
  const result = await createRetaggingWorkflow(
    plan([
      object('test/atlas-credentials (3).env', { environment: 'test' }),
      object('test/atlas-credentials (4).env', { environment: 'test' }),
    ]),
    deps(aws)
  );

  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].jobId, 'job-1');
  assert.equal(result.jobs[0].status, 'NEW');
  assert.equal(result.jobs[0].objectCount, 2);
  assert.deepEqual(result.jobs[0].tags, { environment: 'test' });
  assert.equal(result.jobs[0].manifestKey, `manifests/${workflowId}.csv`);
  assert.equal(aws.calls.control.length, 1);

  const command = aws.calls.control[0];
  assert.ok(command instanceof CreateJobCommand);
  assert.equal(command.input.RoleArn, roleArn);
  assert.equal(command.input.AccountId, '866731631203');
  assert.equal(command.input.Priority, 10);
  assert.equal(command.input.ClientRequestToken, `${workflowId}:1`);
  assert.equal(command.input.Description, `S3 Batch Retagging - ${workflowId}`);
  assert.deepEqual(command.input.Operation, {
    S3PutObjectTagging: { TagSet: [{ Key: 'environment', Value: 'test' }] },
  });
  assert.equal(command.input.Manifest.Spec.Format, 'S3BatchOperations_CSV_20180820');
  assert.deepEqual(command.input.Manifest.Spec.Fields, ['Bucket', 'Key']);
  assert.equal(
    command.input.Manifest.Location.ObjectArn,
    `arn:aws:s3:::${bucket}/manifests/${workflowId}.csv`
  );
  assert.equal(command.input.Manifest.Location.ETag, '"manifest-etag"');
  assert.equal(command.input.Report.Enabled, true);
  assert.equal(command.input.Report.Prefix, 'reports/');
  assert.equal(command.input.Report.ReportScope, 'AllTasks');
  assert.equal(JSON.stringify(command.input).includes('AWS_SECRET'), false);
  assert.equal(JSON.stringify(result).includes(roleArn), false);

  const manifest = aws.calls.s3[0];
  assert.equal(manifest.input.ContentType, 'text/csv');
  assert.match(manifest.input.Body, /test\/atlas-credentials%20\(3\)\.env/);
  assert.equal(manifest.input.Body.includes('environment'), false);

  const saved = aws.items.get('job-1');
  assert.equal(saved.recordType, 'job');
  assert.equal(saved.objectCount, 2);
  assert.equal(saved.tagCount, 2);
  assert.equal(saved.manifestKey, `manifests/${workflowId}.csv`);
  assert.equal(aws.calls.dynamo.some((command) => command instanceof PutCommand), true);
});

test('different tag sets create one job per configuration', async () => {
  const aws = memoryAws();
  const result = await createRetaggingWorkflow(
    plan([
      object('a.txt', { environment: 'test' }),
      object('b.txt', { environment: 'production' }),
      object('c.txt', { environment: 'test' }),
    ]),
    deps(aws)
  );

  assert.equal(result.jobs.length, 2);
  assert.equal(aws.calls.control.length, 2);
  const production = result.jobs.find((job) => job.tags.environment === 'production');
  const testGroup = result.jobs.find((job) => job.tags.environment === 'test');
  assert.equal(production.objectCount, 1);
  assert.equal(testGroup.objectCount, 2);
  assert.equal(production.manifestKey, `manifests/${workflowId}-group-1.csv`);
  assert.equal(testGroup.manifestKey, `manifests/${workflowId}-group-2.csv`);
});

test('conflicts, empty plans, and a missing role create no jobs', async () => {
  const aws = memoryAws();
  const options = deps(aws);

  await assert.rejects(
    () =>
      createRetaggingWorkflow(
        plan([
          object('a.txt', { environment: 'test' }),
          object('b.txt', {}, 'CONFLICT'),
        ]),
        options
      ),
    (err) => err instanceof ApiError && err.code === 'RETAGGING_CONFLICT'
  );

  await assert.rejects(
    () => createRetaggingWorkflow(plan([]), options),
    (err) => err instanceof ApiError && err.code === 'INVALID_OBJECTS'
  );

  await assert.rejects(
    () => createRetaggingWorkflow(plan([object('a.txt', {}, 'UNCHANGED')]), options),
    (err) => err instanceof ApiError && err.code === 'INVALID_BATCH_REQUEST'
  );

  await assert.rejects(
    () => createRetaggingWorkflow(plan([object('a.txt', { environment: 'test' })]), { ...options, roleArn: '' }),
    (err) => err instanceof ApiError && err.code === 'BATCH_ROLE_NOT_CONFIGURED'
  );

  await assert.rejects(
    () =>
      createRetaggingWorkflow(
        { ...plan([object('a.txt', { environment: 'test' })]), confirmed: false },
        options
      ),
    (err) => err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED'
  );

  assert.equal(aws.calls.s3.length, 0);
  assert.equal(aws.calls.control.length, 0);
});

test('invalid tags are rejected before AWS is called', async () => {
  const aws = memoryAws();
  await assert.rejects(
    () => createRetaggingWorkflow(plan([object('a.txt', { 'aws:env': 'test' })]), deps(aws)),
    (err) => err instanceof ApiError && err.code === 'INVALID_BATCH_REQUEST'
  );
  assert.equal(aws.calls.s3.length, 0);
});

test('submitting the same workflow again returns the stored jobs', async () => {
  const aws = memoryAws();
  const options = deps(aws);
  const body = plan([object('a.txt', { environment: 'test' })]);

  const first = await createRetaggingWorkflow(body, options);
  const jobsAfterFirst = aws.calls.control.length;
  const second = await createRetaggingWorkflow(body, options);

  assert.equal(second.jobs[0].jobId, first.jobs[0].jobId);
  assert.equal(aws.calls.control.length, jobsAfterFirst);
  assert.equal(aws.calls.s3.length, 1);
});

test('DescribeJob refreshes stored status without returning the role ARN', async () => {
  const aws = memoryAws();
  const options = deps(aws);
  await createRetaggingWorkflow(
    plan([
      object('test/atlas-credentials (3).env', { environment: 'test' }),
      object('test/atlas-credentials (4).env', { environment: 'test' }),
    ]),
    options
  );

  const status = await getBatchJobStatus('job-1', options);
  assert.equal(status.jobId, 'job-1');
  assert.equal(status.status, 'Active');
  assert.equal(status.statusReason, 'Running');
  assert.equal(status.creationTime, '2026-09-22T15:00:00.000Z');
  assert.equal(status.terminationDate, null);
  assert.deepEqual(status.progressSummary, {
    numberOfTasksSucceeded: 0,
    numberOfTasksFailed: 0,
    numberOfTasksTotal: 2,
  });
  assert.equal(status.objectCount, 2);
  assert.deepEqual(status.tags, { environment: 'test' });
  assert.equal(JSON.stringify(status).includes(roleArn), false);
  assert.equal(aws.items.get('job-1').status, 'Active');
  assert.ok(aws.calls.control.at(-1) instanceof DescribeJobCommand);

  await assert.rejects(
    () => getBatchJobStatus('missing-job', options),
    (err) => err instanceof ApiError && err.statusCode === 404 && err.code === 'JOB_NOT_FOUND'
  );
});

test('batch HTTP validation fails before any job is created', async () => {
  await withServer(async (baseUrl) => {
    const conflict = await fetch(`${baseUrl}/api/batch/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        plan([
          object('a.txt', { environment: 'test' }),
          { ...object('b.txt', { environment: 'production' }), status: 'CONFLICT' },
        ])
      ),
    });
    assert.equal(conflict.status, 400);
    assert.equal((await conflict.json()).error.code, 'RETAGGING_CONFLICT');

    const empty = await fetch(`${baseUrl}/api/batch/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan([])),
    });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error.code, 'INVALID_OBJECTS');

    const unconfirmed = await fetch(`${baseUrl}/api/batch/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...plan([object('a.txt', { environment: 'test' })]), confirmed: false }),
    });
    assert.equal(unconfirmed.status, 400);
    assert.equal((await unconfirmed.json()).error.code, 'CONFIRMATION_REQUIRED');
  });
});

test('batch services do not call object-level PutObjectTagging', () => {
  const source = [
    '../src/services/batch-job.service.js',
    '../src/services/manifest.service.js',
    '../src/services/job.service.js',
    '../src/controllers/batch.controller.js',
  ]
    .map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');

  assert.equal(source.includes('PutObjectTaggingCommand'), false);
  assert.equal(source.includes('AWS_SECRET_ACCESS_KEY'), false);
  assert.equal(source.includes('AWS_ACCESS_KEY_ID'), false);
  assert.ok(source.includes('S3PutObjectTagging'));
  assert.ok(source.includes('CreateJobCommand'));
  assert.ok(source.includes('DescribeJobCommand'));
  assert.ok(source.includes('PutCommand'));
  assert.ok(source.includes('GetCommand'));
});
