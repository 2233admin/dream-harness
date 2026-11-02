import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodeNovel, importNovel, splitChapters } from '../lib/project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOVEL_SAMPLE = join(ROOT, 'examples', 'clock-repair');

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dh-import-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('splits by chapter headings and keeps text before the first heading as 序', () => {
  const { splitBy, chapters } = splitChapters('书名\n\n第一章 开始\n正文一\n第2章 继续\n正文二\nChapter 3 End\ntext');
  assert.equal(splitBy, 'heading');
  assert.deepEqual(chapters.map((c) => c.title), ['序', '第一章 开始', '第2章 继续', 'Chapter 3 End']);
  assert.equal(chapters[1].text, '正文一');
});

test('falls back to fixed-size chunks when no headings are found', () => {
  const { splitBy, chapters } = splitChapters('字'.repeat(12000));
  assert.equal(splitBy, 'size');
  assert.equal(chapters.length, 3);
  assert.equal(chapters[0].text.length, 5000);
});

test('auto-detects GBK novels', () => {
  const bytes = readFileSync(join(ROOT, 'tests', 'fixtures', 'gbk-novel.txt'));
  const { text, encoding } = decodeNovel(bytes);
  assert.equal(encoding, 'gb18030');
  assert.match(text, /^第一章 雨夜/);
  assert.equal(splitChapters(text).chapters.length, 2);
});

test('forced utf-8 on a GBK file fails instead of producing mojibake', () => {
  const bytes = readFileSync(join(ROOT, 'tests', 'fixtures', 'gbk-novel.txt'));
  assert.throws(() => decodeNovel(bytes, 'utf-8'));
});

test('re-importing the committed sample novel reproduces the committed index', () => withTemp((dir) => {
  cpSync(join(NOVEL_SAMPLE, 'project.json'), join(dir, 'project.json'));
  const index = importNovel(dir, join(NOVEL_SAMPLE, 'novel', '修表铺.txt'));
  const committed = JSON.parse(readFileSync(join(NOVEL_SAMPLE, 'story', 'source', 'index.json'), 'utf8'));
  assert.deepEqual(index, committed);
}));

test('size fallback never splits a surrogate pair', () => {
  const { chapters } = splitChapters('字'.repeat(4999) + '😀尾');
  assert.equal(chapters.length, 2);
  assert.ok(chapters[0].text.endsWith('😀'));
  assert.equal(chapters[1].text, '尾');
  assert.ok(!chapters.some((c) => c.text.includes('\uFFFD')));
});
