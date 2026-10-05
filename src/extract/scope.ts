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

/** A value that is known when it is read: a string, or an object or array of such values. */
export type KnownValue = string | KnownObject;

export type KnownObject = {
  /** The value of each key that is known. */
  entries: ReadonlyMap<string, KnownValue>;
  /** Every value, when each one is known, so a read with any key gives one of them. */
  values: readonly KnownValue[] | undefined;
};

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

/** The object of an `in` test, and the scope that declares its name. */
export type Present = { object: string; scope: Scope };
export type Filtered = Present & { index: number };

export interface Scope {
  names: Map<string, Binding>;
  checks: Map<string, Check>;
  /** `const` names bound to a plain string, which can stand in for a literal specifier. */
  strings: Map<string, string>;
  /** Names that can only hold one of a known set of strings. */
  keys: Map<string, readonly string[]>;
  /** Parameters of the function that the scope belongs to, by name. */
  parameters: Set<string>;
  /** `const` lists made by `.filter(name => name in obj)`, see `bindFilteredList`. */
  filtered: Map<string, Filtered>;
  /** Names that hold a key which an `in` test proved `obj` has, see `bindPresentLoop`. */
  present: Map<string, Present>;
  /** Names that can only hold a known object or array. */
  objects: Map<string, KnownObject>;
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
    parameters: new Set(),
    filtered: new Map(),
    present: new Map(),
    objects: new Map(),
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

/** Whether the nearest declaration of `name` is a plain parameter of a function. */
export function isParameter(scope: Scope | undefined, name: string): boolean {
  if (scope === undefined) {
    return false;
  }
  if (scope.parameters.has(name)) {
    return true;
  }
  return scope.names.has(name) ? false : isParameter(scope.parent, name);
}

/** The list a `const` holds that was filtered by an `in` test, unless a nearer declaration of the name shadows it. */
export function lookupFiltered(scope: Scope | undefined, name: string): Filtered | undefined {
  if (scope === undefined) {
    return undefined;
  }
  return (
    scope.filtered.get(name) ??
    (scope.names.has(name) ? undefined : lookupFiltered(scope.parent, name))
  );
}

/** The `in` test that proved a name is a key of an object, unless a nearer declaration shadows the name. */
export function lookupPresent(scope: Scope | undefined, name: string): Present | undefined {
  if (scope === undefined) {
    return undefined;
  }
  return (
    scope.present.get(name) ??
    (scope.names.has(name) ? undefined : lookupPresent(scope.parent, name))
  );
}

/** The strings a name may hold, unless a nearer declaration of the name shadows it. */
export function lookupKeys(scope: Scope | undefined, name: string): readonly string[] | undefined {
  if (scope === undefined) {
    return undefined;
  }
  return (
    scope.keys.get(name) ?? (scope.names.has(name) ? undefined : lookupKeys(scope.parent, name))
  );
}

/** The scope that declares `name`, so a nearer declaration of the same word is another name. */
export function declaringScope(scope: Scope, name: string): Scope {
  return scope.parent === undefined || scope.names.has(name)
    ? scope
    : declaringScope(scope.parent, name);
}

/** The known object a name holds, unless a nearer declaration of the name shadows it. */
export function lookupObject(scope: Scope | undefined, name: string): KnownObject | undefined {
  if (scope === undefined) {
    return undefined;
  }
  return (
    scope.objects.get(name) ??
    (scope.names.has(name) ? undefined : lookupObject(scope.parent, name))
  );
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
