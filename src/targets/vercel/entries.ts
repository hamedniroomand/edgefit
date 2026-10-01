import { existsSync } from 'node:fs';
import path from 'node:path';

import { globFiles } from '@/targets/glob-files.ts';

import { readRuntimeSetting } from './runtime-config.ts';

const middlewareNames = ['middleware', 'src/middleware'].flatMap(base =>
  ['ts', 'js', 'mts', 'mjs'].map(extension => `${base}.${extension}`),
);

const middlewareLabel = 'middleware.{ts,js,mts,mjs}';

/** Routing Middleware runs on the edge runtime by default, so its file is the natural entry. */
function findMiddleware(root: string): string | undefined {
  return middlewareNames.find(name => existsSync(path.join(root, name)));
}

const routeFiles = '*.{ts,tsx,js,jsx,mts,mjs}';
const routePatterns = ['', 'src/'].flatMap(base => [
  `${base}api/**/${routeFiles}`,
  `${base}pages/api/**/${routeFiles}`,
  `${base}app/**/route.{ts,tsx,js,jsx,mts,mjs}`,
]);
const routesLabel =
  "api/**, pages/api/** and app/**/route.* (also under src/) that set runtime 'edge'";
const edgeRuntimes = new Set(['edge', 'experimental-edge']);

/** Route files run on Node.js unless they pick the Edge runtime, so only those that do are entries. */
function findEdgeRoutes(root: string): string[] {
  const files = new Set(routePatterns.flatMap(pattern => globFiles(root, pattern)));
  return [...files]
    .filter(file => edgeRuntimes.has(readRuntimeSetting(path.join(root, file)) ?? ''))
    .sort();
}

export interface Entry {
  entries: string[];
  /** What was searched, with the reason when a file was found and skipped. */
  label: string;
  notes: string[];
}

/**
 * The middleware file, unless it picks the Node.js runtime for itself (`config.runtime`), which
 * Next.js 15.5 allows: the Edge runtime does not run it, so checking it would be all false errors.
 * Edge routes come with it, since Vercel deploys each one as its own function.
 */
export function findVercelSources(root: string): Entry {
  const middleware = findMiddleware(root);
  const routes = findEdgeRoutes(root);
  if (middleware !== undefined && readRuntimeSetting(path.join(root, middleware)) === 'nodejs') {
    return {
      entries: routes,
      label: `${middlewareLabel} (skipped: ${middleware} sets runtime 'nodejs', so the Edge runtime does not run it), ${routesLabel}`,
      notes: [
        `${middleware} sets runtime 'nodejs', so it does not run on Vercel's Edge runtime. The vercel-edge target does not apply to it.`,
      ],
    };
  }
  return {
    entries: [...(middleware === undefined ? [] : [middleware]), ...routes],
    label: `${middlewareLabel}, ${routesLabel}`,
    notes: [],
  };
}
