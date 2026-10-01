import { CompatIndex } from '@/data/compat-index.ts';
import { findDataDirectory } from '@/data/data-directory.ts';
import { describeSource, findSource } from '@/data/manifest.ts';
import type { DataSource } from '@/data/manifest.ts';
import { allowlistProvider } from '@/data/providers/allowlist.ts';
import { matrixProvider } from '@/data/providers/matrix.ts';
import type { MatrixRuntime } from '@/data/providers/matrix.ts';
import { overridesProvider } from '@/data/providers/overrides.ts';
import type { CompatProvider, CompatTree } from '@/data/providers/provider.ts';
import { runtimeCompatDataProvider } from '@/data/providers/runtime-compat-data.ts';
import type { WebKey } from '@/data/providers/runtime-compat-data.ts';
import type { TargetKey } from '@/types.ts';

export interface TargetData {
  index: CompatIndex;
  /** The matrix source, whose settings and versions describe what the data was generated with. */
  matrixSource: DataSource;
  /** One source per override layer, in the order they apply. */
  overrideSources: DataSource[];
  /** Where the data comes from and which version it describes, for `TargetInfo.data`. */
  description: string;
  /** Global names worth tracking because something at or below them is not fully supported. */
  globals: Set<string>;
}

// Roots that must stay tracked so chains like `globalThis.process.env` can be followed.
const alwaysTrackedGlobals = ['process', 'Buffer', 'global', 'globalThis', 'self'];

/**
 * The compatibility matrix for a runtime, with its curated overrides applied. Extra layers,
 * such as a platform's restrictions, apply on top and win over the runtime's own overrides.
 * Web API data fills in the globals the matrix does not describe; `webKey` picks its column
 * when a platform has one of its own.
 */
export function loadTargetData(
  runtime: MatrixRuntime | 'vercel-edge',
  extraLayers: readonly TargetKey[] = [],
  dataDirectory = findDataDirectory(),
  webKey?: WebKey,
): TargetData {
  const matrix: CompatProvider<CompatTree> =
    runtime === 'vercel-edge' ? allowlistProvider(runtime) : matrixProvider(runtime);
  const overrides = [runtime, ...extraLayers].map(layer => overridesProvider(layer));
  const web = runtimeCompatDataProvider(runtime, webKey);
  const matrixSource = findSource(dataDirectory, matrix.name);
  const webSource = findSource(dataDirectory, web.name);
  const index = new CompatIndex(
    matrix.load(dataDirectory),
    overrides.flatMap(layer => layer.load(dataDirectory)),
    web.load(dataDirectory),
  );
  const globals = new Set([
    ...alwaysTrackedGlobals,
    ...index
      .globalNames()
      .filter(name => index.hasProblemsBelow({ module: '*globals*', path: [name] })),
  ]);
  const overrideSources = overrides.map(layer => findSource(dataDirectory, layer.name));
  return {
    index,
    matrixSource,
    overrideSources,
    description:
      `${describeSource(matrixSource, [runtime])}, ` +
      `curated overrides from ${overrideSources.map(source => source.url).join(' and ')}, ` +
      `Web APIs from ${describeSource(webSource)}`,
    globals,
  };
}
