import { detectEntries } from '@/targets/entries.ts';
import { versionNotes } from '@/targets/runtime-version.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';
import type { BunOptions } from '@/types.ts';

import { bunEntrySources } from './entries.ts';
import { resolveBunVersion } from './version.ts';

// Bun's resolver takes whichever of these a package lists first, then `import`/`require` and `default`.
export const bunConditions = ['bun', 'node'];

export function createBunTarget(root: string, options: BunOptions = {}): Target {
  const { index, matrixSource, description, globals } = loadTargetData('bun');
  const dataVersion = matrixSource.versions.bun ?? 'unknown';
  const { version, origin } = resolveBunVersion(root, options, dataVersion);

  return {
    info: {
      key: 'bun',
      platform: 'Bun',
      conditions: bunConditions,
      data: description,
      settings: `Bun ${version} (from ${origin})`,
      notes: versionNotes('Bun', version, dataVersion),
    },
    runtimes: ['bun'],
    resolvePlatform: 'node',
    nodeEnv: undefined,
    entries: detectEntries(bunEntrySources(root), true),
    globals,
    hasGlobal: name => index.globalNames().includes(name),
    lookup: api => index.lookup(api),
    hasProblemsBelow: api => index.hasProblemsBelow(api),
  };
}
