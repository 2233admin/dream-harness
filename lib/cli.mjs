// dh command dispatcher. Exit codes: 0 pass, 1 findings with errors, 2 usage or environment error.

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { STAGE_FILES, episodeSeconds, runStage } from './gates.mjs';
import { initProject, isProject, loadProject } from './project.mjs';

const STAGES = Object.keys(STAGE_FILES);

const USAGE = `用法：dh <命令> [选项]

  init <目录> [--title 剧名] [--episodes N] [--source idea|novel|serial] [--language zh|en]
  status [--project 目录] [--json]
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
  const stages = target === 'all' ? STAGES.filter((s) => data[s] !== undefined || s === 'project') : [target];
  const findings = [...parseErrors];
  if (!parseErrors.length) for (const stage of stages) findings.push(...runStage(stage, data));
  const errors = findings.filter((f) => f.level === 'error').length;
  if (values.json) {
    io.out(JSON.stringify({ stages, pass: errors === 0, findings }, null, 2));
  } else {
    for (const f of findings) io.out(formatFinding(f));
    io.out(`${errors === 0 ? 'PASS' : 'FAIL'}：${stages.join(', ')}（错误 ${errors}，警告 ${findings.length - errors}）`);
  }
  return errors === 0 ? 0 : 1;
}

// Next step suggestion; skill names match skills/ directory names.
function nextStep(data, results) {
  if (results.project !== 'pass') return { skill: 'drama', action: '修复 project.json' };
  if (data.outline === undefined) {
    const kind = data.project.source.kind;
    if (kind === 'novel') return { skill: 'drama-adapt', action: '导入小说原文，改编出 outline.json' };
    if (kind === 'serial') return { skill: 'drama-write', action: '写连载正文与追踪，再用 drama-outline 分批转大纲' };
    return { skill: 'drama-idea', action: '把一句话创意写成 story/bible.md，确认后用 drama-outline 出大纲' };
  }
  if (results.outline !== 'pass') return { skill: 'drama-outline', action: '修复 outline.json 的质量门错误' };
  if (data.script === undefined) return { skill: 'drama-script', action: '按大纲写 script.json' };
  if (results.script !== 'pass') return { skill: 'drama-script', action: '修复 script.json 的质量门错误' };
  return { skill: 'drama-cast / drama-art', action: '进入资产设定阶段（M2 尚未实现）' };
}

function cmdStatus(_positionals, values, io) {
  const { data, parseErrors } = loadProject(projectDir(values));
  const results = {};
  const rows = [];
  for (const stage of STAGES) {
    let state;
    if (parseErrors.some((f) => f.file === STAGE_FILES[stage])) state = 'unparseable';
    else if (data[stage] === undefined) state = 'missing';
    else state = runStage(stage, data).some((f) => f.level === 'error') ? 'fail' : 'pass';
    results[stage] = state;
    rows.push({ stage, file: STAGE_FILES[stage], state });
  }
  const durations = results.script === 'pass'
    ? data.script.episodes.map((e) => ({ episode: e.number, seconds: Number(episodeSeconds(e, data.project).toFixed(1)) }))
    : [];
  const next = nextStep(data, results);
  if (values.json) {
    io.out(JSON.stringify({ title: data.project?.title, stages: rows, durations, next }, null, 2));
    return 0;
  }
  io.out(`项目：${data.project?.title ?? '（project.json 无法读取）'}`);
  for (const r of rows) io.out(`  ${r.stage.padEnd(8)} ${r.file.padEnd(14)} ${r.state}`);
  if (durations.length) io.out(`  单集时长（秒）：${durations.map((d) => `${d.episode}=${d.seconds}`).join(' ')}`);
  io.out(`下一步：${next.skill} — ${next.action}`);
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

const COMMANDS = { init: cmdInit, validate: cmdValidate, status: cmdStatus, doctor: cmdDoctor };

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
