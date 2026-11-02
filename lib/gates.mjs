// Quality gates per stage. Each gate returns findings:
//   { gate, level: 'error' | 'warn', file, path, message }
// Only 'error' findings fail a stage. Semantic gates assume the stage passed its schema gate,
// so a schema failure stops that stage's remaining gates.

import { loadContract, validate } from './schema.mjs';

export const STAGE_FILES = {
  project: 'project.json',
  bible: 'story/bible.md',
  source: 'story/source/index.json',
  outline: 'outline.json',
  script: 'script.json',
};

// Upstream stages a stage reads. Which writing entry the project uses decides outline's upstream:
// idea needs a confirmed bible, novel needs the imported source; serial has no gated upstream yet.
export function stageDeps(stage, data) {
  switch (stage) {
    case 'project': return [];
    case 'bible':
    case 'source': return ['project'];
    case 'outline': {
      const kind = data.project?.source?.kind;
      if (kind === 'idea') return ['project', 'bible'];
      if (kind === 'novel') return ['project', 'source'];
      return ['project'];
    }
    case 'script': return [...stageDeps('outline', data), 'outline'];
    default: throw new Error(`unknown stage ${stage}`);
  }
}

const DEFAULT_SPEECH = {
  zh: { charsPerSecond: 4.5, defaultActionSeconds: 2 },
  en: { charsPerSecond: 2.5, defaultActionSeconds: 2 },
};

const DEFAULT_RULES = {
  zh: { hookWindow: 3, maxLineUnits: 35, maxPayoffGap: 3, maxVoiceoverPerEpisode: 3, maxConsecutiveDialogue: 4 },
  en: { hookWindow: 3, maxLineUnits: 25, maxPayoffGap: 3, maxVoiceoverPerEpisode: 3, maxConsecutiveDialogue: 4 },
};

const MAX_NARRATIVE_PROPS = 8;
const QUOTES = /[「」『』“”"]/u;

function finding(gate, level, file, path, message) {
  return { gate, level, file, path, message };
}

function schemaGate(gate, stage, data) {
  const file = STAGE_FILES[stage];
  return validate(loadContract(stage), data).map((e) => finding(gate, 'error', file, e.path, e.message));
}

function duplicates(values) {
  const seen = new Set();
  const dup = new Set();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

// Spoken length unit: zh counts characters, en counts words. Punctuation and spaces do not count.
export function spokenUnits(text, language) {
  if (language === 'en') return text.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return [...text.replace(/[\s\p{P}\p{S}]/gu, '')].length;
}

// Character count used by the source index: code points, line breaks excluded.
export function sourceChars(text) {
  return [...text.replace(/\r?\n/g, '')].length;
}

export function speechSettings(project) {
  return { ...DEFAULT_SPEECH[project.language], ...project.speech };
}

export function rules(project) {
  return { ...DEFAULT_RULES[project.language], ...project.rules };
}

export function beatSeconds(beat, project) {
  if (beat.seconds !== undefined) return beat.seconds;
  const speech = speechSettings(project);
  if (beat.type === 'action') return speech.defaultActionSeconds;
  return spokenUnits(beat.text, project.language) / speech.charsPerSecond;
}

export function episodeSeconds(episode, project) {
  let total = 0;
  for (const scene of episode.scenes) for (const beat of scene.beats) total += beatSeconds(beat, project);
  return total;
}

function projectGates({ project }) {
  const schema = schemaGate('P1', 'project', project);
  if (schema.length) return schema;
  const out = [];
  const { min, max } = project.format.episodeSeconds;
  if (min > max) {
    out.push(finding('P2', 'error', 'project.json', '/format/episodeSeconds', `min（${min}）大于 max（${max}）`));
  }
  return out;
}

// Bible sections, in order. A section is empty when it has only blanks or a （placeholder） line.
export const BIBLE_SECTIONS = {
  zh: ['一句话', '题材与卖点', '主要人物', '核心冲突', '梗概'],
  en: ['Logline', 'Genre and Hook', 'Characters', 'Conflict', 'Synopsis'],
};

export function bibleSections(text) {
  const sections = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      sections.set(current, []);
    } else if (current) {
      sections.get(current).push(line);
    }
  }
  return sections;
}

function bibleGates({ project, bible }) {
  const file = STAGE_FILES.bible;
  const out = [];
  const sections = bibleSections(bible);
  for (const name of BIBLE_SECTIONS[project.language]) {
    const body = sections.get(name);
    if (!body) {
      out.push(finding('B1', 'error', file, `## ${name}`, `缺少章节「${name}」`));
      continue;
    }
    const content = body.filter((l) => l.trim() !== '' && !/^\s*[（(].*[）)]\s*$/.test(l));
    if (!content.length) out.push(finding('B1', 'error', file, `## ${name}`, `章节「${name}」还是空的`));
  }
  const synopsis = sections.get(BIBLE_SECTIONS[project.language][4]) ?? [];
  const items = synopsis.filter((l) => /^\s*\d+[.、]/.test(l)).length;
  if (items && items !== project.format.episodes) {
    out.push(finding('B2', 'warn', file, `## ${BIBLE_SECTIONS[project.language][4]}`, `梗概列了 ${items} 条，project.json 规定 ${project.format.episodes} 集`));
  }
  return out;
}

function sourceGates({ source, chapters }) {
  const schema = schemaGate('N1', 'source', source);
  if (schema.length) return schema;
  const file = STAGE_FILES.source;
  const out = [];
  source.chapters.forEach((ch, i) => {
    if (ch.n !== i + 1) out.push(finding('N2', 'error', file, `/chapters/${i}/n`, `章号应为 ${i + 1}，实际为 ${ch.n}`));
    const text = chapters?.get(ch.n);
    if (text === undefined) {
      out.push(finding('N3', 'error', file, `/chapters/${i}/file`, `章节文件 ${ch.file} 不存在；重新运行 dh import`));
    } else if (sourceChars(text) !== ch.chars) {
      out.push(finding('N3', 'error', file, `/chapters/${i}/chars`, `${ch.file} 字数与索引不符（索引 ${ch.chars}，实际 ${sourceChars(text)}）；原文被改过，重新运行 dh import`));
    }
  });
  return out;
}

const normalize = (s) => s.replace(/\s+/gu, '');

function outlineGates({ project, outline, source, chapters }) {
  const schema = schemaGate('O1', 'outline', outline);
  if (schema.length) return schema;
  const file = 'outline.json';
  const out = [];
  const limits = rules(project);

  for (const kind of ['characters', 'locations', 'props']) {
    for (const id of duplicates(outline[kind].map((x) => x.id))) {
      out.push(finding('O2', 'error', file, `/${kind}`, `id "${id}" 重复`));
    }
  }

  outline.episodes.forEach((ep, i) => {
    if (ep.number !== i + 1) {
      out.push(finding('O3', 'error', file, `/episodes/${i}/number`, `集号应为 ${i + 1}，实际为 ${ep.number}；集号必须从 1 起连续`));
    }
  });

  const planned = project.format.episodes;
  if (outline.episodes.length !== planned) {
    out.push(finding('O4', 'error', file, '/episodes', `共 ${outline.episodes.length} 集，project.json 规定 ${planned} 集`));
  }

  const known = {
    characters: new Set(outline.characters.map((c) => c.id)),
    locations: new Set(outline.locations.map((l) => l.id)),
    props: new Set(outline.props.map((p) => p.id)),
  };
  const used = { characters: new Set(), props: new Set() };
  let gap = 0;
  outline.episodes.forEach((ep, i) => {
    for (const kind of ['characters', 'locations', 'props']) {
      (ep[kind] ?? []).forEach((id, j) => {
        if (!known[kind].has(id)) {
          out.push(finding('O5', 'error', file, `/episodes/${i}/${kind}/${j}`, `引用了不存在的 ${kind} id "${id}"`));
        }
        used[kind]?.add(id);
      });
    }
    const last = i === outline.episodes.length - 1;
    if (!last && ep.hook.cliffhanger.trim() === '') {
      out.push(finding('O6', 'error', file, `/episodes/${i}/hook/cliffhanger`, `第 ${ep.number} 集不是最后一集，结尾钩子不能为空`));
    }
    gap = ep.payoffs.length ? 0 : gap + 1;
    if (gap === limits.maxPayoffGap + 1) {
      out.push(finding('O9', 'error', file, `/episodes/${i}/payoffs`, `截至第 ${ep.number} 集已连续 ${gap} 集没有爽点（上限 ${limits.maxPayoffGap}）`));
    }
    if (QUOTES.test(ep.synopsis)) {
      out.push(finding('O10', 'error', file, `/episodes/${i}/synopsis`, `第 ${ep.number} 集梗概出现引号对白；梗概写叙述体，台词留给剧本`));
    }
  });

  if (!outline.characters.some((c) => c.role === 'protagonist')) {
    out.push(finding('O7', 'error', file, '/characters', '至少需要一个 role 为 protagonist 的角色'));
  }

  outline.characters.forEach((c, i) => {
    if (!used.characters.has(c.id)) {
      out.push(finding('O8', 'warn', file, `/characters/${i}`, `角色 "${c.name}" 没有出现在任何一集`));
    }
  });
  outline.props.forEach((p, i) => {
    if (p.narrative && !used.props.has(p.id)) {
      out.push(finding('O8', 'warn', file, `/props/${i}`, `叙事道具 "${p.name}" 没有出现在任何一集`));
    }
  });
  const narrative = outline.props.filter((p) => p.narrative).length;
  if (narrative > MAX_NARRATIVE_PROPS) {
    out.push(finding('O15', 'warn', file, '/props', `叙事道具 ${narrative} 件，超过 ${MAX_NARRATIVE_PROPS} 件；问一句：它丢了剧情会不会塌，不会就是陈设`));
  }

  if (project.source.kind === 'novel') out.push(...adaptationGates(outline, source, chapters));
  return out;
}

function adaptationGates(outline, source, chapters) {
  const file = 'outline.json';
  const out = [];
  const a = outline.adaptation;
  if (!a) return [finding('O11', 'error', file, '/', '改编项目必须写 adaptation（砍线、合人、保留取舍）')];
  if (a.mode !== 'faithful' && a.cut.length === 0) {
    out.push(finding('O11', 'error', file, '/adaptation/cut', `改编幅度为 ${a.mode}，至少要写明砍掉了什么、为什么`));
  }
  const fullText = normalize([...chapters.values()].join(''));
  a.keep.forEach((k, i) => {
    if (!fullText.includes(normalize(k.evidence))) {
      out.push(finding('O12', 'error', file, `/adaptation/keep/${i}/evidence`, `证据「${k.evidence.slice(0, 20)}」在原文里找不到；必须逐字摘自原文`));
    }
  });
  if (a.keep.length === 0) out.push(finding('O12', 'error', file, '/adaptation/keep', '至少要有一条带原文证据的保留取舍'));
  const total = source.chapters.length;
  let prevStart = 0;
  outline.episodes.forEach((ep, i) => {
    const at = `/episodes/${i}/source`;
    if (!ep.source) {
      out.push(finding('O13', 'error', file, at, `第 ${ep.number} 集没有写对应的原文章节 source.chapters`));
      return;
    }
    const [from, to] = ep.source.chapters;
    if (from > to || to > total) {
      out.push(finding('O13', 'error', file, `${at}/chapters`, `章节范围 [${from}, ${to}] 不合法（原文共 ${total} 章）`));
    } else if (from < prevStart) {
      out.push(finding('O14', 'warn', file, `${at}/chapters`, `第 ${ep.number} 集从第 ${from} 章开始，早于上一集；确认是有意倒叙`));
    }
    prevStart = Math.max(prevStart, from);
  });
  return out;
}

function scriptGates({ project, outline, script }) {
  const schema = schemaGate('S1', 'script', script);
  if (schema.length) return schema;
  const file = 'script.json';
  const out = [];
  const limits = rules(project);

  const outlineNumbers = outline.episodes.map((e) => e.number).join(',');
  const scriptNumbers = script.episodes.map((e) => e.number).join(',');
  if (outlineNumbers !== scriptNumbers) {
    out.push(finding('S2', 'error', file, '/episodes', `集号 [${scriptNumbers}] 与大纲 [${outlineNumbers}] 不一致`));
  }

  const sceneIds = script.episodes.flatMap((e) => e.scenes.map((s) => s.id));
  for (const id of duplicates(sceneIds)) out.push(finding('S3', 'error', file, '/episodes', `场次 id "${id}" 重复`));

  const characters = new Set(outline.characters.map((c) => c.id));
  const locations = new Set(outline.locations.map((l) => l.id));
  const outlineByNumber = new Map(outline.episodes.map((e) => [e.number, e]));
  const { min, max } = project.format.episodeSeconds;

  script.episodes.forEach((ep, i) => {
    const planned = outlineByNumber.get(ep.number);
    let voiceovers = 0;
    ep.scenes.forEach((scene, j) => {
      const at = `/episodes/${i}/scenes/${j}`;
      if (!locations.has(scene.locationId)) {
        out.push(finding('S4', 'error', file, `${at}/locationId`, `场景 "${scene.locationId}" 不在大纲的 locations 里`));
      } else if (planned && !planned.locations.includes(scene.locationId)) {
        out.push(finding('S8', 'warn', file, `${at}/locationId`, `场景 "${scene.locationId}" 未列入大纲第 ${ep.number} 集`));
      }
      scene.characters.forEach((id, k) => {
        if (!characters.has(id)) {
          out.push(finding('S5', 'error', file, `${at}/characters/${k}`, `角色 "${id}" 不在大纲的 characters 里`));
        } else if (planned && !planned.characters.includes(id)) {
          out.push(finding('S8', 'warn', file, `${at}/characters/${k}`, `角色 "${id}" 未列入大纲第 ${ep.number} 集`));
        }
      });
      if (!scene.beats.some((b) => b.type === 'action')) {
        out.push(finding('S11', 'error', file, at, `场次 "${scene.id}" 没有一拍动作；观众在看什么`));
      }
      let run = 0;
      scene.beats.forEach((beat, k) => {
        const bat = `${at}/beats/${k}`;
        if (beat.type === 'dialogue') {
          if (!beat.characterId) {
            out.push(finding('S6', 'error', file, bat, '台词节拍必须写 characterId'));
          } else if (!scene.characters.includes(beat.characterId)) {
            out.push(finding('S6', 'error', file, `${bat}/characterId`, `说话人 "${beat.characterId}" 不在本场出场角色里`));
          }
        } else if (beat.characterId && !characters.has(beat.characterId)) {
          out.push(finding('S6', 'error', file, `${bat}/characterId`, `角色 "${beat.characterId}" 不在大纲的 characters 里`));
        }
        if (beat.type !== 'action') {
          const units = spokenUnits(beat.text, project.language);
          if (units > limits.maxLineUnits) {
            out.push(finding('S10', 'error', file, `${bat}/text`, `单句 ${units} 字，上限 ${limits.maxLineUnits}；一口气说不完，拆成两句`));
          }
        } else if (QUOTES.test(beat.text)) {
          out.push(finding('S12', 'error', file, `${bat}/text`, '动作节拍里出现引号台词；台词单独写成 dialogue 节拍'));
        }
        if (beat.type === 'voiceover') voiceovers += 1;
        run = beat.type === 'dialogue' ? run + 1 : 0;
        if (run === limits.maxConsecutiveDialogue + 1) {
          out.push(finding('S14', 'warn', file, bat, `连续 ${run} 句台词没有动作或反应插入`));
        }
      });
    });
    const totalBeats = ep.scenes.reduce((n, s) => n + s.beats.length, 0);
    if (ep.hookBeat >= Math.min(limits.hookWindow, totalBeats)) {
      out.push(finding('S9', 'error', file, `/episodes/${i}/hookBeat`, `钩子落在第 ${ep.hookBeat + 1} 拍，必须在全集前 ${limits.hookWindow} 拍内`));
    }
    if (voiceovers > limits.maxVoiceoverPerEpisode) {
      out.push(finding('S13', 'warn', file, `/episodes/${i}`, `第 ${ep.number} 集旁白 ${voiceovers} 条，超过 ${limits.maxVoiceoverPerEpisode} 条`));
    }
    const seconds = episodeSeconds(ep, project);
    if (seconds < min || seconds > max) {
      out.push(finding('S7', 'error', file, `/episodes/${i}`, `第 ${ep.number} 集估算 ${seconds.toFixed(1)} 秒，超出 ${min}–${max} 秒`));
    }
  });
  return out;
}

const RUNNERS = {
  project: projectGates,
  bible: bibleGates,
  source: sourceGates,
  outline: outlineGates,
  script: scriptGates,
};

export const STAGES = Object.keys(RUNNERS);

// data: { project?, bible?, source?, chapters?, outline?, script? } already loaded.
// Returns findings for one stage. Missing or failing upstream is reported as X1 instead of
// running the stage.
export function runStage(stage, data) {
  const file = STAGE_FILES[stage];
  if (data[stage] === undefined) return [finding('X0', 'error', file, '/', `缺少 ${file}`)];
  for (const dep of stageDeps(stage, data)) {
    if (data[dep] === undefined || RUNNERS[dep](data).some((f) => f.level === 'error')) {
      return [finding('X1', 'error', file, '/', `上游 ${STAGE_FILES[dep]} 缺失或未通过质量门，先修上游`)];
    }
  }
  return RUNNERS[stage](data);
}
