// `node summarize.mjs <runtime> <pinned|latest> results.json [probesDirectory]` prints a job summary.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { compareOutcomes, implementedMocks, proposeOverrides } from './compare.mjs';
import { pinnedVersion, readMatrix, readOverrides } from './data.mjs';

const [runtime, channel, resultsFile, probesDirectory] = process.argv.slice(2);
const { version, outcomes, mocked } = JSON.parse(readFileSync(resultsFile, 'utf8'));
const overrides = readOverrides(runtime);

const section = (title, items) =>
  items.length > 0 ? [`### ${title}`, ...items.map(item => `- ${item}`), ''] : [];

const disagreements = compareOutcomes(outcomes, overrides, readMatrix(runtime)).map(
  ({ api, message }) => `\`${api}\`: ${message}`,
);
const lines = [
  `## ${runtime} ${version} (${channel}, pinned ${pinnedVersion(runtime)})`,
  '',
  ...(channel === 'pinned'
    ? section('Disagreements with the overrides and the matrix', disagreements)
    : section('Curated stubs that now work (bump the pinned data)', disagreements)),
  ...section(
    'Mocked entries that are now implemented',
    implementedMocks(mocked).map(api => `\`${api}\``),
  ),
  ...section(
    'Proposed overrides',
    proposeOverrides(outcomes, overrides).map(api => `\`${api}\``),
  ),
];
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
