// `node netlify/check.mjs` compares Netlify's Edge Functions docs and the Deno range of
// @netlify/edge-bundler with what the data records, prints a job summary and writes `drift.json`.
import { writeFileSync } from 'node:fs';

import { readData } from '../data.mjs';
import { readPackageFile } from '../tarball.mjs';
import { compareNetlify, hashPages, parseDenoRange, watched } from './docs.mjs';

const recorded = readData('overrides/netlify-edge.json');
const source = readData('source.json').sources.find(
  entry => entry.provider === 'overrides/netlify-edge',
);

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.text();
}

const pages = {};
for (const { url } of Object.values(watched)) {
  pages[url] ??= await get(url);
}

const bundler = await readPackageFile('@netlify/edge-bundler', 'dist/node/bridge.js');
const latest = { version: bundler.version };
const { range } = parseDenoRange(bundler.text);
if (range === undefined) {
  // A bundler that moved the constant would otherwise read as "the range was removed".
  throw new Error(
    '@netlify/edge-bundler no longer has DENO_VERSION_RANGE in dist/node/bridge.js; update netlify/docs.mjs',
  );
}

const sections = compareNetlify({ hashes: hashPages(pages), range }, recorded);
const lines = [
  `## netlify-edge · @netlify/edge-bundler ${latest.version} (data ${recorded.bundler.version}) · Deno ${range} (data ${source.versions['netlify-edge']})`,
  '',
];
for (const { title, items } of sections) {
  lines.push(`### ${title}`, ...items.map(item => `- \`${item}\``), '');
}
if (sections.length === 0) {
  lines.push('No disagreements.', '');
}
console.log(lines.join('\n'));

writeFileSync(
  'drift.json',
  `${JSON.stringify(
    {
      runtime: 'netlify-edge',
      pinned: `bundler ${recorded.bundler.version}, Deno ${recorded.bundler.denoRange}`,
      latest: `bundler ${latest.version}, Deno ${range}`,
      nowPresent: [],
      stubsNowWork: [],
      mocksImplemented: [],
      sections,
    },
    null,
    2,
  )}\n`,
);
