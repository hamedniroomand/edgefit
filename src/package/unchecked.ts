import { builtinModules } from 'node:module';
import path from 'node:path';

import type { Message } from 'esbuild';

import { ResolveError } from '@/resolve/errors.ts';
import { manifestOf, moduleName } from '@/resolve/optional-peers.ts';

const couldNotResolve = /^Could not resolve "([^"]+)"/u;

/** The module that a failed import needs, when the package that imports it does not declare it. */
function undeclaredName(message: Message, root: string): string | undefined {
  const specifier = couldNotResolve.exec(message.text)?.[1];
  const importer =
    message.location === null ? undefined : path.resolve(root, message.location.file);
  if (
    specifier === undefined ||
    /^[./]|^node:/u.test(specifier) ||
    importer?.split(path.sep).includes('node_modules') !== true
  ) {
    return undefined;
  }
  const manifest = manifestOf(importer);
  const name = moduleName(specifier);
  const declared = [
    manifest?.name,
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.peerDependencies ?? {}),
    ...Object.keys(manifest?.optionalDependencies ?? {}),
  ];
  return manifest === undefined || declared.includes(name) || builtinModules.includes(name)
    ? undefined
    : name;
}

/**
 * The modules that an entry needs and the package does not declare, when that is the only reason
 * the entry failed. The package manager did not install them, so the project that uses the entry
 * has to bring them. Any other failure gives no names.
 */
export function undeclaredModules(error: unknown, root: string): string[] {
  if (!(error instanceof ResolveError) || error.messages.length === 0) {
    return [];
  }
  const names = error.messages.map(message => undeclaredName(message, root));
  return names.includes(undefined) ? [] : [...new Set(names as string[])];
}

export function neededMessage(modules: readonly string[]): string {
  const names = modules.map(name => `"${name}"`).join(', ');
  return `needs ${names}, which the package does not declare`;
}
