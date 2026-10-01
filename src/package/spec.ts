import { EdgefitError } from '@/errors.ts';

export interface RegistrySpec {
  kind: 'registry';
  name: string;
  /** The version, range or tag after the name's `@`. `undefined` means the latest release. */
  selector: string | undefined;
}

/** A package directory or a tarball on disk, checked as it would be published. */
export interface LocalSpec {
  kind: 'local';
  path: string;
}

export type PackageSpec = RegistrySpec | LocalSpec;

// npm's own naming rules, without the legacy uppercase and length exceptions.
const namePattern = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/u;

function isLocal(spec: string): boolean {
  return (
    spec === '.' ||
    spec === '..' ||
    spec.startsWith('./') ||
    spec.startsWith('../') ||
    spec.startsWith('/') ||
    spec.endsWith('.tgz') ||
    spec.endsWith('.tar.gz')
  );
}

/**
 * Splits `name`, `name@1.2.3`, `name@^1`, `@scope/name` and `@scope/name@tag`. The `@` that opens
 * a scope is part of the name, so the version separator is the first `@` after position 0.
 */
export function parsePackageSpec(spec: string): PackageSpec {
  const trimmed = spec.trim();
  if (isLocal(trimmed)) {
    return { kind: 'local', path: trimmed };
  }
  const at = trimmed.indexOf('@', 1);
  const name = at === -1 ? trimmed : trimmed.slice(0, at);
  const selector = at === -1 ? undefined : trimmed.slice(at + 1);
  if (!namePattern.test(name)) {
    throw new EdgefitError(
      `Not a package name: ${spec}`,
      'Use name, name@version, @scope/name, @scope/name@tag, a directory (.) or a .tgz file.',
    );
  }
  if (selector === '') {
    throw new EdgefitError(`Missing version after "@" in ${spec}`);
  }
  return { kind: 'registry', name, selector };
}

/** The spec npm installs: `name@selector`, or the path as is. */
export function installSpec(spec: PackageSpec): string {
  if (spec.kind === 'local') {
    return spec.path;
  }
  return spec.selector === undefined ? spec.name : `${spec.name}@${spec.selector}`;
}
