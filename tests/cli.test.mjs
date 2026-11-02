import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DH = join(ROOT, 'bin', 'dh.mjs');
const SAMPLE = join(ROOT, 'examples', 'night-pharmacist');

function dh(...args) {
  const r = spawnSync(process.execPath, [DH, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dh-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('validate all passes on the sample project', () => {
  const r = dh('validate', 'all', '--project', SAMPLE);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /PASS/);
});

test('validate --json is machine readable', () => {
  const r = dh('validate', 'all', '--project', SAMPLE, '--json');
  const body = JSON.parse(r.out);
  assert.equal(body.pass, true);
  assert.deepEqual(body.stages, ['project', 'outline', 'script']);
});

test('validate exits 1 on a broken copy of the sample', () => withTemp((dir) => {
  cpSync(SAMPLE, dir, { recursive: true });
  const file = join(dir, 'outline.json');
  const outline = JSON.parse(readFileSync(file, 'utf8'));
  outline.episodes[0].characters.push('ghost');
  writeFileSync(file, JSON.stringify(outline));
  const r = dh('validate', 'outline', '--project', dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR O5/);
}));

test('unparseable stage file is X2 and exits 1', () => withTemp((dir) => {
  cpSync(SAMPLE, dir, { recursive: true });
  writeFileSync(join(dir, 'script.json'), '{ not json');
  const r = dh('validate', 'all', '--project', dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /X2/);
}));

test('broken downstream file does not block validating upstream stages', () => withTemp((dir) => {
  cpSync(SAMPLE, dir, { recursive: true });
  writeFileSync(join(dir, 'script.json'), '{ not json');
  assert.equal(dh('validate', 'project', '--project', dir).code, 0);
  assert.equal(dh('validate', 'outline', '--project', dir).code, 0);
  assert.equal(dh('validate', 'script', '--project', dir).code, 1);
}));

test('init refuses options the contract rejects and writes nothing', () => withTemp((dir) => {
  const target = join(dir, 'too-long');
  const r = dh('init', target, '--episodes', '201');
  assert.equal(r.code, 2);
  assert.match(r.err, /episodes/);
  assert.equal(existsSync(target), false);
}));

test('init creates a project that passes the project gate', () => withTemp((dir) => {
  const target = join(dir, 'new-drama');
  const init = dh('init', target, '--title', '测试剧', '--episodes', '5', '--source', 'novel');
  assert.equal(init.code, 0, init.err);
  assert.equal(dh('validate', 'project', '--project', target).code, 0);
  const status = JSON.parse(dh('status', '--project', target, '--json').out);
  assert.equal(status.next.skill, 'drama-adapt');
  assert.equal(dh('init', target).code, 2, 'second init on same dir must refuse');
}));

test('usage errors exit 2', () => {
  assert.equal(dh().code, 2);
  assert.equal(dh('nope').code, 2);
  assert.equal(dh('validate').code, 2);
  assert.equal(dh('validate', 'bogus', '--project', SAMPLE).code, 2);
  assert.equal(dh('validate', 'all', '--project', ROOT).code, 2, 'repo root has no project.json');
  assert.equal(dh('init', 'x', '--episodes', '0').code, 2);
  assert.equal(dh('validate', 'all', '--unknown-flag').code, 2);
});

test('status routes the sample to the asset stage', () => {
  const status = JSON.parse(dh('status', '--project', SAMPLE, '--json').out);
  assert.deepEqual(status.stages.map((s) => s.state), ['pass', 'pass', 'pass']);
  assert.equal(status.durations.length, 3);
  assert.match(status.next.skill, /drama-cast/);
});

test('doctor reports without failing on missing optional tools', () => {
  const r = dh('doctor', '--json');
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).pass, true);
});
