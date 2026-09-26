import assert from 'node:assert/strict';
import test from 'node:test';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { buildManifestCsv, encodeManifestObjectKey, uploadManifest } from '../src/services/manifest.service.js';

const bucket = 's3-retagging-866731631203';

test('manifest rows use the bucket ARN and a URL-encoded key', () => {
  const csv = buildManifestCsv([
    { bucket, key: 'test/atlas-credentials (3).env' },
    { bucket, key: 'test/atlas-credentials (4).env' },
  ]);

  assert.equal(
    csv,
    [
      'arn:aws:s3:::s3-retagging-866731631203,test/atlas-credentials%20(3).env',
      'arn:aws:s3:::s3-retagging-866731631203,test/atlas-credentials%20(4).env',
      '',
    ].join('\n')
  );
  assert.equal(csv.includes('environment'), false);
  assert.equal(csv.includes('SET_TAG'), false);
});

test('special characters in object keys are encoded without hiding the path', () => {
  assert.equal(encodeManifestObjectKey('test/atlas-credentials (3).env'), 'test/atlas-credentials%20(3).env');

  const csv = buildManifestCsv([{ bucket, key: 'folder/a,b "quote".txt' }]);
  assert.equal(csv, 'arn:aws:s3:::s3-retagging-866731631203,"folder/a,b%20%22quote%22.txt"\n');
});

test('manifest upload uses PutObject and keeps the response ETag', async () => {
  let command;
  const s3Client = {
    async send(next) {
      command = next;
      return { ETag: '"manifest-etag"' };
    },
  };

  const stored = await uploadManifest({
    bucket,
    key: 'manifests/workflow.csv',
    body: 'arn:aws:s3:::s3-retagging-866731631203,test/file.txt\n',
    s3Client,
  });

  assert.ok(command instanceof PutObjectCommand);
  assert.equal(command.input.Bucket, bucket);
  assert.equal(command.input.Key, 'manifests/workflow.csv');
  assert.equal(command.input.ContentType, 'text/csv');
  assert.equal(stored.etag, '"manifest-etag"');
  assert.equal(stored.objectArn, 'arn:aws:s3:::s3-retagging-866731631203/manifests/workflow.csv');
});
