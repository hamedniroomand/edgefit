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
export function requireOf(node: Node): { specifier: string; node: Node } | undefined {
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

/** The load that a declarator holds: `const x = await import('literal')` or `= require('literal')`. */
function loadOfDeclarator(
  declarator: Node,
  kind: LoadKind,
): { specifier: string; node: Node } | undefined {
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
  return loadOf(init.type === 'AwaitExpression' ? init.argument : init, kind);
}

/** The load that a declarator holds when it destructures plain names from it: `const { a } = await import('literal')` or `= require('literal')`. */
export function destructuredLoad(
  declarator: Node,
  kind: LoadKind,
): { specifier: string; node: Node; names: Map<string, string> } | undefined {
  const load = loadOfDeclarator(declarator, kind);
  const names =
    declarator.type === 'VariableDeclarator' ? destructuredImports(declarator.id) : undefined;
  return load === undefined || names === undefined ? undefined : { ...load, names };
}

/** Whether `node` is a name of a member or of a property, which no variable holds. */
function isPropertyName(node: Node, parent: Node | undefined): boolean {
  return (
    (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
    (parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand)
  );
}

/**
 * The members that a file reads from a name by `name.member`, when that is every use of the name:
 * no other use, no write to a member, and no key that is not a plain string. The name is
 * matched in the whole file, so another name that is spelled the same only adds members.
 */
function memberReads(body: readonly Node[], declaration: Node): Set<string> | undefined {
  const name = declaration.type === 'Identifier' ? declaration.name : undefined;
  const reads = new Set<string>();
  const visit = (node: Node, ancestors: readonly Node[]): boolean => {
    const parent = ancestors.at(-1);
    if (node.type === 'Identifier' && node.name === name) {
      if (node === declaration || isPropertyName(node, parent)) {
        return true;
      }
      const key =
        parent?.type === 'MemberExpression' && parent.object === node
          ? staticKey(parent.property, parent.computed)
          : undefined;
      const written = ancestors.at(-2);
      const isWrite =
        (written?.type === 'AssignmentExpression' && written.left === parent) ||
        (written?.type === 'UpdateExpression' && written.argument === parent) ||
        (written?.type === 'UnaryExpression' && written.operator === 'delete');
      if (key === undefined || isWrite) {
        return false;
      }
      reads.add(key);
      return true;
    }
    return childNodes(node).every(child => visit(child, [...ancestors, node]));
  };
  return name !== undefined && body.every(node => visit(node, [])) ? reads : undefined;
}

/**
 * The load that a declarator holds when the name it gives is only read by member: `const x =
 * require('literal')`, with `x.a` and `x.b` as every use of `x`.
 */
function namespaceLoad(
  declarator: Node,
  kind: LoadKind,
  body: readonly Node[],
): { specifier: string; node: Node; names: Set<string> } | undefined {
  const load = loadOfDeclarator(declarator, kind);
  const id = declarator.type === 'VariableDeclarator' ? declarator.id : undefined;
  // A helper around the call may read what the module exports, so only the call itself counts.
  const direct =
    declarator.type === 'VariableDeclarator' &&
    declarator.init !== null &&
    strip(declarator.init) === load?.node;
  const names = id?.type === 'Identifier' && direct ? memberReads(body, id) : undefined;
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
    const destructured = destructuredLoad(node, kind);
    const found = destructured ?? namespaceLoad(node, kind, body);
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
