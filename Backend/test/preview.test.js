import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { buildPreview } from '../src/services/preview.service.js';

const testRule = {
  name: 'Test Environment',
  logic: 'AND',
  conditions: [{ field: 'key', operator: 'starts_with', value: 'test/' }],
  actions: [{ type: 'SET_TAG', key: 'environment', value: 'test' }],
};

const productionRule = {
  name: 'Production Environment',
  logic: 'AND',
  conditions: [{ field: 'key', operator: 'starts_with', value: 'test/' }],
  actions: [{ type: 'SET_TAG', key: 'environment', value: 'production' }],
};

function object(key) {
  return {
    bucket: 's3-retagging-866731631203',
    key,
    size: 358,
    contentType: 'text/plain',
    lastModified: '2026-09-22T08:24:52.000Z',
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

test('two matching objects both receive the proposed tag', () => {
  const preview = buildPreview(
    [object('test/atlas-credentials (3).env'), object('test/atlas-credentials (4).env')],
    [testRule]
  );

  assert.equal(preview.summary.totalObjects, 2);
  assert.equal(preview.summary.matchedObjects, 2);
  assert.equal(preview.summary.unchangedObjects, 0);
  assert.equal(preview.summary.totalTagsToApply, 2);
  assert.equal(preview.currentTagsRetrieved, false);
  for (const item of preview.objects) {
    assert.deepEqual(item.currentTags, []);
    assert.deepEqual(item.proposedTags, { environment: 'test' });
    assert.deepEqual(item.matchedRules, ['Test Environment']);
    assert.equal(item.status, 'MATCHED');
  }
});

test('only the matching object gets a proposed tag', () => {
  const preview = buildPreview([object('test/file.txt'), object('docs/file.txt')], [testRule]);
  assert.equal(preview.objects[0].status, 'MATCHED');
  assert.equal(preview.objects[1].status, 'UNCHANGED');
  assert.deepEqual(preview.objects[1].proposedTags, {});
  assert.equal(preview.summary.matchedObjects, 1);
  assert.equal(preview.summary.unchangedObjects, 1);
});

test('multiple rules combine distinct tags', () => {
  const ownerRule = {
    name: 'Owner',
    logic: 'AND',
    conditions: [{ field: 'extension', operator: 'equals', value: '.env' }],
    actions: [{ type: 'SET_TAG', key: 'owner', value: 'platform' }],
  };
  const preview = buildPreview([object('test/config.env')], [testRule, ownerRule]);
  assert.deepEqual(preview.objects[0].proposedTags, { environment: 'test', owner: 'platform' });
  assert.deepEqual(preview.objects[0].conflicts, []);
  assert.equal(preview.summary.totalTagsToApply, 2);
});

test('the same tag value from two rules is not a conflict', () => {
  const duplicate = {
    ...testRule,
    name: 'Test Environment Copy',
  };
  const preview = buildPreview([object('test/file.txt')], [testRule, duplicate]);
  assert.deepEqual(preview.objects[0].proposedTags, { environment: 'test' });
  assert.deepEqual(preview.objects[0].conflicts, []);
  assert.equal(preview.objects[0].status, 'MATCHED');
});

test('different values for one tag are a conflict with no winner', () => {
  const preview = buildPreview([object('test/file.txt')], [testRule, productionRule]);
  assert.deepEqual(preview.objects[0].proposedTags, {});
  assert.deepEqual(preview.objects[0].conflicts, [
    { key: 'environment', values: ['test', 'production'] },
  ]);
  assert.equal(preview.objects[0].status, 'CONFLICT');
  assert.equal(preview.summary.conflictedObjects, 1);
  assert.equal(preview.summary.totalTagsToApply, 0);
});

test('preview HTTP endpoint rejects empty objects and empty rules and does not need AWS', async () => {
  await withServer(async (baseUrl) => {
    const emptyObjects = await fetch(`${baseUrl}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: [], rules: [testRule] }),
    });
    assert.equal(emptyObjects.status, 400);
    assert.equal((await emptyObjects.json()).error.code, 'INVALID_OBJECTS');

    const emptyRules = await fetch(`${baseUrl}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: [object('test/file.txt')], rules: [] }),
    });
    assert.equal(emptyRules.status, 400);
    assert.equal((await emptyRules.json()).error.code, 'INVALID_RULES');

    const ok = await fetch(`${baseUrl}/api/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects: [object('test/file.txt')], rules: [testRule] }),
    });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.objects[0].proposedTags.environment, 'test');
    assert.equal(JSON.stringify(body).includes('AWS_SECRET'), false);
  });
});

test('preview service does not reference AWS mutation APIs', () => {
  const source = fs.readFileSync(new URL('../src/services/preview.service.js', import.meta.url), 'utf8');
  assert.equal(source.includes('@aws-sdk'), false);
  assert.equal(source.includes('PutObjectTagging'), false);
  assert.equal(source.includes('CreateJob'), false);
  assert.equal(source.includes('GetObject'), false);
});
