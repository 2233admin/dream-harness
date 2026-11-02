import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STAGES, runStage, spokenUnits } from '../lib/gates.mjs';
import { loadProject } from '../lib/project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = {
  idea: join(ROOT, 'examples', 'night-pharmacist'),
  novel: join(ROOT, 'examples', 'clock-repair'),
};

function sample(kind) {
  const { data } = loadProject(SAMPLES[kind]);
  const copy = structuredClone({ ...data, chapters: undefined });
  if (data.chapters) copy.chapters = new Map(data.chapters);
  return copy;
}

function gatesOf(findings, level) {
  return new Set(findings.filter((f) => !level || f.level === level).map((f) => f.gate));
}

for (const kind of Object.keys(SAMPLES)) {
  test(`${kind} sample passes every present stage; only the partial-storyboard warning remains`, () => {
    const data = sample(kind);
    for (const stage of STAGES.filter((s) => data[s] !== undefined)) {
      const expected = stage === 'storyboard' ? ['K13'] : [];
      assert.deepEqual(runStage(stage, data).map((f) => f.gate), expected, stage);
    }
  });
}

const beats = (d, ep, scene) => d.script.episodes[ep].scenes[scene].beats;
const shot = (d, seg, k) => d.storyboard.episodes[0].segments[seg].shots[k];

// One counter-example per gate: [gate, sample, stage, level, mutate(data)].
const CASES = [
  ['X0', 'idea', 'script', 'error', (d) => { delete d.script; }],
  ['X1', 'idea', 'script', 'error', (d) => { d.outline.episodes = []; }],
  ['P1', 'idea', 'project', 'error', (d) => { d.project.format.aspectRatio = '2:1'; }],
  ['P2', 'idea', 'project', 'error', (d) => { d.project.format.episodeSeconds = { min: 90, max: 30 }; }],
  ['B1', 'idea', 'bible', 'error', (d) => { d.bible = d.bible.replace(/## 核心冲突\r?\n[^#]*/u, '## 核心冲突\n（待写）\n\n'); }],
  ['B2', 'idea', 'bible', 'warn', (d) => { d.project.format.episodes = 4; }],
  ['N1', 'novel', 'source', 'error', (d) => { d.source.encoding = 'big5'; }],
  ['N2', 'novel', 'source', 'error', (d) => { d.source.chapters[1].n = 7; }],
  ['N3', 'novel', 'source', 'error', (d) => { d.chapters.set(3, d.chapters.get(3) + '多出来的字'); }],
  ['O1', 'idea', 'outline', 'error', (d) => { d.outline.characters[0].role = 'hero'; }],
  ['O2', 'idea', 'outline', 'error', (d) => { d.outline.locations.push({ ...d.outline.locations[0] }); }],
  ['O3', 'idea', 'outline', 'error', (d) => { d.outline.episodes[1].number = 5; }],
  ['O4', 'idea', 'outline', 'error', (d) => { d.project.format.episodes = 4; d.bible = d.bible.replace('3. ', '3. \n4. 补一集。'); }],
  ['O5', 'idea', 'outline', 'error', (d) => { d.outline.episodes[0].characters.push('ghost'); }],
  ['O6', 'idea', 'outline', 'error', (d) => { d.outline.episodes[0].hook.cliffhanger = '  '; }],
  ['O7', 'idea', 'outline', 'error', (d) => { d.outline.characters[0].role = 'supporting'; }],
  ['O8', 'idea', 'outline', 'warn', (d) => { d.outline.episodes.forEach((e) => { e.characters = e.characters.filter((c) => c !== 'zhou-xu'); }); }],
  ['O9', 'idea', 'outline', 'error', (d) => { d.project.rules = { maxPayoffGap: 1 }; d.outline.episodes[0].payoffs = []; d.outline.episodes[1].payoffs = []; }],
  ['O10', 'idea', 'outline', 'error', (d) => { d.outline.episodes[0].synopsis += '林晚说：「这单我不能发。」'; }],
  ['O10', 'idea', 'outline', 'error', (d) => { d.outline.episodes[0].synopsis += '林晚说："这单我不能发。"'; }],
  ['O11', 'novel', 'outline', 'error', (d) => { d.outline.adaptation.cut = []; }],
  ['O12', 'novel', 'outline', 'error', (d) => { d.outline.adaptation.keep[0].evidence = '原文里没有这一句话'; }],
  ['O13', 'novel', 'outline', 'error', (d) => { d.outline.episodes[1].source.chapters = [4, 9]; }],
  ['O14', 'novel', 'outline', 'warn', (d) => { d.outline.episodes[1].source.chapters = [1, 5]; }],
  ['O15', 'idea', 'outline', 'warn', (d) => {
    for (let i = 0; i < 6; i++) d.outline.props.push({ id: `prop-${i}`, name: `道具${i}`, summary: '测试', narrative: true });
  }],
  ['S1', 'idea', 'script', 'error', (d) => { beats(d, 0, 0)[0].type = 'music'; }],
  ['S2', 'idea', 'script', 'error', (d) => { d.script.episodes.pop(); }],
  ['S3', 'idea', 'script', 'error', (d) => { d.script.episodes[1].scenes[0].id = 'e1-counter'; }],
  ['S4', 'idea', 'script', 'error', (d) => { d.script.episodes[0].scenes[0].locationId = 'rooftop'; }],
  ['S5', 'idea', 'script', 'error', (d) => { d.script.episodes[0].scenes[1].characters.push('ghost'); }],
  ['S6', 'idea', 'script', 'error', (d) => { delete beats(d, 0, 0)[2].characterId; }],
  ['S7', 'idea', 'script', 'error', (d) => { d.project.format.episodeSeconds = { min: 60, max: 90 }; }],
  ['S8', 'idea', 'script', 'warn', (d) => { d.script.episodes[0].scenes[1].characters.push('zhou-xu'); }],
  ['S9', 'idea', 'script', 'error', (d) => { d.script.episodes[0].hookBeat = 3; }],
  ['S10', 'idea', 'script', 'error', (d) => { beats(d, 0, 0)[2].text = '止咳水六瓶'.repeat(8); }],
  ['S11', 'idea', 'script', 'error', (d) => { const s = d.script.episodes[2].scenes[1]; s.beats = s.beats.filter((b) => b.type !== 'action'); }],
  ['S12', 'idea', 'script', 'error', (d) => { beats(d, 0, 0)[1].text = '小雨拍下处方：「止咳水，六瓶。」'; }],
  ['S12', 'idea', 'script', 'error', (d) => { beats(d, 0, 0)[1].text = '小雨拍下处方："止咳水，六瓶。"'; }],
  ['S13', 'idea', 'script', 'warn', (d) => {
    for (let i = 0; i < 3; i++) beats(d, 0, 1).push({ type: 'voiceover', characterId: 'lin-wan', text: '再想一想。' });
  }],
  ['S14', 'idea', 'script', 'warn', (d) => {
    for (let i = 0; i < 5; i++) beats(d, 2, 1).push({ type: 'dialogue', characterId: 'lin-wan', text: '还有一句。' });
  }],
  ['C1', 'idea', 'cast', 'error', (d) => { d.cast.characters[0].anchors = [d.cast.characters[0].anchors[0]]; }],
  ['C2', 'idea', 'cast', 'error', (d) => { d.cast.characters.pop(); }],
  ['C3', 'idea', 'cast', 'error', (d) => { d.cast.characters[0].anchors[0].prompt = 'a red scarf'; }],
  ['C4', 'idea', 'cast', 'error', (d) => { d.cast.characters[0].voice.prompt = '清亮偏低的女声，语速偏慢'; }],
  ['C5', 'idea', 'cast', 'error', (d) => { d.cast.characters[0].imagePrompt += ', Lin Wan'; d.outline.characters[0].name = 'Lin Wan'; }],
  ['C6', 'idea', 'cast', 'error', (d) => { d.cast.characters[0].defaultOutfit = 'gown'; }],
  ['C7', 'idea', 'cast', 'warn', (d) => { delete d.cast.locked; }],
  ['A1', 'idea', 'art', 'error', (d) => { d.art.locations[0].states = []; }],
  ['A2', 'idea', 'art', 'error', (d) => { d.art.props = d.art.props.filter((p) => p.id !== 'ledger'); }],
  ['A2', 'idea', 'art', 'error', (d) => { d.art.locations[2].id = 'rooftop'; }],
  ['A3', 'idea', 'art', 'error', (d) => { d.art.era = '架空都市'; }],
  ['A4', 'idea', 'art', 'error', (d) => { d.art.locations[0].anchors[0].prompt = 'a neon sign'; }],
  ['A5', 'idea', 'art', 'error', (d) => { d.art.locations[0].states[0].prompt = '凌晨冷白灯'; }],
  ['A6', 'idea', 'art', 'error', (d) => { d.art.locations[1].imagePrompt = d.art.locations[1].imagePrompt.replace(', empty scene, no people', ', a pharmacist sorting boxes'); }],
  ['A7', 'idea', 'art', 'error', (d) => { d.art.locations[0].states.push({ ...d.art.locations[0].states[0] }); }],
  ['K1', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).size = 'giant'; }],
  ['K2', 'idea', 'storyboard', 'error', (d) => { d.storyboard.episodes[0].number = 9; }],
  ['K3', 'idea', 'storyboard', 'error', (d) => { d.storyboard.episodes[0].segments[0].sceneId = 'e2-counter'; }],
  ['K3', 'idea', 'storyboard', 'error', (d) => { const s = d.storyboard.episodes[0].segments; s.unshift(s.pop()); }],
  ['K4', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 1).beats = [3, 3]; }],
  ['K4', 'idea', 'storyboard', 'error', (d) => { d.storyboard.episodes[0].segments[3].shots.pop(); }],
  ['K5', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).seconds = 9; }],
  ['K5', 'idea', 'storyboard', 'error', (d) => { d.project.rules = { maxSegmentSeconds: 10 }; }],
  ['K6', 'idea', 'storyboard', 'error', (d) => { shot(d, 1, 0).seconds = 3; }],
  ['K7', 'idea', 'storyboard', 'error', (d) => { shot(d, 3, 0).subjects.push({ characterId: 'zhou-xu', action: '站着' }); }],
  ['K7', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).subjects[0].outfit = 'tuxedo'; }],
  ['K8', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).locationState = 'storeroom-night'; }],
  ['K8', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).props.push('umbrella'); }],
  ['K9', 'idea', 'storyboard', 'error', (d) => { delete d.cast.locked; }],
  ['K10', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).frame = '凌晨的药店，一个少年推门进来'; }],
  ['K11', 'idea', 'storyboard', 'error', (d) => { shot(d, 0, 0).body += '，林晚抬起头'; }],
  ['K12', 'idea', 'storyboard', 'warn', (d) => { shot(d, 0, 0).subjects = []; }],
  ['K13', 'idea', 'storyboard', 'warn', () => {}],
];

for (const [gate, kind, stage, level, mutate] of CASES) {
  test(`${gate} fires on its counter-example`, () => {
    const data = sample(kind);
    mutate(data);
    const findings = runStage(stage, data);
    assert.ok(gatesOf(findings, level).has(gate), JSON.stringify(findings, null, 2));
  });
}

test('X1 reports upstream instead of crashing when project is invalid', () => {
  const data = sample('idea');
  data.project.format = 'bad';
  assert.deepEqual([...gatesOf(runStage('script', data))], ['X1']);
});

test('idea outline is blocked by an unfinished bible; novel outline by a broken source', () => {
  const idea = sample('idea');
  idea.bible = '# 故事设定\n';
  assert.deepEqual([...gatesOf(runStage('outline', idea))], ['X1']);
  const novel = sample('novel');
  novel.chapters.delete(2);
  assert.deepEqual([...gatesOf(runStage('outline', novel))], ['X1']);
});

test('spokenUnits ignores punctuation and spaces', () => {
  assert.equal(spokenUnits('止咳水，六瓶。', 'zh'), 5);
  assert.equal(spokenUnits('Six bottles, please.', 'en'), 3);
});

test('every gate emitted by lib/ is documented in pipeline.md and covered by a counter-example', () => {
  const source = ['gates.mjs', 'project.mjs'].map((f) => readFileSync(join(ROOT, 'lib', f), 'utf8')).join('\n');
  const emitted = new Set([...source.matchAll(/'([A-Z]\d+)'/g)].map((m) => m[1]));
  const doc = readFileSync(join(ROOT, 'skills', 'drama', 'references', 'pipeline.md'), 'utf8');
  const documented = new Set([...doc.matchAll(/^\| ([A-Z]\d+) \|/gm)].map((m) => m[1]));
  const covered = new Set([...CASES.map((c) => c[0]), 'X2']);
  for (const gate of emitted) {
    assert.ok(documented.has(gate), `${gate} missing from pipeline.md`);
    assert.ok(covered.has(gate), `${gate} has no counter-example`);
  }
  for (const gate of documented) assert.ok(emitted.has(gate), `${gate} documented but never emitted`);
});

test('A3 rejects vague eras but accepts named periods', () => {
  for (const era of ['架空都市', '古代', 'historical setting', 'Ancient times', 'a fictional world', 'modern city']) {
    const d = sample('idea');
    d.art.era = era;
    assert.ok(gatesOf(runStage('art', d), 'error').has('A3'), era);
  }
  for (const era of ['Edo period, 1800s Kyoto, Japan', 'Ancient Rome, 1st century AD', '明代江南', '民国上海', '1990s Hong Kong']) {
    const d = sample('idea');
    d.art.era = era;
    assert.ok(!gatesOf(runStage('art', d)).has('A3'), era);
  }
});
