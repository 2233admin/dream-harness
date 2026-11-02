// Project directory I/O. A project is a directory holding project.json plus stage files.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STAGE_FILES } from './gates.mjs';
import { loadContract, validate } from './schema.mjs';

// Reads every stage file that exists. Unparseable files are reported, not thrown.
export function loadProject(dir) {
  const data = {};
  const parseErrors = [];
  for (const [stage, file] of Object.entries(STAGE_FILES)) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    try {
      data[stage] = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
    } catch (err) {
      parseErrors.push({ gate: 'X2', level: 'error', file, path: '/', message: `JSON 解析失败：${err.message}` });
    }
  }
  return { data, parseErrors };
}

export function isProject(dir) {
  return existsSync(join(dir, 'project.json'));
}

const BIBLE_TEMPLATE = `# 故事设定

## 一句话
（logline）

## 题材与卖点

## 主要人物

## 核心冲突

## 梗概
`;

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
  if (source === 'novel') mkdirSync(join(root, 'story', 'source'), { recursive: true });
  writeFileSync(join(root, 'project.json'), JSON.stringify(project, null, 2) + '\n');
  const bible = join(root, 'story', 'bible.md');
  if (!existsSync(bible)) writeFileSync(bible, BIBLE_TEMPLATE);
  return root;
}
