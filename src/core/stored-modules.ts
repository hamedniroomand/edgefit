import { findStoredModule, loadStoredModules } from '@/data/stored-modules.ts';
import type { StoredModuleEntry } from '@/data/stored-modules.ts';
import type { ApiRef, PackageInfo, Usage } from '@/types.ts';

type OwnedUsages = { package: PackageInfo | undefined; usages: Usage[] };

function memberUsage(stored: Omit<Usage, 'kind'> & { api: ApiRef }, member: string): Usage {
  return {
    ...stored,
    kind: 'api',
    api: { ...stored.api, path: [...stored.api.path, member] },
    display: `${stored.display}.${member}`,
  };
}

/** The usage of each member that a listed file reads of the module that it stored. */
function membersOf(
  module: OwnedUsages,
  usage: Usage,
  entries: readonly StoredModuleEntry[],
): Usage[] {
  const version = module.package?.version;
  const { api, reason: _reason, exported: _exported, ...rest } = usage;
  const entry =
    usage.kind === 'dynamic' &&
    api !== undefined &&
    module.package !== undefined &&
    version !== undefined
      ? findStoredModule(entries, {
          package: module.package.name,
          version,
          file: usage.location.file,
          module: usage.display,
        })
      : undefined;
  if (entry === undefined || api === undefined) {
    return [usage];
  }
  return entry.members.map(member => memberUsage({ ...rest, api }, member));
}

/**
 * Replaces the usage of a module that a package file stores and passes on with the usage of the
 * members that the file reads of it, for the files that `data/stored-modules.json` lists.
 */
export function readStoredModules<TModule extends OwnedUsages>(
  modules: readonly TModule[],
  entries: readonly StoredModuleEntry[] = loadStoredModules(),
): TModule[] {
  return modules.map(module => ({
    ...module,
    usages: module.usages.flatMap(usage => membersOf(module, usage, entries)),
  }));
}
