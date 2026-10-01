import type { EdgefitConfig, TargetKey } from '@/types.ts';

import { createBunTarget } from './bun/index.ts';
import { createDenoTarget } from './deno/index.ts';
import { createNetlifyEdgeTarget } from './netlify/index.ts';
import type { Target } from './target.ts';
import { createVercelEdgeTarget } from './vercel/index.ts';
import { createWorkerdTarget } from './workerd/index.ts';

type TargetFactory = (root: string, config: EdgefitConfig) => Target;

const factories: Record<TargetKey, TargetFactory> = {
  workerd: (root, config) => createWorkerdTarget(root, config.workerd),
  bun: (root, config) => createBunTarget(root, config.bun),
  deno: (root, config) => createDenoTarget(root, config.deno),
  'deno-deploy': (root, config) => createDenoTarget(root, { ...config.deno, deploy: true }),
  'netlify-edge': (root, config) => createNetlifyEdgeTarget(root, config.netlify),
  'vercel-edge': root => createVercelEdgeTarget(root),
};

export const targetKeys = Object.keys(factories) as TargetKey[];

// deno-deploy and netlify-edge are left out while their override layers are empty: their columns
// would repeat deno's. vercel-edge is experimental: its data is Vercel's documentation, not a dump.
export const compareTargetKeys = targetKeys.filter(
  key => key !== 'deno-deploy' && key !== 'netlify-edge' && key !== 'vercel-edge',
);

export function isTargetKey(value: string): value is TargetKey {
  return Object.hasOwn(factories, value);
}

export function createTarget(key: TargetKey, root: string, config: EdgefitConfig): Target {
  return factories[key](root, config);
}

export type { Target, TargetInfo } from './target.ts';
