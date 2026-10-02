import { staleNote } from '@/built/stale.ts';
import { readVercelOutput } from '@/built/vercel-output.ts';
import type { LookupResult } from '@/data/dump.ts';
import { detectEntries } from '@/targets/entries.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';
import type { ApiRef } from '@/types.ts';

import { findVercelSources } from './entries.ts';

// Next.js resolves Edge code with `edge-light` and `browser`, then `import` and `default`
// (crates/next-core/src/next_edge/context.rs); `@vercel/node`'s dev server does the same with
// esbuild's `platform: 'browser'`. Neither adds `worker`.
export const vercelEdgeConditions = ['edge-light', 'module'];

const outputDirectory = '.vercel/output';

const notAllowed: LookupResult = {
  status: 'unsupported',
  note: 'does not exist on the target',
  absent: true,
};

/**
 * The docs list `process.env` among the globals, and `node:process` is not one of the allowed
 * modules. The extractor reads both as the `process` module, so a reference that came from the
 * global is looked up as a global. One that came from an import has nothing to match: Next.js
 * replaces the module with a stand-in that throws when it is read.
 */
function isProcessImport(api: ApiRef): boolean {
  return api.module === 'process' && api.global !== true;
}

function toVercelRef(api: ApiRef): ApiRef {
  return api.module === 'process' && api.global === true
    ? { module: '*globals*', path: ['process', ...api.path] }
    : api;
}

export function createVercelEdgeTarget(root: string): Target {
  const { index, matrixSource, description, globals } = loadTargetData('vercel-edge');
  const docsDate = matrixSource.versions['vercel-edge'] ?? 'unknown';
  const { entries, label, notes } = findVercelSources(root);
  const output = readVercelOutput(root, outputDirectory);
  return {
    info: {
      key: 'vercel-edge',
      platform: 'Vercel Edge',
      conditions: vercelEdgeConditions,
      data: description,
      settings: `Vercel Edge runtime as documented on ${docsDate}`,
      notes: [
        `Based on Vercel's Edge runtime documentation (${docsDate}) and runtime-compat-data, not on a run in production. ` +
          'Anything the documentation does not list is reported as missing.',
        'Vercel recommends the Node.js runtime for functions. Routing Middleware still runs on the edge runtime by default.',
        'Export conditions follow the Next.js resolver; Edge Functions outside Next.js may resolve `module` differently.',
        'Importing a Node.js module Vercel lacks is not reported, only reading from it: Next.js replaces it with a stand-in that throws when it is used (globalThis.__import_unsupported, next 16.3.8, webpack build). Outside Next.js an import alone may fail.',
        "Calling `require` directly is not allowed on Vercel's Edge runtime; edgefit does not check for it.",
        ...notes,
      ],
    },
    runtimes: ['vercel-edge'],
    resolvePlatform: 'browser',
    nodeEnv: 'production',
    entries: detectEntries(
      [
        { label, guessed: false, find: () => entries },
        {
          label: `${outputDirectory} (build output)`,
          guessed: false,
          built: true,
          find: () => output.files,
          notes: files => [
            ...staleNote(root, files, entries),
            ...output.unreadable.map(
              file => `${file} could not be read, so that function was skipped.`,
            ),
          ],
        },
      ],
      false,
    ),
    lazyNodeImports: true,
    globals,
    hasGlobal: name => index.globalNames().includes(name),
    lookup: api => (isProcessImport(api) ? notAllowed : index.lookup(toVercelRef(api))),
    hasProblemsBelow: api => isProcessImport(api) || index.hasProblemsBelow(toVercelRef(api)),
  };
}
