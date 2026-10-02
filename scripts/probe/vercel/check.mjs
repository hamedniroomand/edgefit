// `node vercel/check.mjs <pinned|latest> emulator-results.json [docs.md]` prints a job summary.
// Fetches Vercel's Edge Runtime page unless a saved copy is given. For the latest channel it also
// writes `drift.json` for the issue job, with the docs and the emulator each as sections.
import { readFileSync, writeFileSync } from 'node:fs';

import { readData } from '../data.mjs';
import { readPackageFiles } from '../tarball.mjs';
import { vercelGlobals } from '../witness/spec.mjs';
import { compareDocs, parseEdgeDocs } from './docs.mjs';
import { compareEmulator } from './emulator.mjs';
import {
  compareMembers,
  compareNext,
  compareSources,
  hasStandIn,
  nextPluginFile,
  nextSandboxFile,
  parseNativeModuleMap,
  parseSupportedModules,
  vercelNodeFile,
} from './next.mjs';

export const docsUrl = 'https://vercel.com/docs/functions/runtimes/edge.md';

const [channel, resultsFile, docsFile] = process.argv.slice(2);
const allowlist = readData('allowlists/vercel-edge.json');
const overrides = readData('overrides/vercel-edge.json');
const source = readData('source.json').sources.find(
  entry => entry.provider === 'allowlist/vercel-edge',
);
const results = JSON.parse(readFileSync(resultsFile, 'utf8'));

async function readDocs() {
  if (docsFile) {
    return readFileSync(docsFile, 'utf8');
  }
  const response = await fetch(docsUrl);
  if (!response.ok) {
    throw new Error(`${docsUrl} answered ${response.status}`);
  }
  return response.text();
}

const parsed = parseEdgeDocs(await readDocs());
if (parsed.lastUpdated === undefined || Object.keys(parsed.modules).length === 0) {
  // A page that no longer parses would otherwise read as "everything was removed".
  throw new Error(`${docsUrl} no longer has the tables edgefit reads; update vercel/docs.mjs`);
}

const accepted = new Set(vercelGlobals(allowlist));
const docsSections = compareDocs(parsed, allowlist, overrides).map(section => ({
  ...section,
  title: `Vercel docs: ${section.title}`,
}));
const emulatorSections = compareEmulator(results, parsed.globals, accepted).map(section => ({
  ...section,
  title: `Emulator: ${section.title}`,
}));
// Next.js is where most Edge code runs, and two pieces of Vercel's own code are the other witnesses:
// Next keeps the same five modules and stubs out the rest, so that importing one does not fail, and
// Next's edge sandbox and @vercel/node's dev server list which members of the five exist.
async function readWitnesses() {
  const next = await readPackageFiles('next', [nextPluginFile, nextSandboxFile]);
  const vercelNode = await readPackageFiles('@vercel/node', [vercelNodeFile]);
  const supported = parseSupportedModules(next.texts[nextPluginFile]);
  const nextMembers = parseNativeModuleMap(next.texts[nextSandboxFile]);
  const vercelMembers = parseNativeModuleMap(vercelNode.texts[vercelNodeFile]);
  // A file that moved would otherwise read as "everything was removed".
  if (supported === undefined) {
    throw new Error(
      `next ${next.version} no longer has SUPPORTED_NATIVE_MODULES in ${nextPluginFile}; update vercel/next.mjs`,
    );
  }
  if (nextMembers === undefined) {
    throw new Error(
      `next ${next.version} no longer has NativeModuleMap in ${nextSandboxFile}; update vercel/next.mjs`,
    );
  }
  if (vercelMembers === undefined) {
    throw new Error(
      `@vercel/node ${vercelNode.version} no longer has NativeModuleMap in ${vercelNodeFile}; update vercel/next.mjs`,
    );
  }
  const modules = Object.keys(allowlist.modules);
  return {
    versions: `next ${next.version}, @vercel/node ${vercelNode.version}`,
    sections: [
      ...compareNext({ supported, standIn: hasStandIn(next.texts[nextPluginFile]) }, modules),
      ...compareMembers(`Next.js ${next.version}`, nextMembers, allowlist.modules),
      ...compareMembers(`@vercel/node ${vercelNode.version}`, vercelMembers, allowlist.modules),
      ...compareSources(nextMembers, vercelMembers),
    ],
  };
}

const witnesses = channel === 'latest' ? await readWitnesses() : undefined;
const nextSections = witnesses?.sections ?? [];
const sections =
  channel === 'latest' ? [...docsSections, ...emulatorSections, ...nextSections] : emulatorSections;

const heading = `## vercel-edge (${channel}) · @edge-runtime/vm ${results.version} · docs ${parsed.lastUpdated} · data ${source.versions['vercel-edge']}${witnesses === undefined ? '' : ` · ${witnesses.versions}`}`;
const lines = [heading, ''];
for (const { title, items } of sections) {
  lines.push(`### ${title}`, ...items.map(item => `- \`${item}\``), '');
}
if (sections.length === 0) {
  lines.push('No disagreements.', '');
}
console.log(lines.join('\n'));

if (channel === 'latest') {
  const drift = {
    runtime: 'vercel-edge',
    pinned: `docs ${source.versions['vercel-edge']}, vm ${allowlist.emulator.version}`,
    latest: `docs ${parsed.lastUpdated}, vm ${results.version}${witnesses === undefined ? '' : `, ${witnesses.versions}`}`,
    nowPresent: [],
    stubsNowWork: [],
    mocksImplemented: [],
    sections,
  };
  writeFileSync('drift.json', `${JSON.stringify(drift, null, 2)}\n`);
}
