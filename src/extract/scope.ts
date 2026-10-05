import type { Node } from 'oxc-parser';

import type { ApiRef } from '@/types.ts';

/**
 * What a name refers to: a runtime API, a `require` made by `module.createRequire`,
 * or `null` for any other declaration, which shadows globals and outer bindings.
 * A name that holds a whole file of the project has `members`: what each name the file exports
 * stands for, when that is a Node.js module. Its `ref` is not an API.
 */
export type Binding =
  | { ref: ApiRef; recorded: boolean; members?: ReadonlyMap<string, ApiRef> }
  | 'require'
  | null;

/** A name that stands for a check, so testing it is the same as testing what it holds. */
export interface Check {
  /** The expression the check evaluates: a `const`'s value, or what a helper returns. */
  test: Node;
  /** True for a helper called as `name()`, false for a `const` read as `name`. */
  call: boolean;
  /** Where `test` is read, since it may name things the caller cannot see. */
  scope: Scope;
  /** Set while the check is being read, so a helper that calls itself stops there. */
  busy: boolean;
  /** For a `let` or `var`: the block that declares it, where a write ends the check. */
  region: readonly Node[] | undefined;
}

export interface Scope {
  names: Map<string, Binding>;
  checks: Map<string, Check>;
  /** `const` names bound to a plain string, which can stand in for a literal specifier. */
  strings: Map<string, string>;
  /** `const` names bound to one of a known set of strings: a plain string, or a member of an object of strings. */
  keys: Map<string, readonly string[]>;
  /** `const` names bound to an object literal whose values are all plain strings. */
  stringObjects: Map<string, readonly string[]>;
  /** `const` names bound to a symbol, which can never name an API. */
  symbols: Set<string>;
  /** Names bound to a WebAssembly module by `import mod from './x.wasm'`. */
  wasmImports: Set<string>;
  /** The `module` parameter of a CommonJS factory, as in esbuild's `__commonJS` helper. */
  modules: Set<string>;
  parent: Scope | undefined;
}

export function createScope(parent?: Scope): Scope {
  return {
    names: new Map(),
    checks: new Map(),
    strings: new Map(),
    keys: new Map(),
    stringObjects: new Map(),
    symbols: new Set(),
    wasmImports: new Set(),
    modules: new Set(),
    parent,
  };
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

function lookupSet(
  scope: Scope | undefined,
  name: string,
  field: 'keys' | 'stringObjects',
): readonly string[] | undefined {
  if (scope === undefined) {
    return undefined;
  }
  return (
    scope[field].get(name) ??
    (scope.names.has(name) ? undefined : lookupSet(scope.parent, name, field))
  );
}

/** The strings a `const` may hold, unless a nearer declaration of the name shadows it. */
export function lookupKeys(scope: Scope | undefined, name: string): readonly string[] | undefined {
  return lookupSet(scope, name, 'keys');
}

/** The values of a `const` object literal of plain strings, unless a nearer declaration shadows it. */
export function lookupStringObject(
  scope: Scope | undefined,
  name: string,
): readonly string[] | undefined {
  return lookupSet(scope, name, 'stringObjects');
}

/** Whether the name is an imported WebAssembly module, unless a nearer declaration shadows it. */
export function isWasmImport(scope: Scope | undefined, name: string): boolean {
  if (scope === undefined) {
    return false;
  }
  return (
    scope.wasmImports.has(name) || (!scope.names.has(name) && isWasmImport(scope.parent, name))
  );
}

/** Whether the name is the `module` parameter of a CommonJS factory, unless a nearer declaration shadows it. */
export function isFactoryModule(scope: Scope | undefined, name: string): boolean {
  if (scope === undefined) {
    return false;
  }
  return scope.modules.has(name) || (!scope.names.has(name) && isFactoryModule(scope.parent, name));
}

/** True when the name is a `const` symbol, unless a nearer declaration of the name shadows it. */
export function lookupSymbol(scope: Scope | undefined, name: string): boolean {
  if (scope === undefined) {
    return false;
  }
  return scope.symbols.has(name) || (!scope.names.has(name) && lookupSymbol(scope.parent, name));
}

/** The check a name holds, unless a nearer declaration of the name shadows it. */
export function lookupCheck(scope: Scope | undefined, name: string): Check | undefined {
  if (scope === undefined) {
    return undefined;
  }
  const check = scope.checks.get(name);
  if (check !== undefined) {
    return check;
  }
  return scope.names.has(name) ? undefined : lookupCheck(scope.parent, name);
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
): binding is { ref: ApiRef; recorded: boolean; members?: ReadonlyMap<string, ApiRef> } {
  return typeof binding === 'object' && binding !== null;
}

export function isBound(binding: Binding | undefined): binding is Exclude<Binding, null> {
  return binding !== undefined && binding !== null;
}
