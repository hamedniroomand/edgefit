// Usage: node verify.mjs <shards-dir> <out-dir> <runtime>
// Runs every planned package on one runtime, judges each run against its row, and writes
// `<out-dir>/<file>.json`. Exits 1 when a run contradicts its row or a reach script is rejected.
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fileNameOf } from '../list.mjs';
import { entrySource } from './entry.mjs';
import { install } from './install.mjs';
import { judge } from './judge.mjs';
import { planOf, scriptOf } from './scripts.mjs';

const [shards, out, runtime] = process.argv.slice(2);
if (!['bun', 'deno', 'workerd'].includes(runtime)) {
  throw new Error(`Unknown runtime: ${runtime}. Use bun, deno or workerd.`);
}
const engine = await import(`./runtimes/${runtime}.mjs`);
const scripts = path.join(import.meta.dirname, '../../../table/verify');
const work = mkdtempSync(path.join(tmpdir(), `edgefit-verify-${runtime}-`));
mkdirSync(out, { recursive: true });

/** The package results of every shard. */
function readResults() {
  return readdirSync(shards).flatMap(shard =>
    readdirSync(path.join(shards, shard))
      .filter(name => name.endsWith('.json'))
      .map(name => JSON.parse(readFileSync(path.join(shards, shard, name), 'utf8'))),
  );
}

/** Installs, runs and judges one planned package. */
async function verifyPackage(plan, file) {
  const installed = install(work, file, plan.package, plan.resolved);
  if (installed.error !== undefined) {
    return { outcome: 'absent', kind: plan.kind, reason: 'install', error: installed.error };
  }
  const reach = plan.kind === 'reach';
  const source = entrySource({ specifier: plan.specifier, reach, host: engine.host });
  writeFileSync(path.join(installed.directory, 'entry.mjs'), source);
  if (reach) {
    copyFileSync(plan.script, path.join(installed.directory, 'reach.mjs'));
  }
  const { run, failure } = await engine.run(installed.directory);
  return run === undefined
    ? { outcome: 'absent', kind: plan.kind, reason: failure }
    : judge({ status: plan.status, run, findings: plan.findings });
}

const version = engine.version();
const lines = [];
const failures = [];
for (const result of readResults()) {
  const file = fileNameOf(result.package);
  const plan = planOf(result, runtime, scriptOf(scripts, file));
  if (plan === undefined) {
    continue;
  }
  // eslint-disable-next-line no-await-in-loop -- one package at a time: each run uses the same port
  const cell = await verifyPackage(plan, file);
  const record = { package: plan.package, resolved: plan.resolved, runtime, version, cell };
  writeFileSync(path.join(out, `${file}.json`), `${JSON.stringify(record, null, 2)}\n`);
  const why = [cell.api, cell.reason, cell.error].filter(Boolean).join(', ');
  lines.push(`| \`${plan.package}\` | ${plan.status} | ${cell.kind} | ${cell.outcome} | ${why} |`);
  if (cell.outcome === 'mismatch') {
    failures.push(`- \`${plan.package}\`: ${plan.status} row, but ${cell.error}`);
  }
  if (plan.problem !== undefined) {
    failures.push(`- \`${plan.package}\`: reach script rejected, ${plan.problem}`);
  }
  console.log(`${plan.package}: ${cell.outcome} (${cell.kind})${why === '' ? '' : `, ${why}`}`);
}

const summary = [
  `## Verify on ${runtime} ${version}`,
  '| Package | Row | Run | Outcome | Detail |\n| --- | --- | --- | --- | --- |',
  lines.join('\n'),
  failures.length === 0 ? 'No mismatches.' : `### Needs a fix\n${failures.join('\n')}`,
].join('\n\n');
if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
process.exitCode = failures.length === 0 ? 0 : 1;
