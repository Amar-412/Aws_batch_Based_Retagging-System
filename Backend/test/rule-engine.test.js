import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import {
  evaluateCondition,
  evaluateRule,
  extensionFromKey,
  generateTags,
  validateRule,
} from '../src/services/rule.service.js';

const financeRule = {
  name: 'Finance Documents',
  logic: 'AND',
  conditions: [
    { field: 'key', operator: 'contains', value: 'finance/' },
    { field: 'extension', operator: 'equals', value: '.pdf' },
  ],
  actions: [
    { type: 'SET_TAG', key: 'Department', value: 'Finance' },
    { type: 'SET_TAG', key: 'Classification', value: 'Confidential' },
  ],
};

function pdfObject(key, extra = {}) {
  return { bucket: 'my-bucket', key, size: 20000, lastModified: '2026-09-22T10:00:00.000Z', ...extra };
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

test('extension is derived from the file name', () => {
  assert.equal(extensionFromKey('finance/report.pdf'), '.pdf');
  assert.equal(extensionFromKey('images/photo.jpg'), '.jpg');
  assert.equal(extensionFromKey('data.csv'), '.csv');
  assert.equal(extensionFromKey('README'), '');
  assert.equal(extensionFromKey('docs/.gitignore'), '');
});

test('key contains matches only when the text is present', () => {
  const condition = { field: 'key', operator: 'contains', value: 'finance/' };
  assert.equal(evaluateCondition(pdfObject('finance/report.pdf'), condition), true);
  assert.equal(evaluateCondition(pdfObject('hr/report.pdf'), condition), false);
});

test('extension equals .pdf', () => {
  const condition = { field: 'extension', operator: 'equals', value: '.pdf' };
  assert.equal(evaluateCondition(pdfObject('finance/report.pdf'), condition), true);
  assert.equal(evaluateCondition({ bucket: 'my-bucket', key: 'finance/notes.txt' }, condition), false);
});

test('AND requires every condition', () => {
  assert.equal(evaluateRule(pdfObject('finance/report.pdf'), financeRule), true);
  assert.equal(evaluateRule(pdfObject('finance/report.jpg'), financeRule), false);
});

test('OR matches when one condition is true', () => {
  const rule = {
    name: 'Documents',
    logic: 'OR',
    conditions: [
      { field: 'extension', operator: 'equals', value: '.pdf' },
      { field: 'extension', operator: 'equals', value: '.docx' },
    ],
    actions: [{ type: 'SET_TAG', key: 'DocumentType', value: 'Document' }],
  };
  assert.equal(evaluateRule(pdfObject('hr/report.docx'), rule), true);
  assert.equal(evaluateRule({ bucket: 'my-bucket', key: 'images/photo.jpg' }, rule), false);
});

test('size greater_than and less_than', () => {
  const object = pdfObject('finance/report.pdf', { size: 15000 });
  assert.equal(
    evaluateCondition(object, { field: 'size', operator: 'greater_than', value: 10000 }),
    true
  );
  assert.equal(
    evaluateCondition(object, { field: 'size', operator: 'less_than', value: 10000 }),
    false
  );
  assert.equal(
    evaluateCondition(object, { field: 'size', operator: 'less_than', value: 20000 }),
    true
  );
});

test('multiple rules contribute their tags', () => {
  const second = {
    name: 'PDF Documents',
    logic: 'AND',
    conditions: [{ field: 'extension', operator: 'equals', value: '.pdf' }],
    actions: [{ type: 'SET_TAG', key: 'DocumentType', value: 'PDF' }],
  };
  const result = generateTags(pdfObject('finance/report.pdf'), [financeRule, second]);
  assert.deepEqual(result.matchedRules, ['Finance Documents', 'PDF Documents']);
  assert.deepEqual(result.tags, {
    Department: 'Finance',
    Classification: 'Confidential',
    DocumentType: 'PDF',
  });
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.status, 'MATCH');
});

test('tag conflicts are reported without choosing a value', () => {
  const archive = {
    name: 'Finance Archive',
    logic: 'AND',
    conditions: [{ field: 'key', operator: 'contains', value: 'finance/archive/' }],
    actions: [{ type: 'SET_TAG', key: 'Department', value: 'Archive' }],
  };
  const finance = {
    name: 'Finance Documents',
    logic: 'AND',
    conditions: [{ field: 'key', operator: 'contains', value: 'finance/' }],
    actions: [{ type: 'SET_TAG', key: 'Department', value: 'Finance' }],
  };
  const result = generateTags(pdfObject('finance/archive/report.pdf'), [finance, archive]);
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.tags.Department, undefined);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].values, ['Finance', 'Archive']);
  assert.deepEqual(result.conflicts[0].rules, ['Finance Documents', 'Finance Archive']);
});

test('invalid, empty, and actionless rules fail validation', () => {
  const badOperator = validateRule({
    ...financeRule,
    conditions: [{ field: 'size', operator: 'contains', value: '10' }],
  });
  assert.equal(badOperator.valid, false);

  const emptyCondition = validateRule({
    ...financeRule,
    conditions: [{ field: 'key', operator: 'contains', value: '   ' }],
  });
  assert.equal(emptyCondition.valid, false);
  assert.ok(emptyCondition.errors.some((error) => error.includes('missing a value')));

  const missingAction = validateRule({ ...financeRule, actions: [] });
  assert.equal(missingAction.valid, false);
  assert.ok(missingAction.errors.some((error) => error.includes('tag action')));
});

test('invalid S3 tag characters are rejected', () => {
  const result = validateRule({
    ...financeRule,
    actions: [{ type: 'SET_TAG', key: 'Department', value: 'Finance!' }],
  });
  assert.equal(result.valid, false);
});

test('rule HTTP endpoints validate and evaluate without AWS', async () => {
  await withServer(async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal((await health.json()).data.status, 'ok');

    const valid = await fetch(`${baseUrl}/api/rules/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: financeRule }),
    });
    const validBody = await valid.json();
    assert.equal(valid.status, 200);
    assert.equal(validBody.data.valid, true);

    const invalid = await fetch(`${baseUrl}/api/rules/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: { ...financeRule, actions: [] } }),
    });
    const invalidBody = await invalid.json();
    assert.equal(invalid.status, 400);
    assert.equal(invalidBody.error.code, 'INVALID_RULE');

    const evaluated = await fetch(`${baseUrl}/api/rules/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object: pdfObject('finance/report.pdf'),
        rules: [financeRule],
      }),
    });
    const evaluatedBody = await evaluated.json();
    assert.equal(evaluated.status, 200);
    assert.deepEqual(evaluatedBody.data.matchedRules, ['Finance Documents']);
    assert.equal(evaluatedBody.data.tags.Department, 'Finance');

    const batch = await fetch(`${baseUrl}/api/rules/evaluate-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objects: [pdfObject('finance/report.pdf'), pdfObject('hr/report.pdf')],
        rules: [financeRule],
      }),
    });
    const batchBody = await batch.json();
    assert.equal(batch.status, 200);
    assert.equal(batchBody.data.total, 2);
    assert.equal(batchBody.data.matched, 1);
    assert.equal(batchBody.data.unmatched, 1);
    assert.equal(batchBody.data.results[1].status, 'NO_MATCH');
  });
});
