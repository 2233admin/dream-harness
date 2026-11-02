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
  cast: 'cast.json',
  art: 'art.json',
  storyboard: 'storyboard.json',
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
    case 'script':
    case 'cast':
    case 'art': return [...stageDeps('outline', data), 'outline'];
    case 'storyboard': return [...stageDeps('script', data), 'script', 'cast', 'art'];
    default: throw new Error(`unknown stage ${stage}`);
  }
}

const DEFAULT_SPEECH = {
  zh: { charsPerSecond: 4.5, defaultActionSeconds: 2 },
  en: { charsPerSecond: 2.5, defaultActionSeconds: 2 },
};

const SHOT_RULES = { minShotSeconds: 1.5, maxShotSeconds: 8, maxSegmentSeconds: 15 };

const DEFAULT_RULES = {
  zh: { hookWindow: 3, maxLineUnits: 35, maxPayoffGap: 3, maxVoiceoverPerEpisode: 3, maxConsecutiveDialogue: 4, ...SHOT_RULES },
  en: { hookWindow: 3, maxLineUnits: 25, maxPayoffGap: 3, maxVoiceoverPerEpisode: 3, maxConsecutiveDialogue: 4, ...SHOT_RULES },
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

// Prompt fields go to image, video and TTS models, which take English most reliably.
const CJK = /[㐀-鿿豈-﫿]/u;
// Chinese vague words never name a period. English ones only fail when nothing concrete
// follows: "historical setting" fails, "Edo period, 1800s Kyoto" passes.
const VAGUE_ERA_ZH = /古代|古装|架空|某朝/u;
const VAGUE_ERA_EN = /^\s*(an?\s+|the\s+)?(ancient|historical|fictional|imaginary|medieval|period|modern|futuristic)(\s+(times?|eras?|settings?|worlds?|periods?|ages?|days?|style|city|town|kingdom|china|asia))*\s*$/iu;
const EMPTY_SCENE = /\b(no people|no person|empty|unoccupied|without people|no figures)\b/iu;

function namesOf(project, outline) {
  return [...outline.characters.map((c) => c.name), project.title].filter((n) => n.length >= 2);
}

function englishOnly(gate, file, fields, out) {
  for (const [path, text] of fields) {
    if (text !== undefined && CJK.test(text)) {
      out.push(finding(gate, 'error', file, path, '提示词必须是英文；中文说明写在 name / look / purpose 等给人读的字段'));
    }
  }
}

function anchorsInPrompt(gate, file, base, anchors, prompt, out) {
  const lower = prompt.toLowerCase();
  anchors.forEach((a, i) => {
    if (!lower.includes(a.prompt.toLowerCase())) {
      out.push(finding(gate, 'error', file, `${base}/anchors/${i}`, `锚点「${a.name}」的英文短语 "${a.prompt}" 没有写进 imagePrompt`));
    }
  });
}

function noNames(gate, file, path, text, names, out) {
  const hit = names.find((n) => text.includes(n));
  if (hit) out.push(finding(gate, 'error', file, path, `出现了名字「${hit}」；出图提示词只描述外观，不写人名和剧名`));
}

function coverage(gate, file, kind, actual, expected, out) {
  const have = new Set(actual);
  const want = new Set(expected);
  for (const id of expected) if (!have.has(id)) out.push(finding(gate, 'error', file, `/${kind}`, `缺少大纲里的 "${id}"`));
  actual.forEach((id, i) => {
    if (!want.has(id)) out.push(finding(gate, 'error', file, `/${kind}/${i}/id`, `"${id}" 不在大纲里；先回大纲登记`));
  });
  for (const id of duplicates(actual)) out.push(finding(gate, 'error', file, `/${kind}`, `"${id}" 重复`));
}

function castGates({ project, outline, cast }) {
  const schema = schemaGate('C1', 'cast', cast);
  if (schema.length) return schema;
  const file = 'cast.json';
  const out = [];
  const names = namesOf(project, outline);
  coverage('C2', file, 'characters', cast.characters.map((c) => c.id), outline.characters.map((c) => c.id), out);
  cast.characters.forEach((c, i) => {
    const at = `/characters/${i}`;
    anchorsInPrompt('C3', file, at, c.anchors, c.imagePrompt, out);
    englishOnly('C4', file, [
      [`${at}/imagePrompt`, c.imagePrompt],
      [`${at}/negativePrompt`, c.negativePrompt],
      [`${at}/voice/prompt`, c.voice.prompt],
      ...c.anchors.map((a, j) => [`${at}/anchors/${j}/prompt`, a.prompt]),
      ...c.outfits.map((o, j) => [`${at}/outfits/${j}/prompt`, o.prompt]),
    ], out);
    noNames('C5', file, `${at}/imagePrompt`, c.imagePrompt, names, out);
    const outfitIds = c.outfits.map((o) => o.id);
    for (const id of duplicates(outfitIds)) out.push(finding('C6', 'error', file, `${at}/outfits`, `服装 id "${id}" 重复`));
    if (!outfitIds.includes(c.defaultOutfit)) {
      out.push(finding('C6', 'error', file, `${at}/defaultOutfit`, `默认服装 "${c.defaultOutfit}" 不在 outfits 里`));
    }
  });
  if (!cast.locked) out.push(finding('C7', 'warn', file, '/locked', '角色还没锁定；作者确认定妆后写 locked.version，分镜才能开始'));
  return out;
}

function artGates({ project, outline, art }) {
  const schema = schemaGate('A1', 'art', art);
  if (schema.length) return schema;
  const file = 'art.json';
  const out = [];
  const names = namesOf(project, outline);
  coverage('A2', file, 'locations', art.locations.map((l) => l.id), outline.locations.map((l) => l.id), out);
  const narrative = new Set(outline.props.filter((p) => p.narrative).map((p) => p.id));
  const known = new Set(outline.props.map((p) => p.id));
  for (const id of narrative) {
    if (!art.props.some((p) => p.id === id)) out.push(finding('A2', 'error', file, '/props', `缺少叙事道具 "${id}"`));
  }
  art.props.forEach((p, i) => {
    if (!known.has(p.id)) out.push(finding('A2', 'error', file, `/props/${i}/id`, `"${p.id}" 不在大纲里；先回大纲登记`));
  });
  if (VAGUE_ERA_ZH.test(art.era) || VAGUE_ERA_EN.test(art.era)) {
    out.push(finding('A3', 'error', file, '/era', `年代「${art.era}」太含糊；写具体的朝代或年代，比如「2020年代中国南方城市」「明代」`));
  }
  const entries = [...art.locations.map((l, i) => ['locations', l, i]), ...art.props.map((p, i) => ['props', p, i])];
  for (const [kind, item, i] of entries) {
    const at = `/${kind}/${i}`;
    anchorsInPrompt('A4', file, at, item.anchors, item.imagePrompt, out);
    englishOnly('A5', file, [
      [`${at}/imagePrompt`, item.imagePrompt],
      [`${at}/negativePrompt`, item.negativePrompt],
      ...item.anchors.map((a, j) => [`${at}/anchors/${j}/prompt`, a.prompt]),
      ...(item.states ?? []).map((s, j) => [`${at}/states/${j}/prompt`, s.prompt]),
    ], out);
    noNames('A6', file, `${at}/imagePrompt`, item.imagePrompt, names, out);
    if (kind === 'locations' && !EMPTY_SCENE.test(item.imagePrompt)) {
      out.push(finding('A6', 'error', file, `${at}/imagePrompt`, '场景提示词必须写明空景（no people / empty）；人物是另一层资产'));
    }
    for (const id of duplicates((item.states ?? []).map((s) => s.id))) {
      out.push(finding('A7', 'error', file, `${at}/states`, `状态 id "${id}" 重复`));
    }
  }
  return out;
}

function storyboardGates({ project, outline, script, cast, art, storyboard }) {
  const schema = schemaGate('K1', 'storyboard', storyboard);
  if (schema.length) return schema;
  const file = 'storyboard.json';
  const out = [];
  const limits = rules(project);
  if (!cast.locked) out.push(finding('K9', 'error', file, '/', 'cast.json 没有锁定；作者确认定妆、写入 locked.version 之后才能分镜'));

  const scriptByNumber = new Map(script.episodes.map((e) => [e.number, e]));
  const nameOf = new Map(outline.characters.map((c) => [c.id, c.name]));
  const castById = new Map(cast.characters.map((c) => [c.id, c]));
  const locationById = new Map(art.locations.map((l) => [l.id, l]));
  const artProps = new Set(art.props.map((p) => p.id));
  const allNames = [...nameOf.values()];

  let prev = 0;
  storyboard.episodes.forEach((ep, i) => {
    if (!scriptByNumber.has(ep.number)) {
      out.push(finding('K2', 'error', file, `/episodes/${i}/number`, `剧本里没有第 ${ep.number} 集`));
    } else if (ep.number <= prev) {
      out.push(finding('K2', 'error', file, `/episodes/${i}/number`, `集号 ${ep.number} 重复或倒序`));
    }
    prev = Math.max(prev, ep.number);
  });
  for (const id of duplicates(storyboard.episodes.flatMap((e) => e.segments.map((s) => s.id)))) {
    out.push(finding('K3', 'error', file, '/episodes', `段 id "${id}" 重复`));
  }
  for (const id of duplicates(storyboard.episodes.flatMap((e) => e.segments.flatMap((s) => s.shots.map((k) => k.id))))) {
    out.push(finding('K3', 'error', file, '/episodes', `镜 id "${id}" 重复`));
  }

  storyboard.episodes.forEach((ep, i) => {
    const scriptEp = scriptByNumber.get(ep.number);
    if (!scriptEp) return;
    const sceneIndex = new Map(scriptEp.scenes.map((s, k) => [s.id, k]));
    const claimed = new Map(scriptEp.scenes.map((s) => [s.id, []]));
    let lastScene = -1;
    ep.segments.forEach((seg, j) => {
      const sat = `/episodes/${i}/segments/${j}`;
      const scene = scriptEp.scenes[sceneIndex.get(seg.sceneId)];
      if (!scene) {
        out.push(finding('K3', 'error', file, `${sat}/sceneId`, `第 ${ep.number} 集没有场次 "${seg.sceneId}"`));
        return;
      }
      if (sceneIndex.get(seg.sceneId) < lastScene) {
        out.push(finding('K3', 'error', file, `${sat}/sceneId`, `场次 "${seg.sceneId}" 排在了后面场次之后；段按剧本场次顺序排`));
      }
      lastScene = Math.max(lastScene, sceneIndex.get(seg.sceneId));
      const location = locationById.get(scene.locationId);
      let segSeconds = 0;
      seg.shots.forEach((shot, k) => {
        const at = `${sat}/shots/${k}`;
        segSeconds += shot.seconds;
        claimed.get(scene.id).push({ range: shot.beats, at });
        if (shot.seconds < limits.minShotSeconds || shot.seconds > limits.maxShotSeconds) {
          out.push(finding('K5', 'error', file, `${at}/seconds`, `单镜 ${shot.seconds} 秒，超出 ${limits.minShotSeconds}–${limits.maxShotSeconds} 秒`));
        }
        const [from, to] = shot.beats;
        const spoken = scene.beats.slice(from, to + 1)
          .filter((b) => b.type !== 'action')
          .reduce((n, b) => n + beatSeconds(b, project), 0);
        if (spoken > shot.seconds + 1e-9) {
          out.push(finding('K6', 'error', file, `${at}/seconds`, `认领的台词约 ${spoken.toFixed(1)} 秒，镜头只有 ${shot.seconds} 秒`));
        }
        shot.subjects.forEach((sub, m) => {
          const sp = `${at}/subjects/${m}`;
          if (!scene.characters.includes(sub.characterId)) {
            out.push(finding('K7', 'error', file, `${sp}/characterId`, `"${sub.characterId}" 不在场次 "${scene.id}" 的出场角色里`));
          } else if (sub.outfit && !castById.get(sub.characterId)?.outfits.some((o) => o.id === sub.outfit)) {
            out.push(finding('K7', 'error', file, `${sp}/outfit`, `角色 "${sub.characterId}" 没有服装 "${sub.outfit}"`));
          }
          const name = nameOf.get(sub.characterId);
          if (name && !shot.frame.includes(name)) {
            out.push(finding('K10', 'error', file, `${at}/frame`, `首帧画面没有点名「${name}」；首帧要和参考图一起出图，靠名字对应参考图`));
          }
        });
        if (!location?.states.some((s) => s.id === shot.locationState)) {
          out.push(finding('K8', 'error', file, `${at}/locationState`, `场景 "${scene.locationId}" 没有状态 "${shot.locationState}"`));
        }
        shot.props.forEach((id, m) => {
          if (!artProps.has(id)) out.push(finding('K8', 'error', file, `${at}/props/${m}`, `art.json 里没有道具 "${id}"`));
        });
        const hit = allNames.find((n) => shot.body.includes(n));
        if (hit) {
          out.push(finding('K11', 'error', file, `${at}/body`, `镜头正文出现了名字「${hit}」；视频模型要求用通用身份指代人物`));
        }
      });
      if (segSeconds > limits.maxSegmentSeconds + 1e-9) {
        out.push(finding('K5', 'error', file, sat, `段总长 ${segSeconds} 秒，超过单次生成上限 ${limits.maxSegmentSeconds} 秒`));
      }
    });
    for (const scene of scriptEp.scenes) {
      const ranges = claimed.get(scene.id);
      // Shots must claim 0..n-1 contiguously in order; report only the first break per scene.
      let next = 0;
      const broken = ranges.find(({ range: [from, to] }) => {
        if (from !== next || to < from || to >= scene.beats.length) return true;
        next = to + 1;
        return false;
      });
      if (broken) {
        const [from, to] = broken.range;
        out.push(finding('K4', 'error', file, `${broken.at}/beats`, `场次 "${scene.id}" 的节拍认领应从第 ${next} 拍接着来，实际是 [${from}, ${to}]（共 ${scene.beats.length} 拍，从 0 数）`));
      } else if (next !== scene.beats.length) {
        out.push(finding('K4', 'error', file, `/episodes/${i}`, `场次 "${scene.id}" 第 ${next} 拍起没有镜头认领`));
      }
    }
    const first = ep.segments[0]?.shots[0];
    if (first && first.subjects.length === 0) {
      out.push(finding('K12', 'warn', file, `/episodes/${i}/segments/0/shots/0`, `第 ${ep.number} 集第一镜没有人物；开场先给运动的主体`));
    }
  });

  const boarded = new Set(storyboard.episodes.map((e) => e.number));
  const pending = script.episodes.map((e) => e.number).filter((n) => !boarded.has(n));
  if (pending.length) out.push(finding('K13', 'warn', file, '/episodes', `第 ${pending.join('、')} 集还没有分镜`));
  return out;
}

const RUNNERS = {
  project: projectGates,
  bible: bibleGates,
  source: sourceGates,
  outline: outlineGates,
  script: scriptGates,
  cast: castGates,
  art: artGates,
  storyboard: storyboardGates,
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
