// `node summarize.mjs <runtime> <pinned|latest> results.json [probesDirectory]` prints a job summary.
// For the latest channel it also writes `drift.json`, which the report job turns into an issue.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compareOutcomes, proposeOverrides } from './compare.mjs';
import { pinnedVersion, readMatrix, readOverrides } from './data.mjs';
import { driftFor } from './drift.mjs';

const [runtime, channel, resultsFile, probesDirectory] = process.argv.slice(2);
const { version, outcomes, mocked } = JSON.parse(readFileSync(resultsFile, 'utf8'));
const overrides = readOverrides(runtime);

const section = (title, items) =>
  items.length > 0 ? [`### ${title}`, ...items.map(item => `- ${item}`), ''] : [];
const code = api => `\`${api}\``;

const heading = `## ${runtime} ${version} (${channel}, pinned ${pinnedVersion(runtime)})`;
// Netlify runs Deno; this run shows what the Deno data gets wrong for the oldest Deno it supports.
const intro =
  channel === 'netlify-min'
    ? [
        `The oldest Deno Netlify's bundler supports is ${version}, and the data describes ${pinnedVersion(runtime)}. Each line is an API where they differ; Netlify's production version is not documented, so this informs a review and changes no data.`,
        '',
      ]
    : [];
const proposed = section('Proposed overrides', proposeOverrides(outcomes, overrides).map(code));
let lines;

if (channel === 'latest') {
  const drift = driftFor({
    runtime,
    pinned: pinnedVersion(runtime),
    latest: version,
    outcomes,
    mocked,
    overrides,
  });
  writeFileSync('drift.json', `${JSON.stringify(drift, null, 2)}\n`);
  lines = [
    heading,
    '',
    ...section(
      'Marked missing in the data, but present in this release',
      drift.nowPresent.map(code),
    ),
    ...section('Curated stubs that now work (bump the pinned data)', drift.stubsNowWork.map(code)),
    ...section('Mocked entries that are now implemented', drift.mocksImplemented.map(code)),
    ...proposed,
  ];
} else {
  const disagreements = compareOutcomes(outcomes, overrides, readMatrix(runtime)).map(
    ({ api, message }) => `\`${api}\`: ${message}`,
  );
  lines = [
    heading,
    '',
    ...intro,
    ...section('Disagreements with the overrides and the matrix', disagreements),
    ...proposed,
  ];
}
console.log(lines.length > 2 ? lines.join('\n') : `${lines.join('\n')}\nNo disagreements.\n`);

if (channel === 'pinned' && probesDirectory) {
  const sorted = Object.fromEntries(
    Object.entries(outcomes).sort(([a], [b]) => a.localeCompare(b)),
  );
  mkdirSync(probesDirectory, { recursive: true });
  writeFileSync(
    path.join(probesDirectory, `${runtime}.json`),
    `${JSON.stringify({ runtime, version, outcomes: sorted }, null, 2)}\n`,
  );
}
