// Runs inside the runtime being probed: `<runtime> run.mjs spec.json results.json`.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runMockedChecks } from './mocked-checks.mjs';
import { probeApis } from './probe.mjs';

const [specFile, resultsFile] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
const version = globalThis.Bun?.version ?? globalThis.Deno?.version.deno ?? process.versions.node;

// A call made with no arguments may fail later, on a promise nothing holds. That says nothing more
// about the API, and must not end the run: older runtimes exit on it.
globalThis.addEventListener?.('unhandledrejection', event => event.preventDefault());
process.on('unhandledRejection', () => {});

process.chdir(mkdtempSync(path.join(tmpdir(), 'edgefit-probe-')));
const outcomes = await probeApis(spec.apis);
const mocked = await runMockedChecks(spec.mocked);
writeFileSync(resultsFile, JSON.stringify({ version, outcomes, mocked }));
process.exit(0);
