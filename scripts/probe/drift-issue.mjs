// `node drift-issue.mjs <reportsDirectory> <bodyFile>` writes the issue text for the runtimes that
// drifted, and sets the `drift` output for the workflow. Each subdirectory holds one `drift.json`.
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { renderIssue } from './drift.mjs';

const [reportsDirectory, bodyFile] = process.argv.slice(2);
const drifts = readdirSync(reportsDirectory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => path.join(reportsDirectory, entry.name, 'drift.json'))
  .map(file => JSON.parse(readFileSync(file, 'utf8')));

const { body, drift } = renderIssue(drifts);
writeFileSync(bodyFile, body);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `drift=${drift}\n`);
}
console.log(body);
