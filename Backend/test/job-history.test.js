import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import ApiError from '../src/utils/ApiError.js';
import { listJobHistory } from '../src/services/job.service.js';

function job(id, overrides = {}) {
  return {
    jobId: id,
    recordType: 'job',
    workflowId: '11111111-1111-4111-8111-111111111111',
    status: 'Complete',
    bucket: 's3-retagging-866731631203',
    objectCount: 2,
    tagCount: 2,
    tags: { environment: 'test' },
    createdAt: '2026-09-22T15:00:00.000Z',
    updatedAt: '2026-09-22T16:00:00.000Z',
    tasksSucceeded: 2,
    tasksFailed: 0,
    manifestKey: 'manifests/secret.csv',
    reportPrefix: 'reports/',
    ...overrides,
  };
}

function scanner(table, calls) {
  return {
    async send(command) {
      calls.push(command);
      if (!(command instanceof ScanCommand)) throw new Error(`Unexpected ${command.constructor.name}`);
      const limit = command.input.Limit ?? table.length;
      const startId = command.input.ExclusiveStartKey?.jobId;
      const start = startId ? table.findIndex((item) => item.jobId === startId) + 1 : 0;
      const evaluated = table.slice(start, start + limit);
      const values = command.input.ExpressionAttributeValues || {};
      const statuses = Object.entries(values)
        .filter(([key]) => key.startsWith(':status'))
        .map(([, value]) => value);
      const items = evaluated.filter((item) => {
        if (values[':job'] && item.recordType !== values[':job']) return false;
        if (statuses.length > 0 && !statuses.includes(item.status)) return false;
        if (values[':jobSearch'] && !String(item.jobId).includes(values[':jobSearch'])) return false;
        return true;
      });
      const last = evaluated[evaluated.length - 1];
      return {
        Items: items,
        LastEvaluatedKey: start + evaluated.length < table.length && last ? { jobId: last.jobId } : undefined,
      };
    },
  };
}

function options(table, calls = []) {
  return { dynamoClient: scanner(table, calls), tableName: 'RetaggingJobs', calls };
}

test('empty history returns no jobs and no cursor', async () => {
  const result = await listJobHistory({}, options([]));
  assert.deepEqual(result, { jobs: [], nextCursor: null });
});

test('history returns job records and hides workflow index rows', async () => {
  const table = [
    job('job-newer', { createdAt: '2026-09-22T18:00:00.000Z', status: 'Active', tasksSucceeded: 1, tasksFailed: 0 }),
    {
      jobId: 'workflow#11111111-1111-4111-8111-111111111111',
      recordType: 'workflow',
      workflowId: '11111111-1111-4111-8111-111111111111',
      complete: true,
    },
    job('job-older', { createdAt: '2026-09-22T12:00:00.000Z', status: 'Complete' }),
  ];

  const result = await listJobHistory({ limit: 10 }, options(table));
  assert.deepEqual(
    result.jobs.map((item) => item.jobId),
    ['job-newer', 'job-older']
  );
  assert.equal(result.jobs[0].objectCount, 2);
  assert.equal(result.jobs[0].tagCount, 2);
  assert.deepEqual(result.jobs[0].tags, { environment: 'test' });
  assert.equal(result.jobs[0].tasksSucceeded, 1);
  assert.equal(result.jobs[1].tasksFailed, 0);
  assert.equal(JSON.stringify(result).includes('manifestKey'), false);
  assert.equal(JSON.stringify(result).includes('reports/'), false);
  assert.equal(JSON.stringify(result).includes('AWS_SECRET'), false);
  assert.equal(result.nextCursor, null);
});

test('status filter and job id search limit the page', async () => {
  const table = [
    job('job-complete', { status: 'Complete' }),
    job('job-active', { status: 'Active', tasksSucceeded: 0, tasksFailed: 1 }),
    job('other-complete', { status: 'Complete', jobId: 'other-complete' }),
  ];

  const completed = await listJobHistory({ status: 'COMPLETE', limit: 10 }, options(table));
  assert.deepEqual(
    completed.jobs.map((item) => item.jobId).sort(),
    ['job-complete', 'other-complete']
  );

  const found = await listJobHistory({ jobId: 'active', limit: 10 }, options(table));
  assert.deepEqual(
    found.jobs.map((item) => item.jobId),
    ['job-active']
  );
});

test('pagination returns a cursor and the following page', async () => {
  const table = [
    job('job-1', { createdAt: '2026-09-22T10:00:00.000Z' }),
    job('job-2', { createdAt: '2026-09-22T11:00:00.000Z' }),
  ];
  const calls = [];
  const stored = options(table, calls);

  const first = await listJobHistory({ limit: 1 }, stored);
  assert.equal(first.jobs.length, 1);
  assert.equal(first.jobs[0].jobId, 'job-1');
  assert.ok(first.nextCursor);

  const second = await listJobHistory({ limit: 1, cursor: first.nextCursor }, stored);
  assert.equal(second.jobs[0].jobId, 'job-2');
  assert.equal(second.nextCursor, null);
  assert.equal(calls[1].input.ExclusiveStartKey.jobId, 'job-1');
  assert.equal(calls[0].input.Limit, 1);
});

test('DynamoDB errors and invalid cursors do not leak secrets', async () => {
  const denied = new Error('AccessDenied');
  denied.name = 'AccessDenied';
  denied.$metadata = { httpStatusCode: 403 };
  await assert.rejects(
    () =>
      listJobHistory(
        {},
        {
          tableName: 'RetaggingJobs',
          dynamoClient: {
            async send() {
              throw denied;
            },
          },
        }
      ),
    (err) => err instanceof ApiError && err.statusCode === 403 && err.code === 'AWS_ACCESS_DENIED'
  );

  const failure = new Error('secret-token-should-not-leak');
  await assert.rejects(
    () =>
      listJobHistory(
        {},
        {
          tableName: 'RetaggingJobs',
          dynamoClient: {
            async send() {
              throw failure;
            },
          },
        }
      ),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, 'JOB_HISTORY_FAILED');
      assert.equal(JSON.stringify(err).includes('secret-token'), false);
      return true;
    }
  );

  await assert.rejects(
    () => listJobHistory({ cursor: 'not-a-cursor' }, options([])),
    (err) => err instanceof ApiError && err.code === 'INVALID_CURSOR'
  );
});

test('job history reads DynamoDB only', () => {
  const source = fs.readFileSync(new URL('../src/services/job.service.js', import.meta.url), 'utf8');
  assert.equal(source.includes('@aws-sdk/client-s3'), false);
  assert.equal(source.includes('CreateJob'), false);
  assert.equal(source.includes('PutObject'), false);
  assert.ok(source.includes('ScanCommand'));
});
