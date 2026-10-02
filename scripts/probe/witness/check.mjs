// `node witness/check.mjs <netlify|vercel>` reads the deployed witness, prints a job summary and
// writes `witness.json`. A witness that does not answer gives a warning and no error: the witness
// is evidence for a review, and the data never depends on it.
import { writeFileSync } from 'node:fs';

import { netlifyMinimumDeno, readData, readMatrix, readOverrides } from '../data.mjs';
import { webMissingApis } from '../web.mjs';
import { compareNetlify, compareVercel } from './compare.mjs';
import { witnessSpec } from './spec.mjs';

export const witnessUrls = {
  netlify: { 'edge-function': 'https://edgefit-witness.netlify.app/' },
  vercel: {
    middleware: 'https://edgefit-witness.vercel.app/middleware',
    'edge-function': 'https://edgefit-witness.vercel.app/api/witness',
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
    const allowlist = readData('allowlists/vercel-edge.json');
    const accepted = new Set([
      ...allowlist.globals,
      ...allowlist.languageGlobals,
      ...allowlist.emulatorGlobals,
      ...Object.keys(allowlist.globalMembers),
    ]);
    return results => ({ sections: compareVercel(results, accepted), lines: [] });
  },
};
const compare = comparers[platform]();

// A protection page or an old deploy can answer 200 with other JSON.
const isWitnessAnswer = results =>
  typeof results?.specHash === 'string' &&
  Array.isArray(results.names) &&
  typeof results.outcomes === 'object' &&
  typeof results.checks === 'object';

async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  const results = await response.json();
  if (!isWitnessAnswer(results)) {
    throw new Error(`${url} did not answer with witness results`);
  }
  return results;
}

const { hash } = witnessSpec(platform);
const observed = {};
const lines = [];
for (const [entry, url] of Object.entries(witnessUrls[platform])) {
  let results;
  try {
    results = await read(url);
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
  const { sections, lines: disagreements } = compare(results);
  for (const { title, items } of sections) {
    lines.push(`### ${title}`, ...items.map(item => `- \`${item}\``), '');
  }
  lines.push(...disagreements);
  if (sections.length === 0 && disagreements.length === 0) {
    lines.push('No disagreements.', '');
  }
  lines.push('| Check | Allowed | Error |', '| --- | --- | --- |');
  for (const [name, { allowed, error }] of Object.entries(results.checks)) {
    lines.push(
      `| \`${name}\` | ${allowed ? 'yes' : 'no'} | ${error?.replaceAll('|', '\\|') ?? ''} |`,
    );
  }
  lines.push('');
}
console.log(lines.join('\n'));
writeFileSync('witness.json', `${JSON.stringify(observed, null, 2)}\n`);
