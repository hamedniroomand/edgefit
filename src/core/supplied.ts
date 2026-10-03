import path from 'node:path';

import type { ModuleUsages } from './findings.ts';

/** A load of a module that the user of the code names, and where it is. */
export type SuppliedLoad = {
  /** The package that holds the load, or `undefined` for the code of the project. */
  package: string | undefined;
  /** `file:line`. */
  place: string;
};

/**
 * Takes the loads of a module that the user of a package names out of the usages, and lists where
 * they are. The code does not choose that module, so its support is not a finding.
 */
export function leaveOutSupplied(modules: ModuleUsages[]): {
  modules: ModuleUsages[];
  supplied: SuppliedLoad[];
} {
  const supplied = new Map<string, SuppliedLoad>();
  const kept = modules.map(module => ({
    ...module,
    usages: module.usages.filter(usage => {
      if (usage.supplied !== true) {
        return true;
      }
      const place = `${path.posix.basename(usage.location.file)}:${usage.location.line}`;
      supplied.set(`${module.package?.name ?? ''} ${place}`, {
        package: module.package?.name,
        place,
      });
      return false;
    }),
  }));
  return { modules: kept, supplied: [...supplied.values()] };
}

/** The note for a load, as the output of a check prints it. */
export function suppliedNote({ package: name, place }: SuppliedLoad): string {
  return `${name === undefined ? '' : `${name} `}loads a module the user names (${place})`;
}
