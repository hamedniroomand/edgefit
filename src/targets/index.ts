import type { EdgefitConfig, TargetKey } from '@/types.ts';

import { createBunTarget } from './bun/index.ts';
import { createDenoTarget } from './deno/index.ts';
import type { Target } from './target.ts';
import { createWorkerdTarget } from './workerd/index.ts';

type TargetFactory = (root: string, config: EdgefitConfig) => Target;

const factories: Record<TargetKey, TargetFactory> = {
  workerd: (root, config) => createWorkerdTarget(root, config.workerd),
  bun: (root, config) => createBunTarget(root, config.bun),
  deno: (root, config) => createDenoTarget(root, config.deno),
  'deno-deploy': (root, config) => createDenoTarget(root, { ...config.deno, deploy: true }),
};

export const targetKeys = Object.keys(factories) as TargetKey[];

// deno-deploy is left out while its override layer is empty: its column would repeat deno's.
export const compareTargetKeys = targetKeys.filter(key => key !== 'deno-deploy');

export function isTargetKey(value: string): value is TargetKey {
  return Object.hasOwn(factories, value);
}

export function createTarget(key: TargetKey, root: string, config: EdgefitConfig): Target {
  return factories[key](root, config);
}

export type { Target, TargetInfo } from './target.ts';
