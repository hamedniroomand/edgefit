import type { EdgefitConfig } from '@/types.ts';

/** Identity helper that gives `edgefit.config.ts` type checking and editor completion. */
export function defineConfig(config: EdgefitConfig): EdgefitConfig {
  return config;
}
