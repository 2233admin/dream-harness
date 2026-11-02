// Project directory I/O. A project is a directory holding project.json plus stage files.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BIBLE_SECTIONS, STAGE_FILES, sourceChars } from './gates.mjs';
import { loadContract, validate } from './schema.mjs';

const JSON_STAGES = ['project', 'source', 'outline', 'script'];

function readText(path) {
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

// Reads every stage file that exists. Unparseable files are reported, not thrown.
// data.chapters maps chapter number to text for the chapters the source index lists.
export function loadProject(dir) {
  const data = {};
  const parseErrors = [];
  for (const stage of JSON_STAGES) {
    const file = STAGE_FILES[stage];
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    try {
      data[stage] = JSON.parse(readText(path));
    } catch (err) {
      parseErrors.push({ gate: 'X2', level: 'error', file, path: '/', message: `JSON 解析失败：${err.message}` });
    }
  }
  const bible = join(dir, STAGE_FILES.bible);
  if (existsSync(bible)) data.bible = readText(bible);
  if (Array.isArray(data.source?.chapters)) {
    data.chapters = new Map();
    for (const ch of data.source.chapters) {
      const path = join(dir, 'story', 'source', String(ch.file));
      if (existsSync(path)) data.chapters.set(ch.n, readText(path));
    }
  }
  return { data, parseErrors };
}

export function isProject(dir) {
  return existsSync(join(dir, 'project.json'));
}

function bibleTemplate(language) {
  const [first, ...rest] = BIBLE_SECTIONS[language];
  const title = language === 'en' ? '# Story Bible' : '# 故事设定';
  return [title, '', `## ${first}`, '（logline）', '', ...rest.flatMap((s) => [`## ${s}`, '']) ].join('\n');
}

// Throws without touching the disk when the options would produce a project.json that fails P1.
export function initProject(dir, { title, episodes, source, language }) {
  const root = resolve(dir);
  if (isProject(root)) throw new Error(`${root} 已经是项目目录（存在 project.json）`);
  const project = {
    schemaVersion: 1,
    title,
    language,
    format: { episodes, episodeSeconds: { min: 60, max: 120 }, aspectRatio: '9:16' },
    source: { kind: source },
    targets: { video: ['h3'], image: ['gpt-image'] },
  };
  const errors = validate(loadContract('project'), project);
  if (errors.length) throw new Error(errors.map((e) => `project.json ${e.path}：${e.message}`).join('\n'));
  mkdirSync(join(root, 'story', 'chapters'), { recursive: true });
  mkdirSync(join(root, 'story', 'tracking'), { recursive: true });
  writeFileSync(join(root, 'project.json'), JSON.stringify(project, null, 2) + '\n');
  const bible = join(root, STAGE_FILES.bible);
  if (source === 'idea' && !existsSync(bible)) writeFileSync(bible, bibleTemplate(language));
  return root;
}

// Decodes novel bytes: UTF-8 when it decodes cleanly, otherwise GB18030 (superset of GBK).
export function decodeNovel(bytes, encoding = 'auto') {
  if (encoding === 'utf-8' || encoding === 'gb18030') {
    return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('gb18030', { fatal: true }).decode(bytes), encoding: 'gb18030' };
  }
}

const HEADING = /^\s*(第[0-9０-９零〇一二三四五六七八九十百千两]+[章回节卷][^\n]{0,30}|Chapter\s+\d+[^\n]{0,40})\s*$/imu;
const SIZE_CHUNK = 5000;

// Splits novel text into chapters by heading lines; falls back to fixed-size chunks.
// Text before the first heading becomes a chapter titled 序.
export function splitChapters(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chapters = [];
  let current = null;
  for (const line of lines) {
    if (HEADING.test(line)) {
      current = { title: line.trim(), lines: [] };
      chapters.push(current);
    } else {
      if (!current) {
        current = { title: '序', lines: [] };
        chapters.push(current);
      }
      current.lines.push(line);
    }
  }
  const headed = chapters.filter((c) => c.title !== '序');
  if (headed.length >= 2) {
    return {
      splitBy: 'heading',
      chapters: chapters
        .map((c) => ({ title: c.title, text: c.lines.join('\n').trim() }))
        .filter((c) => c.title !== '序' || c.text !== ''),
    };
  }
  const flat = text.replace(/\r\n?/g, '\n').trim();
  const out = [];
  for (let i = 0, n = 1; i < flat.length; i += SIZE_CHUNK, n++) {
    out.push({ title: `片段 ${n}`, text: flat.slice(i, i + SIZE_CHUNK) });
  }
  return { splitBy: 'size', chapters: out };
}

// Writes story/source/chapters/NNNN.txt and story/source/index.json, replacing a previous import.
export function importNovel(root, novelPath, { encoding = 'auto' } = {}) {
  const bytes = readFileSync(novelPath);
  const decoded = decodeNovel(bytes, encoding);
  const { splitBy, chapters } = splitChapters(decoded.text.replace(/^﻿/, ''));
  if (!chapters.length || chapters.every((c) => c.text === '')) throw new Error(`${novelPath} 没有正文`);
  const sourceDir = join(root, 'story', 'source');
  rmSync(join(sourceDir, 'chapters'), { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'chapters'), { recursive: true });
  const index = {
    schemaVersion: 1,
    file: basename(novelPath),
    encoding: decoded.encoding,
    splitBy,
    chapters: chapters.map((c, i) => {
      const file = `chapters/${String(i + 1).padStart(4, '0')}.txt`;
      writeFileSync(join(sourceDir, file), c.text + '\n');
      return { n: i + 1, title: c.title, file, chars: sourceChars(c.text + '\n') };
    }),
  };
  writeFileSync(join(sourceDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return index;
}
