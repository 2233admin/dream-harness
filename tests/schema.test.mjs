import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadContract, validate } from '../lib/schema.mjs';

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts');

test('every contract loads and uses only supported keywords', () => {
  for (const file of readdirSync(CONTRACTS)) {
    const schema = loadContract(file.replace('.schema.json', ''));
    // Walking an empty object visits the root keywords; nested keywords are checked by the sample tests.
    assert.doesNotThrow(() => validate(schema, {}), file);
  }
});

test('reports path and message for nested errors', () => {
  const schema = {
    type: 'object',
    required: ['items'],
    properties: { items: { type: 'array', items: { $ref: '#/$defs/item' } } },
    $defs: { item: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', pattern: '^[a-z]+$' } } } },
  };
  assert.deepEqual(validate(schema, { items: [{ id: 'ok' }] }), []);
  const errors = validate(schema, { items: [{ id: 'Bad' }, { extra: 1 }] });
  assert.deepEqual(errors.map((e) => e.path), ['/items/0/id', '/items/1', '/items/1/extra']);
});

test('integer is a number but number is not an integer', () => {
  assert.deepEqual(validate({ type: 'number' }, 3), []);
  assert.equal(validate({ type: 'integer' }, 3.5).length, 1);
});

test('unsupported keyword throws instead of passing silently', () => {
  assert.throws(() => validate({ oneOf: [] }, 1), /unsupported schema keyword "oneOf"/);
});
