import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { createApp } from '../src/app.js';
import { validateObject, validateObjects } from '../src/services/object.service.js';

function awsError(name, statusCode) {
  const error = new Error(name);
  error.name = name;
  error.$metadata = { httpStatusCode: statusCode };
  return error;
}

function fakeS3(send) {
  return { send };
}

function validHeadResponse() {
  return {
    ContentLength: 12345,
    ContentType: 'text/plain',
    LastModified: new Date('2026-09-22T10:00:00.000Z'),
    ETag: '"abc123"',
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

test('existing object is VALID and uses HeadObject', async () => {
  let command;
  const s3 = fakeS3(async (nextCommand) => {
    command = nextCommand;
    return validHeadResponse();
  });

  const result = await validateObject('my-bucket', 'file1.txt', s3);

  assert.ok(command instanceof HeadObjectCommand);
  assert.equal(command.input.Bucket, 'my-bucket');
  assert.equal(command.input.Key, 'file1.txt');
  assert.deepEqual(result, {
    bucket: 'my-bucket',
    key: 'file1.txt',
    exists: true,
    status: 'VALID',
    size: 12345,
    contentType: 'text/plain',
    lastModified: '2026-09-22T10:00:00.000Z',
    etag: '"abc123"',
  });
});

test('missing object is NOT_FOUND', async () => {
  const s3 = fakeS3(async () => {
    throw awsError('NotFound', 404);
  });

  const result = await validateObject('my-bucket', 'missing.txt', s3);
  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.exists, false);
  assert.equal(result.reason, 'Object does not exist');
});

test('access denied stays ACCESS_DENIED', async () => {
  const s3 = fakeS3(async () => {
    throw awsError('AccessDenied', 403);
  });

  const result = await validateObject('private-bucket', 'secret.pdf', s3);
  assert.equal(result.status, 'ACCESS_DENIED');
  assert.equal(result.exists, null);
  assert.equal(result.reason, 'Access denied while checking the object');
});

test('one failure does not stop the other objects', async () => {
  const seen = [];
  const s3 = fakeS3(async (command) => {
    seen.push(command.input.Key);
    if (command.input.Key === 'missing.txt') throw awsError('NoSuchKey', 404);
    if (command.input.Key === 'secret.pdf') throw awsError('AccessDenied', 403);
    if (command.input.Key === 'broken.txt') throw awsError('InternalError', 500);
    return validHeadResponse();
  });

  const result = await validateObjects(
    [
      { bucket: 'my-bucket', key: 'file1.txt' },
      { bucket: 'my-bucket', key: 'missing.txt' },
      { bucket: 'private-bucket', key: 'secret.pdf' },
      { bucket: 'my-bucket', key: 'broken.txt' },
    ],
    { s3Client: s3, concurrency: 2 }
  );

  assert.deepEqual(seen.sort(), ['broken.txt', 'file1.txt', 'missing.txt', 'secret.pdf']);
  assert.equal(result.total, 4);
  assert.equal(result.valid, 1);
  assert.equal(result.invalid, 3);
  assert.deepEqual(
    result.objects.map((object) => object.status),
    ['VALID', 'NOT_FOUND', 'ACCESS_DENIED', 'ERROR']
  );
});

test('HeadObject calls stay within the concurrency limit', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const s3 = fakeS3(async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 15));
    inFlight -= 1;
    return validHeadResponse();
  });

  const objects = Array.from({ length: 12 }, (_, index) => ({
    bucket: 'my-bucket',
    key: `file-${index}.txt`,
  }));

  const result = await validateObjects(objects, { s3Client: s3, concurrency: 5 });
  assert.equal(maxInFlight, 5);
  assert.equal(result.valid, 12);
});

test('HTTP validation rejects an empty object list', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/objects/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: [] }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_OBJECTS');
  });
});

test('HTTP validation rejects a missing bucket', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/objects/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: [{ key: 'file.txt' }] }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_OBJECTS');
  });
});

test('HTTP validation rejects a missing key', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/objects/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: [{ bucket: 'my-bucket' }] }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'INVALID_OBJECTS');
  });
});

test('HTTP validation rejects lists above MAX_CSV_OBJECTS', async () => {
  await withServer(async (baseUrl) => {
    const objects = Array.from({ length: 10001 }, (_, index) => ({
      bucket: 'my-bucket',
      key: `file-${index}.txt`,
    }));
    const response = await fetch(`${baseUrl}/api/objects/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'CSV_OBJECT_LIMIT');
  });
});

test('health endpoint still works', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(JSON.stringify(body).includes('secret'), false);
  });
});

test('CSV upload still accepts a valid file', async () => {
  await withServer(async (baseUrl) => {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['bucket,key\nmy-bucket,file1.txt\nmy-bucket,file2.pdf\n'], { type: 'text/csv' }),
      'objects.csv'
    );
    const response = await fetch(`${baseUrl}/api/upload/csv`, { method: 'POST', body: form });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.objectCount, 2);
  });
});

test('unknown routes still return 404', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/nope`);
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.success, false);
  });
});
