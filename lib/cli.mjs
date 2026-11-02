// dh command dispatcher. Exit codes: 0 pass, 1 findings with errors, 2 usage or environment error.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { STAGES, STAGE_FILES, episodeSeconds, runStage, stageDeps } from './gates.mjs';
import { importNovel, initProject, isProject, loadProject } from './project.mjs';

const USAGE = `用法：dh <命令> [选项]

  init <目录> [--title 剧名] [--episodes N] [--source idea|novel|serial] [--language zh|en]
  status [--project 目录] [--json]
  import <小说.txt> [--project 目录] [--encoding auto|utf-8|gb18030]
  validate <${STAGES.join('|')}|all> [--project 目录] [--json]
  doctor [--json]

退出码：0 通过，1 质量门有错误，2 参数或环境错误`;

class UsageError extends Error {}

function projectDir(values) {
  const dir = resolve(values.project ?? '.');
  if (!isProject(dir)) throw new UsageError(`${dir} 不是项目目录（缺少 project.json）；用 dh init 创建或用 --project 指定`);
  return dir;
}

function formatFinding(f) {
  const tag = f.level === 'error' ? 'ERROR' : 'WARN ';
  return `${tag} ${f.gate.padEnd(3)} ${f.file}${f.path === '/' ? '' : ' ' + f.path}：${f.message}`;
}

function cmdInit(positionals, values, io) {
  const dir = positionals[0];
  if (!dir) throw new UsageError('init 需要目录参数');
  const episodes = Number(values.episodes ?? 10);
  if (!Number.isInteger(episodes) || episodes < 1) throw new UsageError('--episodes 必须是正整数');
  const source = values.source ?? 'idea';
  if (!['idea', 'novel', 'serial'].includes(source)) throw new UsageError('--source 必须是 idea / novel / serial');
  const language = values.language ?? 'zh';
  if (!['zh', 'en'].includes(language)) throw new UsageError('--language 必须是 zh / en');
  let root;
  try {
    root = initProject(dir, { title: values.title ?? dir, episodes, source, language });
  } catch (err) {
    throw new UsageError(err.message);
  }
  io.out(`已创建项目：${root}`);
  io.out('下一步：运行 dh status 查看建议');
  return 0;
}

function cmdValidate(positionals, values, io) {
  const target = positionals[0];
  if (!target) throw new UsageError('validate 需要阶段参数');
  if (target !== 'all' && !STAGES.includes(target)) throw new UsageError(`未知阶段 "${target}"`);
  const { data, parseErrors } = loadProject(projectDir(values));
  const present = (s) => data[s] !== undefined || parseErrors.some((f) => f.file === STAGE_FILES[s]);
  const stages = target === 'all' ? STAGES.filter((s) => present(s) || s === 'project') : [target];
  // Only parse errors in the requested stages and their upstream count; a broken downstream
  // file must not block confirming an upstream fix.
  const relevant = new Set(stages.flatMap((s) => [s, ...stageDeps(s, data)]).map((s) => STAGE_FILES[s]));
  const findings = parseErrors.filter((f) => relevant.has(f.file));
  if (!findings.length) for (const stage of stages) findings.push(...runStage(stage, data));
  const errors = findings.filter((f) => f.level === 'error').length;
  if (values.json) {
    io.out(JSON.stringify({ stages, pass: errors === 0, findings }, null, 2));
  } else {
    for (const f of findings) io.out(formatFinding(f));
    io.out(`${errors === 0 ? 'PASS' : 'FAIL'}：${stages.join(', ')}（错误 ${errors}，警告 ${findings.length - errors}）`);
  }
  return errors === 0 ? 0 : 1;
}

// Stages on this project's path, in order; which ones depend on source.kind.
function pathStages(data) {
  const stages = [...new Set([...stageDeps('storyboard', data), 'storyboard'])];
  if (data.source !== undefined && !stages.includes('source')) stages.splice(1, 0, 'source');
  return stages;
}

// Next step for the first stage on the path that has not passed; skill names match skills/.
function nextStep(data, results, stages) {
  const kind = data.project?.source?.kind;
  const stage = stages.find((s) => results[s] !== 'pass');
  const missing = results[stage] === 'missing';
  switch (stage) {
    case 'project': return { skill: 'drama', action: '修复 project.json' };
    case 'bible': return { skill: 'drama-idea', action: missing ? '把一句话创意写成 story/bible.md' : '补全 story/bible.md 的空章节' };
    case 'source': return { skill: 'drama-adapt', action: missing ? '用 dh import 导入小说原文' : '原文与索引不一致，重新运行 dh import' };
    case 'outline':
      if (kind === 'novel') return { skill: 'drama-adapt', action: missing ? '按原文改编出 outline.json' : '修复 outline.json 的质量门错误' };
      if (kind === 'serial' && missing) return { skill: 'drama-outline', action: '按已有连载正文分批转大纲（drama-write 在 M6 实现）' };
      return { skill: 'drama-outline', action: missing ? '作者确认 bible.md 后写 outline.json' : '修复 outline.json 的质量门错误' };
    case 'script': return { skill: 'drama-script', action: missing ? '按大纲写 script.json' : '修复 script.json 的质量门错误' };
    case 'cast': return { skill: 'drama-cast', action: missing ? '按大纲写 cast.json，作者确认定妆后锁定' : '修复 cast.json 的质量门错误' };
    case 'art': return { skill: 'drama-art', action: missing ? '按大纲写 art.json' : '修复 art.json 的质量门错误' };
    case 'storyboard': return { skill: 'drama-storyboard', action: missing ? '按剧本分镜，写 storyboard.json' : '修复 storyboard.json 的质量门错误' };
    default: {
      const boarded = new Set(data.storyboard.episodes.map((e) => e.number));
      const pending = data.script.episodes.map((e) => e.number).filter((n) => !boarded.has(n));
      if (pending.length) return { skill: 'drama-storyboard', action: `继续分镜：第 ${pending.join('、')} 集` };
      return { skill: 'drama-prompt', action: '把分镜编译成各模型提示词（M3 尚未实现）' };
    }
  }
}

function stageState(stage, data, parseErrors) {
  if (parseErrors.some((f) => f.file === STAGE_FILES[stage])) return 'unparseable';
  if (data[stage] === undefined) return 'missing';
  return runStage(stage, data).some((f) => f.level === 'error') ? 'fail' : 'pass';
}

function cmdStatus(_positionals, values, io) {
  const { data, parseErrors } = loadProject(projectDir(values));
  const stages = pathStages(data);
  const results = Object.fromEntries(stages.map((s) => [s, stageState(s, data, parseErrors)]));
  const rows = stages.map((stage) => ({ stage, file: STAGE_FILES[stage], state: results[stage] }));
  const durations = results.script === 'pass'
    ? data.script.episodes.map((e) => ({ episode: e.number, seconds: Number(episodeSeconds(e, data.project).toFixed(1)) }))
    : [];
  const next = nextStep(data, results, stages);
  if (values.json) {
    io.out(JSON.stringify({ title: data.project?.title, source: data.project?.source?.kind, stages: rows, durations, next }, null, 2));
    return 0;
  }
  io.out(`项目：${data.project?.title ?? '（project.json 无法读取）'}`);
  for (const r of rows) io.out(`  ${r.stage.padEnd(10)} ${r.file.padEnd(24)} ${r.state}`);
  if (durations.length) io.out(`  单集时长（秒）：${durations.map((d) => `${d.episode}=${d.seconds}`).join(' ')}`);
  io.out(`下一步：${next.skill} — ${next.action}`);
  return 0;
}

function cmdImport(positionals, values, io) {
  const file = positionals[0];
  if (!file) throw new UsageError('import 需要小说文件参数');
  if (!existsSync(file)) throw new UsageError(`找不到文件 ${file}`);
  const encoding = values.encoding ?? 'auto';
  if (!['auto', 'utf-8', 'gb18030'].includes(encoding)) throw new UsageError('--encoding 必须是 auto / utf-8 / gb18030');
  const root = projectDir(values);
  let index;
  try {
    index = importNovel(root, resolve(file), { encoding });
  } catch (err) {
    throw new UsageError(`导入失败：${err.message}`);
  }
  const chars = index.chapters.reduce((n, c) => n + c.chars, 0);
  const summary = { file: index.file, encoding: index.encoding, splitBy: index.splitBy, chapters: index.chapters.length, chars };
  if (values.json) io.out(JSON.stringify(summary, null, 2));
  else {
    io.out(`已导入 ${index.file}：${index.chapters.length} 章，${chars} 字，编码 ${index.encoding}`);
    io.out('大纲里 source.chapters 用下面的序号 n，不用原文标题里的章号：');
    for (const c of index.chapters) io.out(`  ${String(c.n).padStart(4)}  ${c.title}（${c.chars} 字）`);
    if (index.splitBy === 'size') io.out('注意：没有识别出章节标题，已按每 5000 字切分；改编时按片段号引用');
  }
  return 0;
}

function probe(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim().split('\n')[0];
  } catch {
    return null;
  }
}

// Reports what is present; never installs anything. Only a too-old Node fails.
function cmdDoctor(_positionals, values, io) {
  const major = Number(process.versions.node.split('.')[0]);
  const checks = [
    { name: 'node >= 22', ok: major >= 22, detail: process.version, required: true },
    { name: 'git', ok: probe('git', ['--version']) !== null, detail: probe('git', ['--version']) ?? '未找到', required: false },
    { name: 'comfy-cli', ok: probe('comfy', ['--version']) !== null, detail: probe('comfy', ['--version']) ?? '未找到（M4 生成阶段需要：pip install comfy-cli）', required: false },
  ];
  for (const key of ['MINIMAX_API_KEY', 'ARK_API_KEY', 'KLING_ACCESS_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) {
    const set = Boolean(process.env[key]);
    checks.push({ name: key, ok: set, detail: set ? '已设置' : '未设置', required: false });
  }
  const fail = checks.some((c) => c.required && !c.ok);
  if (values.json) {
    io.out(JSON.stringify({ pass: !fail, checks }, null, 2));
  } else {
    for (const c of checks) io.out(`${c.ok ? 'ok  ' : c.required ? 'FAIL' : '--  '} ${c.name.padEnd(18)} ${c.detail}`);
  }
  return fail ? 1 : 0;
}

const COMMANDS = { init: cmdInit, import: cmdImport, validate: cmdValidate, status: cmdStatus, doctor: cmdDoctor };

export function main(argv, io = { out: (s) => console.log(s), err: (s) => console.error(s) }) {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        project: { type: 'string' },
        json: { type: 'boolean' },
        title: { type: 'string' },
        episodes: { type: 'string' },
        source: { type: 'string' },
        language: { type: 'string' },
        encoding: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    const [command, ...rest] = positionals;
    if (values.help || !command) {
      io.out(USAGE);
      return command || values.help ? 0 : 2;
    }
    if (!COMMANDS[command]) throw new UsageError(`未知命令 "${command}"`);
    return COMMANDS[command](rest, values, io);
  } catch (err) {
    if (err instanceof UsageError || err.code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(`dh: ${err.message}\n\n${USAGE}`);
      return 2;
    }
    throw err;
  }
}
