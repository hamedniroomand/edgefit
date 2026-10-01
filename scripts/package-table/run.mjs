// Usage: node run.mjs <edgefit-cli> <out-dir> [shard-index shard-count]
// Checks this shard's packages one after another. A package that times out or fails to install is
// written as an error result, so one broken package never fails the run.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { fileNameOf, readList } from './list.mjs';

const [cli, out, index = '0', count = '1'] = process.argv.slice(2);
const timeoutMs = 10 * 60 * 1000;
mkdirSync(out, { recursive: true });

const failed = (name, message) => ({
  version: 1,
  package: name,
  resolved: null,
  checkedAt: new Date().toISOString(),
  targets: [],
  summary: {},
  entries: [],
  error: message,
});

readList().forEach((entry, position) => {
  if (position % Number(count) !== Number(index)) {
    return;
  }
  const args = [cli, 'package', entry.name, '--format', 'json'];
  for (const subpath of entry.skip ?? []) {
    args.push('--skip', subpath);
  }
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: timeoutMs });
  let result;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    const detail = run.error?.message ?? run.stderr.trim().split('\n').slice(-2).join(' ');
    result = failed(entry.name, detail || 'no result');
  }
  if (entry.notes !== undefined) {
    result.notes = entry.notes;
  }
  writeFileSync(
    path.join(out, `${fileNameOf(entry.name)}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(`${entry.name}: ${result.error ?? JSON.stringify(result.summary)}`);
});
