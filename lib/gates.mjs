// Quality gates per stage. Each gate returns findings:
//   { gate, level: 'error' | 'warn', file, path, message }
// Only 'error' findings fail a stage. Semantic gates assume the stage passed its schema gate,
// so a schema failure stops that stage's remaining gates.

import { loadContract, validate } from './schema.mjs';

export const STAGE_FILES = {
  project: 'project.json',
  outline: 'outline.json',
  script: 'script.json',
};

// Upstream stages each stage reads.
export const STAGE_DEPS = {
  project: [],
  outline: ['project'],
  script: ['project', 'outline'],
};

const DEFAULT_SPEECH = {
  zh: { charsPerSecond: 4.5, defaultActionSeconds: 2 },
  en: { charsPerSecond: 2.5, defaultActionSeconds: 2 },
};

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

export function speechSettings(project) {
  return { ...DEFAULT_SPEECH[project.language], ...project.speech };
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

function outlineGates({ project, outline }) {
  const schema = schemaGate('O1', 'outline', outline);
  if (schema.length) return schema;
  const file = 'outline.json';
  const out = [];

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
  return out;
}

function scriptGates({ project, outline, script }) {
  const schema = schemaGate('S1', 'script', script);
  if (schema.length) return schema;
  const file = 'script.json';
  const out = [];

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
      });
    });
    const seconds = episodeSeconds(ep, project);
    if (seconds < min || seconds > max) {
      out.push(finding('S7', 'error', file, `/episodes/${i}`, `第 ${ep.number} 集估算 ${seconds.toFixed(1)} 秒，超出 ${min}–${max} 秒`));
    }
  });
  return out;
}

const RUNNERS = { project: projectGates, outline: outlineGates, script: scriptGates };

// data: { project?, outline?, script? } already parsed. Returns findings for one stage.
// Missing or schema-invalid upstream data is reported as gate X1 instead of running the stage.
export function runStage(stage, data) {
  const file = STAGE_FILES[stage];
  if (data[stage] === undefined) return [finding('X0', 'error', file, '/', `缺少 ${file}`)];
  for (const dep of STAGE_DEPS[stage]) {
    if (data[dep] === undefined || RUNNERS[dep](data).some((f) => f.level === 'error')) {
      return [finding('X1', 'error', file, '/', `上游 ${STAGE_FILES[dep]} 缺失或未通过质量门，先修上游`)];
    }
  }
  return RUNNERS[stage](data);
}
