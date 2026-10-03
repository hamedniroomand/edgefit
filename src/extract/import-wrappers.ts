import type { Node } from 'oxc-parser';

import { childNodes, staticString, strip } from './ast.ts';
import { findLoaderObjects } from './loader-objects.ts';
import type { Loader } from './loader-objects.ts';

export type ImportWrappers = {
  /** The literal specifier of each call of a followed wrapper, by call. */
  calls: ReadonlyMap<Node, string>;
  /** The `import(param)` inside each followed wrapper. The calls stand for it. */
  imports: ReadonlySet<Node>;
  /** The module that each call of a function that only returns a `require()` loads. */
  requireCalls: ReadonlyMap<Node, { specifier: string; caught: boolean }>;
  /** The `require('literal')` inside each such function. The calls stand for it. */
  requires: ReadonlySet<Node>;
  /** The modules that a call of a function in an object of such functions may load, see `findLoaderObjects`. */
  loaderCalls: ReadonlyMap<Node, readonly Loader[]>;
};

type Candidate = {
  name: string;
  declaration: Node;
  importNode: Node;
  /** Set for a function with no parameter that only returns a `require()`, and says whether a `try` wraps it. */
  required?: { specifier: string; caught: boolean };
};

function isFunctionNode(
  fn: Node,
): fn is Extract<
  Node,
  { type: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression' }
> {
  return (
    fn.type === 'FunctionDeclaration' ||
    fn.type === 'FunctionExpression' ||
    fn.type === 'ArrowFunctionExpression'
  );
}

function requireLiteral(
  node: Node | null | undefined,
): { call: Node; specifier: string } | undefined {
  const call = node === null || node === undefined ? undefined : strip(node);
  const callee = call?.type === 'CallExpression' ? strip(call.callee) : undefined;
  const specifier =
    call?.type === 'CallExpression' && callee?.type === 'Identifier' && callee.name === 'require'
      ? staticString(call.arguments[0])
      : undefined;
  return call === undefined || specifier === undefined ? undefined : { call, specifier };
}

/** Whether a `catch` gives a value that holds nothing: `{}`, `undefined`, `null` or a literal. */
function givesNothing(statement: Node | undefined): boolean {
  const value = statement?.type === 'ReturnStatement' ? statement.argument : null;
  const inner = value === null ? undefined : strip(value);
  return (
    value === null ||
    inner?.type === 'Literal' ||
    (inner?.type === 'Identifier' && inner.name === 'undefined') ||
    (inner?.type === 'ObjectExpression' && inner.properties.length === 0)
  );
}

/** A function with no parameter that only returns `require('literal')`, with or without a `try` that returns nothing. */
export function requireWrapperOf(
  fn: Node,
): { call: Node; specifier: string; caught: boolean } | undefined {
  if (!isFunctionNode(fn) || fn.params.length > 0) {
    return undefined;
  }
  if (fn.body.type !== 'BlockStatement') {
    const found = requireLiteral(fn.body);
    return found === undefined ? undefined : { ...found, caught: false };
  }
  const [only, ...rest] = fn.body.body;
  if (rest.length > 0 || only === undefined) {
    return undefined;
  }
  if (only.type === 'ReturnStatement') {
    const found = requireLiteral(only.argument);
    return found === undefined ? undefined : { ...found, caught: false };
  }
  if (only.type !== 'TryStatement' || only.handler === null || only.finalizer !== null) {
    return undefined;
  }
  const [inTry, ...moreInTry] = only.block.body;
  const found = inTry?.type === 'ReturnStatement' ? requireLiteral(inTry.argument) : undefined;
  const handled = only.handler.body.body;
  return found === undefined ||
    moreInTry.length > 0 ||
    handled.length > 1 ||
    !givesNothing(handled[0])
    ? undefined
    : { ...found, caught: true };
}

function importOf(fn: Node): Node | undefined {
  if (
    fn.type !== 'FunctionDeclaration' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'ArrowFunctionExpression'
  ) {
    return undefined;
  }
  const [param] = fn.params;
  if (fn.params.length !== 1 || param?.type !== 'Identifier' || fn.body === null) {
    return undefined;
  }
  let value: Node | null | undefined = fn.body;
  if (fn.body.type === 'BlockStatement') {
    const [only] = fn.body.body;
    value =
      fn.body.body.length === 1 && only?.type === 'ReturnStatement' ? only.argument : undefined;
  }
  const inner = value === null || value === undefined ? undefined : strip(value);
  const source = inner?.type === 'ImportExpression' ? strip(inner.source) : undefined;
  return source?.type === 'Identifier' && source.name === param.name ? inner : undefined;
}

function candidateOf(node: Node): Candidate | undefined {
  const named =
    node.type === 'FunctionDeclaration' && node.id !== null
      ? { name: node.id.name, fn: node, declaration: node.id }
      : undefined;
  const declared =
    node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init !== null
      ? { name: node.id.name, fn: strip(node.init), declaration: node.id }
      : undefined;
  const found = named ?? declared;
  if (found === undefined) {
    return undefined;
  }
  const required = requireWrapperOf(found.fn);
  const importNode = importOf(found.fn) ?? required?.call;
  return importNode === undefined
    ? undefined
    : {
        name: found.name,
        declaration: found.declaration,
        importNode,
        ...(required === undefined
          ? {}
          : { required: { specifier: required.specifier, caught: required.caught } }),
      };
}

function exportedNames(node: Node): string[] {
  const declaration =
    node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
      ? node.declaration
      : undefined;
  if (declaration?.type === 'FunctionDeclaration') {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  return declaration?.type === 'VariableDeclaration'
    ? declaration.declarations.flatMap(item =>
        item.id.type === 'Identifier' ? [item.id.name] : [],
      )
    : [];
}

type Call = {
  name: string;
  callee: Node;
  call: Node;
  specifier: string | undefined;
  empty: boolean;
};

type Found = {
  candidates: Candidate[];
  exported: Set<string>;
  references: Map<string, Node[]>;
  calls: Call[];
};

/** The candidates of a file, the names it exports, every mention of a name, and every call of a plain name. */
function collect(body: readonly Node[]): Found {
  const found: Found = { candidates: [], exported: new Set(), references: new Map(), calls: [] };
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const candidate = candidateOf(node);
    if (candidate !== undefined) {
      found.candidates.push(candidate);
    }
    for (const name of exportedNames(node)) {
      found.exported.add(name);
    }
    if (node.type === 'Identifier') {
      found.references.set(node.name, [...(found.references.get(node.name) ?? []), node]);
    }
    const callee = node.type === 'CallExpression' ? strip(node.callee) : undefined;
    if (node.type === 'CallExpression' && callee?.type === 'Identifier') {
      const [argument] = node.arguments;
      const specifier = node.arguments.length === 1 ? staticString(argument) : undefined;
      found.calls.push({
        name: callee.name,
        callee,
        call: node,
        specifier,
        empty: node.arguments.length === 0,
      });
    }
    pending.push(...childNodes(node));
  }
  return found;
}

/**
 * The functions of a file that only run `import(specifier)` for their one parameter, such as
 * `const load = specifier => import(specifier)`, when every use of the function is a call with a
 * literal. Each such call stands for an `import()` of the literal. The same goes for a function
 * with no parameter that only returns `require('literal')`, called with nothing. A function that
 * is exported, passed on, called with anything else, or whose name is used for another thing is
 * left out.
 */
export function findImportWrappers(body: readonly Node[]): ImportWrappers {
  const { candidates, exported, references, calls } = collect(body);
  const result = {
    calls: new Map<Node, string>(),
    imports: new Set<Node>(),
    requireCalls: new Map<Node, { specifier: string; caught: boolean }>(),
    requires: new Set<Node>(),
  };
  for (const { name, declaration, importNode, required } of candidates) {
    const mine = calls.filter(call => call.name === name);
    const accounted = new Set<Node>([declaration, ...mine.map(call => call.callee)]);
    const unique = candidates.filter(other => other.name === name).length === 1;
    // A function that gives a module is called with nothing; an import wrapper is called with a literal.
    const used =
      mine.length > 0 &&
      mine.every(call => (required === undefined ? call.specifier !== undefined : call.empty));
    const loose = (references.get(name) ?? []).some(reference => !accounted.has(reference));
    if (!unique || exported.has(name) || loose || !used) {
      continue;
    }
    if (required === undefined) {
      result.imports.add(importNode);
      for (const { call, specifier } of mine) {
        result.calls.set(call, specifier ?? '');
      }
    } else {
      result.requires.add(importNode);
      for (const { call } of mine) {
        result.requireCalls.set(call, required);
      }
    }
  }
  const loaders = findLoaderObjects(body, requireWrapperOf);
  return {
    ...result,
    requires: new Set([...result.requires, ...loaders.requires]),
    loaderCalls: loaders.calls,
  };
}
