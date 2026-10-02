import { builtinModules } from 'node:module';

/** Built-ins that can only be imported with the `node:` prefix. */
const prefixOnly = new Set(['sea', 'sqlite', 'test', 'test/reporters']);

const unprefixed = new Set(builtinModules.filter(name => !name.startsWith('node:')));

/**
 * Returns the built-in module name without the `node:` prefix, or `undefined`
 * when the specifier is not a Node built-in.
 */
export function builtinName(specifier: string): string | undefined {
  if (specifier.startsWith('node:')) {
    const name = specifier.slice('node:'.length);
    return unprefixed.has(name) || prefixOnly.has(name) ? name : undefined;
  }
  return unprefixed.has(specifier) ? specifier : undefined;
}

/** A leaf such as `(string)` or `(dynamic)`: it names a way of calling the API, not a member. */
export function isSyntheticLeaf(path: readonly string[]): boolean {
  return path.at(-1)?.startsWith('(') === true;
}

export function displayApi(module: string, path: readonly string[]): string {
  if (module === '*globals*') {
    // A call shown as `Function(string)`, not `Function.(string)`.
    return isSyntheticLeaf(path) ? `${path.slice(0, -1).join('.')}${path.at(-1)}` : path.join('.');
  }
  const members = path[0] === 'default' ? path.slice(1) : path;
  return [`node:${module}`, ...members].join('.');
}
