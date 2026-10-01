import { readFileSync } from 'node:fs';
import path from 'node:path';

const dataDirectory = path.join(import.meta.dirname, '../../data');

export const readData = file => JSON.parse(readFileSync(path.join(dataDirectory, file), 'utf8'));

export const RUNTIMES = ['bun', 'deno', 'workerd'];

export const pinnedVersion = runtime =>
  readData('source.json').sources.find(source => source.provider === 'workers-nodejs-compat-matrix')
    .versions[runtime];

/** The oldest Deno Netlify's bundler supports, which the data records as the netlify-edge version. */
export const netlifyMinimumDeno = () =>
  readData('source.json').sources.find(source => source.provider === 'overrides/netlify-edge')
    .versions['netlify-edge'];

export const workerdSettings = () =>
  readData('source.json').sources.find(source => source.provider === 'workers-nodejs-compat-matrix')
    .settings.workerd;

export const readOverrides = runtime => readData(`overrides/${runtime}.json`).apis;

/** The matrix keys prefix-only modules such as `node:sqlite` with their prefix. */
const withoutNodePrefix = dump =>
  Object.fromEntries(Object.entries(dump).map(([key, node]) => [key.replace(/^node:/u, ''), node]));

export const readMatrix = file =>
  withoutNodePrefix(readData(`workers-nodejs-compat-matrix/${file}.json`));
