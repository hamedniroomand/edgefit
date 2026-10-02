// `node witness/check.mjs <netlify|vercel>` reads the deployed witness, prints a job summary and
// writes `witness.json`. A witness that does not answer gives a warning and no error: the witness
// is evidence for a review, and the data never depends on it.
import { writeFileSync } from 'node:fs';

import { netlifyMinimumDeno, readMatrix, readOverrides } from '../data.mjs';
import { webMissingApis } from '../web.mjs';
import { compareNetlify, compareVercel } from './compare.mjs';
import { vercelGlobals, witnessSpec } from './spec.mjs';

/**
 * The deployed witnesses. `names` marks an entry whose own names on `globalThis` are its globals.
 * On the Vercel edge route, `globalThis` hides most of them.
 */
export const witnessUrls = {
  netlify: { 'edge-function': { url: 'https://edgefit-witness.netlify.app/', names: true } },
  vercel: {
    middleware: { url: 'https://edgefit-witness.vercel.app/middleware', names: true },
    'edge-function': { url: 'https://edgefit-witness.vercel.app/api/witness', names: false },
  },
};

const [platform] = process.argv.slice(2);

/** Each platform reads its data once and returns the comparison for one answer. */
const comparers = {
  netlify() {
    const data = {
      deno: netlifyMinimumDeno(),
      overrides: { ...readOverrides('deno'), ...readOverrides('netlify-edge') },
      matrix: readMatrix('deno'),
      webMissing: new Set(webMissingApis('deno')),
    };
    return results => compareNetlify(results, data);
  },
  vercel() {
    const blocked = new Set(Object.keys(readOverrides('vercel-edge')));
    const accepted = new Set(vercelGlobals());
    return (results, { names }) => ({
      sections: compareVercel(results, { blocked, accepted: names ? accepted : undefined }),
      lines: [],
    });
  },
};
const compare = comparers[platform]();

const isObject = value => value !== null && typeof value === 'object';

// A protection page or an old deploy can answer 200 with other JSON. A witness from before `types`
// still answers, so the summary can say that it is out of date.
const isWitnessAnswer = results =>
  typeof results?.specHash === 'string' &&
  Array.isArray(results.names) &&
  (results.types === undefined || isObject(results.types)) &&
  isObject(results.outcomes) &&
  isObject(results.checks);

async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  const results = await response.json();
  if (!isWitnessAnswer(results)) {
    throw new Error(`${url} did not answer with witness results`);
  }
  return { ...results, types: results.types ?? {} };
}

const { hash } = witnessSpec(platform);
const observed = {};
const lines = [];
for (const [entry, witness] of Object.entries(witnessUrls[platform])) {
  let results;
  try {
    results = await read(witness.url);
  } catch (error) {
    console.error(`::warning::The ${platform} ${entry} witness did not answer: ${error.message}`);
    continue;
  }
  observed[entry] = results;
  lines.push(
    `## ${platform} witness (${entry})${results.deno ? ` · Deno ${results.deno}` : ''}`,
    '',
  );
  if (results.specHash !== hash) {
    lines.push(
      'The witness has an older list of APIs than the repository. Run the Witness workflow to redeploy it.',
      '',
    );
  }
  if (results.typesError) {
    lines.push(`The typeof scan failed, so no global is compared: ${results.typesError}`, '');
  }
  const { sections, lines: disagreements } = compare(results, witness);
  for (const { title, items } of sections) {
    lines.push(`### ${title}`, ...items.map(item => `- \`${item}\``), '');
  }
  lines.push(...disagreements);
  if (sections.length === 0 && disagreements.length === 0) {
    lines.push('No disagreements.', '');
  }
  lines.push('| Check | Ran | Value or error |', '| --- | --- | --- |');
  for (const [name, { allowed, value, error }] of Object.entries(results.checks)) {
    const detail = (value ?? error ?? '').replaceAll('|', '\\|');
    lines.push(`| \`${name}\` | ${allowed ? 'yes' : 'no'} | ${detail} |`);
  }
  lines.push('');
}
console.log(lines.join('\n'));
writeFileSync('witness.json', `${JSON.stringify(observed, null, 2)}\n`);
