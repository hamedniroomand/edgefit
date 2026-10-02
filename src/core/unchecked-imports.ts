import { UsageCollector } from '@/extract/usage-collector.ts';
import { moduleName } from '@/resolve/optional-peers.ts';
import type { Usage } from '@/types.ts';

/** `jsr:@std/path@^1/join` as `@std/path`. JSR packages are always scoped. */
function jsrPackageName(specifier: string): string | undefined {
  return /^jsr:\/?(@[^/]+\/[^/@]+)/u.exec(specifier)?.[1];
}

/**
 * Where the file imports a package. The metafile has no import locations, and the specifier
 * may be written directly or as an import map key, which usually is the package name.
 */
function importOffset(source: string, specifier: string, name: string): number {
  return [specifier, name].map(text => source.indexOf(text)).find(offset => offset >= 0) ?? 0;
}

/** `jsr:` packages, which the Deno target keeps out of the graph, as unknown usages. */
export function uncheckedImports(
  file: string,
  source: string,
  externals: readonly string[],
  missingPeers: readonly string[] = [],
): Usage[] {
  const collector = new UsageCollector(file, source);
  for (const specifier of externals) {
    const name = jsrPackageName(specifier);
    if (name !== undefined) {
      const offset = importOffset(source, specifier, name);
      collector.dynamic(undefined, specifier, 'jsr: packages are not scanned yet', offset);
    }
  }
  for (const specifier of missingPeers) {
    const reason = `optional peer dependency ${moduleName(specifier)} is not installed, so what it provides is not checked`;
    collector.dynamic(undefined, specifier, reason, importOffset(source, specifier, specifier));
  }
  return collector.usages;
}
