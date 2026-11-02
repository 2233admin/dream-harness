// Zero-dependency validator for the JSON Schema subset used by contracts/.
// Supported keywords: type, const, enum, required, properties, additionalProperties,
// items, minItems, minLength, pattern, minimum, maximum, $ref (local "#/$defs/..."), $defs.
// Any other keyword in a contract is a contract bug, so it throws instead of passing silently.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CONTRACTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts');

const SUPPORTED = new Set([
  '$schema', '$id', 'title', 'description', '$defs', '$ref',
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'minLength', 'pattern', 'minimum', 'maximum',
]);

const cache = new Map();

export function loadContract(name) {
  if (!cache.has(name)) {
    const file = join(CONTRACTS_DIR, `${name}.schema.json`);
    cache.set(name, JSON.parse(readFileSync(file, 'utf8')));
  }
  return cache.get(name);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`unresolved $ref: ${ref}`);
  }
  return node;
}

function pointer(path) {
  return path.length === 0 ? '/' : '/' + path.join('/');
}

function walk(root, schema, value, path, errors) {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`unsupported schema keyword "${key}" at ${pointer(path)}`);
  }
  if (schema.$ref) {
    walk(root, resolveRef(root, schema.$ref), value, path, errors);
    return;
  }
  const at = pointer(path);
  if ('const' in schema && value !== schema.const) {
    errors.push({ path: at, message: `必须等于 ${JSON.stringify(schema.const)}` });
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path: at, message: `必须是 ${schema.enum.map((v) => JSON.stringify(v)).join(' / ')} 之一` });
    return;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push({ path: at, message: `类型应为 ${schema.type}，实际为 ${typeOf(value)}` });
    return;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: at, message: `长度至少为 ${schema.minLength}` });
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      errors.push({ path: at, message: `不符合格式 ${schema.pattern}` });
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: at, message: `不得小于 ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path: at, message: `不得大于 ${schema.maximum}` });
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: at, message: `至少需要 ${schema.minItems} 项` });
    }
    if (schema.items) {
      value.forEach((item, i) => walk(root, schema.items, item, [...path, String(i)], errors));
    }
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push({ path: at, message: `缺少必填字段 "${key}"` });
    }
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (key in props) {
        walk(root, props[key], child, [...path, key], errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: pointer([...path, key]), message: `不允许的字段 "${key}"` });
      } else if (typeof schema.additionalProperties === 'object') {
        walk(root, schema.additionalProperties, child, [...path, key], errors);
      }
    }
  }
}

// Returns [{ path, message }]; empty array means valid.
export function validate(schema, value) {
  const errors = [];
  walk(schema, schema, value, [], errors);
  return errors;
}
