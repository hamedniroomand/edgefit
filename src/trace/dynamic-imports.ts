import type { Node } from 'oxc-parser';

import { childNodes, staticKey, staticString, strip, unwrap } from '@/extract/ast.ts';
import { isInteropHelper } from '@/extract/refs.ts';

/** The export names that a module asks of a file with `import()`, or `all` when it may use any. */
export type DynamicImports = Map<string, Set<string> | 'all'>;

/** The local names of `const { a, b: c = 1 } = …`, by the name they take, when every one is a plain name. */
export function destructuredImports(pattern: Node): Map<string, string> | undefined {
  if (pattern.type !== 'ObjectPattern') {
    return undefined;
  }
  const taken = new Map<string, string>();
  for (const property of pattern.properties) {
    if (property.type === 'RestElement') {
      return undefined;
    }
    const key = staticKey(property.key, property.computed);
    const value =
      property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
    if (key === undefined || value.type !== 'Identifier') {
      return undefined;
    }
    taken.set(value.name, key);
  }
  return taken;
}

export type LoadKind = 'import' | 'require';

/**
 * The `require('literal')` that a value stands for: the call itself, an interop helper around it
 * (`__importStar(require('x'))`), or `Promise.resolve().then(() => …)` around those, which `tsc`
 * writes for `import()` in CommonJS.
 */
function requireOf(node: Node): { specifier: string; node: Node } | undefined {
  const call = strip(node);
  if (call.type !== 'CallExpression') {
    return undefined;
  }
  const callee = strip(call.callee);
  if (callee.type === 'Identifier' && callee.name === 'require') {
    const specifier = staticString(call.arguments[0]);
    return specifier === undefined ? undefined : { specifier, node: call };
  }
  const [argument] = call.arguments;
  if (isInteropHelper(call.callee) && call.arguments.length === 1 && argument !== undefined) {
    return requireOf(argument);
  }
  const lazy =
    callee.type === 'MemberExpression' && staticKey(callee.property, callee.computed) === 'then';
  if (lazy && argument?.type === 'ArrowFunctionExpression' && argument.expression) {
    return requireOf(argument.body);
  }
  return undefined;
}

function loadOf(node: Node, kind: LoadKind): { specifier: string; node: Node } | undefined {
  if (kind === 'require') {
    return requireOf(node);
  }
  const call = strip(node);
  const specifier = call.type === 'ImportExpression' ? staticString(call.source) : undefined;
  return specifier === undefined ? undefined : { specifier, node: call };
}

/** The load that a declarator holds when it destructures plain names from it: `const { a } = await import('literal')` or `= require('literal')`. */
export function destructuredLoad(
  declarator: Node,
  kind: LoadKind,
): { specifier: string; node: Node; names: Map<string, string> } | undefined {
  if (declarator.type !== 'VariableDeclarator' || declarator.init === null) {
    return undefined;
  }
  // Parentheses and casts around the call change nothing; `await` itself ends the search.
  let init: Node = declarator.init;
  for (
    let inner = unwrap(init);
    inner !== undefined && init.type !== 'AwaitExpression';
    inner = unwrap(init)
  ) {
    init = inner;
  }
  const awaited = init.type === 'AwaitExpression';
  // `import()` gives a promise, so its result is read after `await`. A `require` result is read as it is.
  if (kind === 'import' && !awaited) {
    return undefined;
  }
  const load = loadOf(init.type === 'AwaitExpression' ? init.argument : init, kind);
  const names = destructuredImports(declarator.id);
  return load === undefined || names === undefined ? undefined : { ...load, names };
}

/**
 * What each file that a module loads with `import('literal')` or `require('literal')` is asked
 * for. A result that is destructured by name asks for those names. Any other use asks for all of
 * the file.
 */
export function loadsOf(body: readonly Node[], kind: LoadKind): DynamicImports {
  const asked: DynamicImports = new Map();
  const understood = new Set<Node>();
  const loads: { specifier: string; node: Node }[] = [];
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const found = destructuredLoad(node, kind);
    if (found !== undefined) {
      understood.add(found.node);
      const current = asked.get(found.specifier);
      if (current !== 'all') {
        asked.set(found.specifier, new Set([...(current ?? []), ...found.names.values()]));
      }
    }
    const load = loadOf(node, kind);
    if (load !== undefined) {
      loads.push(load);
    }
    pending.push(...childNodes(node));
  }
  for (const { specifier, node } of loads) {
    if (!understood.has(node)) {
      asked.set(specifier, 'all');
    }
  }
  return asked;
}
