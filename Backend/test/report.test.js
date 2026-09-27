import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { GetObjectCommand, GetObjectTaggingCommand } from '@aws-sdk/client-s3';
import { DescribeJobCommand } from '@aws-sdk/client-s3-control';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getBatchJobStatus } from '../src/services/batch-job.service.js';
import {
  decodeReportObjectKey,
  loadCompletionReport,
  parseReportCsv,
} from '../src/services/report.service.js';

const bucket = 's3-retagging-866731631203';
const roleArn = 'arn:aws:iam::866731631203:role/S3BatchRetaggingRole';
const schema = 'Bucket, Key, VersionId, TaskStatus, ErrorCode, HTTPStatusCode, ResultMessage';

const successLine =
  's3-retagging-866731631203,test/atlas-credentials%20%283%29.env,,succeeded,200,,Successful';
const secondSuccessLine =
  's3-retagging-866731631203,test/atlas-credentials%20%284%29.env,,succeeded,200,,Successful';
const failedLine =
  's3-retagging-866731631203,missing.txt,,failed,403,AccessDenied,Access Denied';

function textBody(text) {
  return { transformToString: async () => text };
}

function notFound() {
  const error = new Error('NotFound');
  error.name = 'NotFound';
  error.$metadata = { httpStatusCode: 404 };
  return error;
}

function manifest(resultsKey, status = 'succeeded') {
  return JSON.stringify({
    Format: 'Report_CSV_20180820',
    ReportSchema: schema,
    Results: [{ TaskExecutionStatus: status, Bucket: bucket, Key: resultsKey }],
  });
}

test('report keys decode spaces and parentheses', () => {
  assert.equal(
    decodeReportObjectKey('test/atlas-credentials%20%283%29.env'),
    'test/atlas-credentials (3).env'
  );
  assert.equal(decodeReportObjectKey('plain.txt'), 'plain.txt');
});

test('a successful report is not treated as proof without the task row', () => {
  const parsed = parseReportCsv(`${successLine}\n${secondSuccessLine}\n`, schema);
  assert.equal(parsed.malformed, false);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].key, 'test/atlas-credentials (3).env');
  assert.equal(parsed.rows[0].taskStatus, 'succeeded');
  assert.equal(parsed.rows[0].httpStatusCode, '200');
  assert.equal(parsed.rows[0].errorCode, '');
  assert.equal(parsed.rows[0].resultMessage, 'Successful');
  assert.equal(parsed.rows[1].key, 'test/atlas-credentials (4).env');
});

test('failed report rows keep the error code, HTTP status, and message', () => {
  const parsed = parseReportCsv(
    'amzn-s3-demo-bucket1,image_14975,,failed,200,PermanentFailure,"Lambda returned function error: {""errorMessage"":""timed out""}"\n',
    schema
  );
  assert.equal(parsed.rows[0].taskStatus, 'failed');
  assert.equal(parsed.rows[0].httpStatusCode, '200');
  assert.equal(parsed.rows[0].errorCode, 'PermanentFailure');
  assert.match(parsed.rows[0].resultMessage, /timed out/);
});

test('mixed results count successes and failures separately', async () => {
  const files = new Map([
    ['reports//job-mixed/manifest.json', manifest('reports/job-mixed/results/all.csv', 'succeeded')],
    ['reports/job-mixed/results/all.csv', `${successLine}\n${failedLine}\n`],
  ]);
  const tagging = [];
  const s3Client = {
    async send(command) {
      if (command instanceof GetObjectTaggingCommand) {
        tagging.push(command.input.Key);
        return { TagSet: [{ Key: 'environment', Value: 'test' }] };
      }
      if (command instanceof GetObjectCommand) {
        const text = files.get(command.input.Key);
        if (text === undefined) throw notFound();
        return { Body: textBody(text) };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };

  const loaded = await loadCompletionReport({
    s3Client,
    bucket,
    reportPrefix: 'reports/',
    jobId: 'mixed',
  });

  assert.equal(loaded.report.available, true);
  assert.equal(loaded.resultSummary.total, 2);
  assert.equal(loaded.resultSummary.succeeded, 1);
  assert.equal(loaded.resultSummary.failed, 1);
  assert.equal(loaded.resultSummary.fromReport, true);
  assert.deepEqual(tagging, ['test/atlas-credentials (3).env']);
  assert.deepEqual(loaded.results[0].actualTags, { environment: 'test' });
  assert.equal(loaded.results[0].actualTagsRetrieved, true);
  assert.equal(loaded.results[1].actualTags, null);
  assert.equal(loaded.results[1].errorCode, 'AccessDenied');
  assert.equal(loaded.results[1].httpStatusCode, '403');
  assert.equal(loaded.results[1].resultMessage, 'Access Denied');
});

test('a missing report stays unavailable and a malformed report is reported', async () => {
  const missing = await loadCompletionReport({
    s3Client: {
      async send() {
        throw notFound();
      },
    },
    bucket,
    reportPrefix: 'reports/',
    jobId: 'missing',
  });
  assert.equal(missing.report.available, false);
  assert.equal(missing.results.length, 0);
  assert.match(missing.report.message, /not available/);

  const malformed = await loadCompletionReport({
    s3Client: {
      async send(command) {
        assert.ok(command instanceof GetObjectCommand);
        return { Body: textBody('{not json') };
      },
    },
    bucket,
    reportPrefix: 'reports/',
    jobId: 'bad',
  });
  assert.equal(malformed.report.available, false);
  assert.equal(malformed.report.malformed, true);
  assert.equal(malformed.results.length, 0);
});

test('a running job does not read the report or tag objects', async () => {
  const items = new Map([
    [
      'job-running',
      {
        jobId: 'job-running',
        recordType: 'job',
        status: 'Active',
        bucket,
        reportPrefix: 'reports/',
        objectCount: 2,
        tags: { environment: 'test' },
        manifestKey: 'manifests/demo.csv',
        createdAt: '2026-09-22T15:00:00.000Z',
      },
    ],
  ]);
  const s3Calls = [];
  const status = await getBatchJobStatus('job-running', {
    roleArn,
    bucket,
    tableName: 'RetaggingJobs',
    reportPrefix: 'reports/',
    s3Client: {
      async send(command) {
        s3Calls.push(command.constructor.name);
        throw new Error('S3 should not be called while the job is running');
      },
    },
    s3ControlClient: {
      async send(command) {
        assert.ok(command instanceof DescribeJobCommand);
        return {
          Job: {
            Status: 'Active',
            ProgressSummary: { TotalNumberOfTasks: 2, NumberOfTasksSucceeded: 1, NumberOfTasksFailed: 0 },
            CreationTime: new Date('2026-09-22T15:00:00.000Z'),
          },
        };
      },
    },
    dynamoClient: {
      async send(command) {
        if (command instanceof GetCommand) return { Item: items.get(command.input.Key.jobId) };
        if (command instanceof PutCommand) {
          items.set(command.input.Item.jobId, command.input.Item);
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    },
  });

  assert.equal(status.status, 'Active');
  assert.equal(status.report.available, false);
  assert.deepEqual(status.results, []);
  assert.equal(status.resultSummary.fromReport, false);
  assert.equal(status.resultSummary.succeeded, 1);
  assert.deepEqual(s3Calls, []);
});

test('a completed job uses the report even when the progress summary says every task succeeded', async () => {
  const items = new Map([
    [
      'job-done',
      {
        jobId: 'job-done',
        recordType: 'job',
        status: 'Complete',
        bucket,
        reportPrefix: 'reports/',
        objectCount: 2,
        tags: { environment: 'test' },
        manifestKey: 'manifests/demo.csv',
        createdAt: '2026-09-22T15:00:00.000Z',
      },
    ],
  ]);
  const files = new Map([
    ['reports//job-job-done/manifest.json', manifest('reports/job-job-done/results/tasks.csv')],
    ['reports/job-job-done/results/tasks.csv', `${successLine}\n${failedLine}\n`],
  ]);

  const status = await getBatchJobStatus('job-done', {
    roleArn,
    bucket,
    tableName: 'RetaggingJobs',
    reportPrefix: 'reports/',
    s3Client: {
      async send(command) {
        if (command instanceof GetObjectTaggingCommand) {
          return { TagSet: [{ Key: 'environment', Value: 'test' }] };
        }
        const text = files.get(command.input.Key);
        if (text === undefined) throw notFound();
        return { Body: textBody(text) };
      },
    },
    s3ControlClient: {
      async send() {
        return {
          Job: {
            Status: 'Complete',
            ProgressSummary: { TotalNumberOfTasks: 2, NumberOfTasksSucceeded: 2, NumberOfTasksFailed: 0 },
            CreationTime: new Date('2026-09-22T15:00:00.000Z'),
          },
        };
      },
    },
    dynamoClient: {
      async send(command) {
        if (command instanceof GetCommand) return { Item: items.get(command.input.Key.jobId) };
        if (command instanceof PutCommand) {
          items.set(command.input.Item.jobId, command.input.Item);
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    },
  });

  assert.equal(status.status, 'Complete');
  assert.equal(status.progressSummary.numberOfTasksSucceeded, 2);
  assert.equal(status.resultSummary.succeeded, 1);
  assert.equal(status.resultSummary.failed, 1);
  assert.equal(status.results[0].key, 'test/atlas-credentials (3).env');
  assert.equal(JSON.stringify(status).includes(roleArn), false);
  assert.equal(JSON.stringify(status).includes('AWS_SECRET'), false);
});

test('a reports/ prefix loads reports//job- and the exact manifest results key', async () => {
  const jobId = '457d2a86-1809-40b4-acb1-3ab254f62558';
  const manifestKey = `reports//job-${jobId}/manifest.json`;
  const resultsKey = `reports//job-${jobId}/results/e6635bd0bae04bb52f7d506b958cb83dceb4b35a.csv`;
  const csv = [
    's3-retagging-866731631203,test/atlas-credentials+%284%29.env,,succeeded,200,,Successful',
    's3-retagging-866731631203,test/atlas-credentials+%283%29.env,,succeeded,200,,Successful',
    '',
  ].join('\n');
  const files = new Map([
    [manifestKey, manifest(resultsKey)],
    [resultsKey, csv],
  ]);
  const objectKeys = [];
  const tagging = [];

  const items = new Map([
    [
      jobId,
      {
        jobId,
        recordType: 'job',
        status: 'Complete',
        bucket,
        reportPrefix: 'stale/',
        objectCount: 2,
        tags: { environment: 'test' },
        manifestKey: 'manifests/demo.csv',
        createdAt: '2026-09-27T07:00:00.000Z',
      },
    ],
  ]);

  const status = await getBatchJobStatus(jobId, {
    roleArn,
    bucket,
    tableName: 'RetaggingJobs',
    reportPrefix: 'reports/',
    s3Client: {
      async send(command) {
        if (command instanceof GetObjectTaggingCommand) {
          tagging.push(command.input.Key);
          return { TagSet: [{ Key: 'environment', Value: 'test' }] };
        }
        assert.ok(command instanceof GetObjectCommand);
        objectKeys.push(command.input.Key);
        const text = files.get(command.input.Key);
        if (text === undefined) throw notFound();
        return { Body: textBody(text) };
      },
    },
    s3ControlClient: {
      async send(command) {
        assert.ok(command instanceof DescribeJobCommand);
        return {
          Job: {
            Status: 'Complete',
            ProgressSummary: { TotalNumberOfTasks: 2, NumberOfTasksSucceeded: 2, NumberOfTasksFailed: 0 },
            CreationTime: new Date('2026-09-27T07:00:00.000Z'),
            Report: {
              Bucket: `arn:aws:s3:::${bucket}`,
              Enabled: true,
              Format: 'Report_CSV_20180820',
              Prefix: 'reports/',
              ReportScope: 'AllTasks',
            },
          },
        };
      },
    },
    dynamoClient: {
      async send(command) {
        if (command instanceof GetCommand) return { Item: items.get(command.input.Key.jobId) };
        if (command instanceof PutCommand) {
          items.set(command.input.Item.jobId, command.input.Item);
          return {};
        }
        throw new Error('Unexpected DynamoDB command');
      },
    },
  });

  assert.deepEqual(objectKeys, [manifestKey, resultsKey]);
  assert.equal(status.report.available, true);
  assert.equal(status.report.manifestKey, manifestKey);
  assert.equal(status.report.files[0].key, resultsKey);
  assert.equal(status.resultSummary.total, 2);
  assert.equal(status.resultSummary.succeeded, 2);
  assert.equal(status.resultSummary.failed, 0);
  assert.equal(status.resultSummary.fromReport, true);
  assert.equal(status.results[0].key, 'test/atlas-credentials (4).env');
  assert.equal(status.results[0].taskStatus, 'succeeded');
  assert.equal(status.results[0].httpStatusCode, '200');
  assert.equal(status.results[0].errorCode, '');
  assert.deepEqual(status.results[0].actualTags, { environment: 'test' });
  assert.equal(status.results[0].actualTagsRetrieved, true);
  assert.equal(status.results[1].key, 'test/atlas-credentials (3).env');
  assert.equal(status.results[1].httpStatusCode, '200');
  assert.deepEqual(tagging.slice().sort(), [
    'test/atlas-credentials (3).env',
    'test/atlas-credentials (4).env',
  ]);
  assert.equal(JSON.stringify(status).includes('reports/job-'), false);
});

test('report loading does not call object-level PutObjectTagging', () => {
  const source = fs.readFileSync(new URL('../src/services/report.service.js', import.meta.url), 'utf8');
  assert.equal(source.includes('PutObjectTaggingCommand'), false);
  assert.ok(source.includes('GetObjectTaggingCommand'));
  assert.ok(source.includes('GetObjectCommand'));
});
