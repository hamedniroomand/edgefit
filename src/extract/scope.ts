import type { ApiRef } from '@/types.ts';

/**
 * What a name refers to: a runtime API, a `require` made by `module.createRequire`,
 * or `null` for any other declaration, which shadows globals and outer bindings.
 */
export type Binding = { ref: ApiRef; recorded: boolean } | 'require' | null;

export interface Scope {
  names: Map<string, Binding>;
  /** `const` names bound to a plain string, which can stand in for a literal specifier. */
  strings: Map<string, string>;
  parent: Scope | undefined;
}

export function createScope(parent?: Scope): Scope {
  return { names: new Map(), strings: new Map(), parent };
}

/** The string a `const` holds, unless a nearer declaration of the name shadows it. */
export function lookupString(scope: Scope | undefined, name: string): string | undefined {
  if (scope === undefined) {
    return undefined;
  }
  const value = scope.strings.get(name);
  if (value !== undefined) {
    return value;
  }
  return scope.names.has(name) ? undefined : lookupString(scope.parent, name);
}

/** Returns `undefined` when no enclosing scope declares the name. */
export function lookup(scope: Scope | undefined, name: string): Binding | undefined {
  if (scope === undefined) {
    return undefined;
  }
  if (scope.names.has(name)) {
    return scope.names.get(name) ?? null;
  }
  return lookup(scope.parent, name);
}

/** Rebinds the name where it is declared, so hoisted `var`s land in their function scope. */
export function assign(scope: Scope, name: string, binding: Binding): void {
  for (let current: Scope | undefined = scope; current !== undefined; current = current.parent) {
    if (current.names.has(name)) {
      current.names.set(name, binding);
      return;
    }
  }
  scope.names.set(name, binding);
}

export function declare(scope: Scope, names: readonly string[]): void {
  for (const name of names) {
    if (!scope.names.has(name)) {
      scope.names.set(name, null);
    }
  }
}

export function isTracked(
  binding: Binding | undefined,
): binding is { ref: ApiRef; recorded: boolean } {
  return typeof binding === 'object' && binding !== null;
}
