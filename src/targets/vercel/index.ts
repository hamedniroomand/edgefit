import { existsSync } from 'node:fs';
import path from 'node:path';

import { detectEntries } from '@/targets/entries.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';

import { readRuntimeSetting } from './runtime-config.ts';

// Next.js resolves Edge code with `edge-light` and `browser`, then `import` and `default`
// (crates/next-core/src/next_edge/context.rs); `@vercel/node`'s dev server does the same with
// esbuild's `platform: 'browser'`. Neither adds `worker`.
export const vercelEdgeConditions = ['edge-light', 'module'];

const middlewareNames = ['middleware', 'src/middleware'].flatMap(base =>
  ['ts', 'js', 'mts', 'mjs'].map(extension => `${base}.${extension}`),
);

const middlewareLabel = 'middleware.{ts,js,mts,mjs}';

/** Routing Middleware runs on the edge runtime by default, so its file is the natural entry. */
function findMiddleware(root: string): string | undefined {
  return middlewareNames.find(name => existsSync(path.join(root, name)));
}

interface Entry {
  entries: string[];
  /** What was searched, with the reason when a file was found and skipped. */
  label: string;
  notes: string[];
}

/**
 * The middleware file, unless it picks the Node.js runtime for itself (`config.runtime`), which
 * Next.js 15.5 allows: the Edge runtime does not run it, so checking it would be all false errors.
 */
function findEntry(root: string): Entry {
  const middleware = findMiddleware(root);
  if (middleware === undefined) {
    return { entries: [], label: middlewareLabel, notes: [] };
  }
  if (readRuntimeSetting(path.join(root, middleware)) === 'nodejs') {
    return {
      entries: [],
      label: `${middleware} (sets runtime 'nodejs', so the Edge runtime does not run it)`,
      notes: [
        `${middleware} sets runtime 'nodejs', so it does not run on Vercel's Edge runtime. The vercel-edge target does not apply to it.`,
      ],
    };
  }
  return { entries: [middleware], label: middlewareLabel, notes: [] };
}

export function createVercelEdgeTarget(root: string): Target {
  const { index, matrixSource, description, globals } = loadTargetData('vercel-edge');
  const docsDate = matrixSource.versions['vercel-edge'] ?? 'unknown';
  const { entries, label, notes } = findEntry(root);

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
    entries: detectEntries([{ label, guessed: false, find: () => entries }], false),
    lazyNodeImports: true,
    globals,
    lookup: api => index.lookup(api),
    hasProblemsBelow: api => index.hasProblemsBelow(api),
  };
}
