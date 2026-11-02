import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runStage, spokenUnits } from '../lib/gates.mjs';
import { loadProject } from '../lib/project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = join(ROOT, 'examples', 'night-pharmacist');

function sample() {
  return structuredClone(loadProject(SAMPLE).data);
}

function gatesOf(findings, level) {
  return new Set(findings.filter((f) => !level || f.level === level).map((f) => f.gate));
}

test('sample project passes every stage with no findings', () => {
  const data = sample();
  for (const stage of ['project', 'outline', 'script']) {
    assert.deepEqual(runStage(stage, data), [], stage);
  }
});

// One counter-example per gate: [gate, stage, level, mutate(data)].
const CASES = [
  ['X0', 'script', 'error', (d) => { delete d.script; }],
  ['X1', 'script', 'error', (d) => { d.outline.episodes = []; }],
  ['P1', 'project', 'error', (d) => { d.project.format.aspectRatio = '2:1'; }],
  ['P2', 'project', 'error', (d) => { d.project.format.episodeSeconds = { min: 90, max: 30 }; }],
  ['O1', 'outline', 'error', (d) => { d.outline.characters[0].role = 'hero'; }],
  ['O2', 'outline', 'error', (d) => { d.outline.locations.push({ ...d.outline.locations[0] }); }],
  ['O3', 'outline', 'error', (d) => { d.outline.episodes[1].number = 5; }],
  ['O4', 'outline', 'error', (d) => { d.project.format.episodes = 4; }],
  ['O5', 'outline', 'error', (d) => { d.outline.episodes[0].characters.push('ghost'); }],
  ['O6', 'outline', 'error', (d) => { d.outline.episodes[0].hook.cliffhanger = '  '; }],
  ['O7', 'outline', 'error', (d) => { d.outline.characters[0].role = 'supporting'; }],
  ['O8', 'outline', 'warn', (d) => { d.outline.episodes.forEach((e) => { e.characters = e.characters.filter((c) => c !== 'zhou-xu'); }); }],
  ['S1', 'script', 'error', (d) => { d.script.episodes[0].scenes[0].beats[0].type = 'music'; }],
  ['S2', 'script', 'error', (d) => { d.script.episodes.pop(); }],
  ['S3', 'script', 'error', (d) => { d.script.episodes[1].scenes[0].id = 'e1-counter'; }],
  ['S4', 'script', 'error', (d) => { d.script.episodes[0].scenes[0].locationId = 'rooftop'; }],
  ['S5', 'script', 'error', (d) => { d.script.episodes[0].scenes[1].characters.push('ghost'); }],
  ['S6', 'script', 'error', (d) => { delete d.script.episodes[0].scenes[0].beats[2].characterId; }],
  ['S7', 'script', 'error', (d) => { d.project.format.episodeSeconds = { min: 60, max: 90 }; }],
  ['S8', 'script', 'warn', (d) => { d.script.episodes[0].scenes[1].characters.push('zhou-xu'); }],
];

for (const [gate, stage, level, mutate] of CASES) {
  test(`${gate} fires on its counter-example`, () => {
    const data = sample();
    mutate(data);
    const findings = runStage(stage, data);
    assert.ok(gatesOf(findings, level).has(gate), JSON.stringify(findings, null, 2));
  });
}

test('X1 reports upstream instead of crashing when project is invalid', () => {
  const data = sample();
  data.project.format = 'bad';
  assert.deepEqual([...gatesOf(runStage('script', data))], ['X1']);
});

test('spokenUnits ignores punctuation and spaces', () => {
  assert.equal(spokenUnits('止咳水，六瓶。', 'zh'), 5);
  assert.equal(spokenUnits('Six bottles, please.', 'en'), 3);
});

test('every gate in lib/gates.mjs is documented in pipeline.md and covered by a counter-example', () => {
  const source = readFileSync(join(ROOT, 'lib', 'gates.mjs'), 'utf8');
  const emitted = new Set([...source.matchAll(/'([A-Z]\d)'/g)].map((m) => m[1]));
  const doc = readFileSync(join(ROOT, 'skills', 'drama', 'references', 'pipeline.md'), 'utf8');
  const covered = new Set([...CASES.map((c) => c[0]), 'X2']);
  for (const gate of emitted) {
    assert.match(doc, new RegExp(`\\| ${gate} \\|`), `${gate} missing from pipeline.md`);
    assert.ok(covered.has(gate), `${gate} has no counter-example`);
  }
});
