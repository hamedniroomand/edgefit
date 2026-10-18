import { readFileSync } from 'node:fs';
import path from 'node:path';

const dataDirectory = path.join(import.meta.dirname, '../../data');

export const readData = file => JSON.parse(readFileSync(path.join(dataDirectory, file), 'utf8'));

export const RUNTIMES = ['bun', 'deno', 'workerd'];

export const pinnedVersion = runtime =>
  readData('source.json').sources.find(source => source.provider === 'workers-nodejs-compat-matrix')
    .versions[runtime];

/**
 * The netlify-edge version: the Deno that the production witness measured on Netlify, or the oldest
 * Deno that Netlify's bundler supports until the witness measures one.
 */
export const netlifyMinimumDeno = () =>
  readData('source.json').sources.find(source => source.provider === 'overrides/netlify-edge')
    .versions['netlify-edge'];

export const workerdSettings = () =>
  readData('source.json').sources.find(source => source.provider === 'workers-nodejs-compat-matrix')
    .settings.workerd;

/**
 * The curated entries the probe checks: the member entries, and the modules recorded as `present`,
 * which load on the target and so count as `supported` overrides of the module itself.
 */
export const readOverrides = runtime => {
  const { present = {}, apis } = readData(`overrides/${runtime}.json`);
  const modules = Object.entries(present).map(([module, entry]) => [
    module,
    { status: 'supported', ...entry },
  ]);
  return { ...Object.fromEntries(modules), ...apis };
};

/** The matrix keys prefix-only modules such as `node:sqlite` with their prefix. */
const withoutNodePrefix = dump =>
  Object.fromEntries(Object.entries(dump).map(([key, node]) => [key.replace(/^node:/u, ''), node]));

export const readMatrix = file =>
  withoutNodePrefix(readData(`workers-nodejs-compat-matrix/${file}.json`));
