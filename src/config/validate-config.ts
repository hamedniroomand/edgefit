import { EdgefitError } from '@/errors.ts';
import { isTargetKey } from '@/targets/index.ts';
import type { EdgefitConfig } from '@/types.ts';

const categories = new Set<string>(['unsupported', 'mocked', 'mismatch', 'web', 'unknown']);
const levels = new Set<string>(['error', 'warning', 'off']);

function fail(file: string, problem: string): never {
  throw new EdgefitError(`Invalid config in ${file}: ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateTargets(value: unknown, file: string): void {
  if (!isStringArray(value) || value.length === 0) {
    fail(file, '`targets` must be a non-empty array of target names');
  }
  const unknown = value.filter(target => !isTargetKey(target));
  if (unknown.length > 0) {
    fail(file, `unknown target ${unknown.join(', ')}`);
  }
}

function validateLevels(value: unknown, file: string): void {
  if (!isRecord(value)) {
    fail(file, '`levels` must be an object');
  }
  for (const [category, level] of Object.entries(value)) {
    if (!categories.has(category)) {
      fail(file, `unknown category \`${category}\` in \`levels\``);
    }
    if (typeof level !== 'string' || !levels.has(level)) {
      fail(file, `\`levels.${category}\` must be error, warning or off`);
    }
  }
}

function validateIgnore(value: unknown, file: string): void {
  if (!Array.isArray(value)) {
    fail(file, '`ignore` must be an array');
  }
  for (const rule of value) {
    if (!isRecord(rule) || (rule.package === undefined && rule.api === undefined)) {
      fail(file, 'each `ignore` rule needs a `package`, an `api`, or both');
    }
  }
}

function validateBun(value: unknown, file: string): void {
  if (!isRecord(value)) {
    fail(file, '`bun` must be an object');
  }
  if (value.version !== undefined && typeof value.version !== 'string') {
    fail(file, '`bun.version` must be a string');
  }
}

function validateDeno(value: unknown, file: string): void {
  if (!isRecord(value)) {
    fail(file, '`deno` must be an object');
  }
  const { configFile } = value;
  if (configFile !== undefined && configFile !== false && typeof configFile !== 'string') {
    fail(file, '`deno.configFile` must be a string or false');
  }
}

function validateNetlify(value: unknown, file: string): void {
  if (!isRecord(value)) {
    fail(file, '`netlify` must be an object');
  }
  const { configFile } = value;
  if (configFile !== undefined && configFile !== false && typeof configFile !== 'string') {
    fail(file, '`netlify.configFile` must be a string or false');
  }
}

function validateEnv(value: unknown, file: string): void {
  if (!isRecord(value)) {
    fail(file, '`env` must be an object');
  }
  if (value.NODE_ENV !== undefined && typeof value.NODE_ENV !== 'string') {
    fail(file, '`env.NODE_ENV` must be a string');
  }
}

/** Checks the shape of a loaded config, since a config file is not type checked at runtime. */
export function validateConfig(value: unknown, file: string): EdgefitConfig {
  if (!isRecord(value)) {
    fail(file, 'the default export must be an object');
  }
  if (value.targets !== undefined) {
    validateTargets(value.targets, file);
  }
  if (value.entry !== undefined && typeof value.entry !== 'string') {
    fail(file, '`entry` must be a string');
  }
  if (value.conditions !== undefined && !isStringArray(value.conditions)) {
    fail(file, '`conditions` must be an array of strings');
  }
  if (value.levels !== undefined) {
    validateLevels(value.levels, file);
  }
  if (value.ignore !== undefined) {
    validateIgnore(value.ignore, file);
  }
  if (value.workerd !== undefined && !isRecord(value.workerd)) {
    fail(file, '`workerd` must be an object');
  }
  if (value.bun !== undefined) {
    validateBun(value.bun, file);
  }
  if (value.deno !== undefined) {
    validateDeno(value.deno, file);
  }
  if (value.netlify !== undefined) {
    validateNetlify(value.netlify, file);
  }
  if (value.env !== undefined) {
    validateEnv(value.env, file);
  }
  return value as EdgefitConfig;
}
