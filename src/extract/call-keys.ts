import type { Node } from 'oxc-parser';

import { childNodes, strip } from './ast.ts';
import { collectBlockNames, patternNames } from './declarations.ts';
import { collectKnown } from './key-bindings.ts';
import { keysOf } from './known-values.ts';
import { declarationCounts, findLocalFunctions, isPropertyName } from './local-functions.ts';
import type { LocalFunction } from './local-functions.ts';
import { createScope, declare } from './scope.ts';
import type { Scope } from './scope.ts';

/** The strings that every call of a function passes, by index of the parameter. */
export type CallKeys = ReadonlyMap<LocalFunction, ReadonlyMap<number, readonly string[]>>;

type Calls = Map<string, Node[]>;

/** The names that an `export` declaration makes visible to other files. */
function exportedFunctions(node: Node): string[] {
  const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : null;
  if (declaration?.type === 'FunctionDeclaration') {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  return declaration?.type === 'VariableDeclaration'
    ? declaration.declarations.flatMap(declarator => patternNames(declarator.id))
    : [];
}

/** The calls of each local function by name. A name that is used in any other way has no entry. */
function callsOf(body: readonly Node[], functions: ReadonlyMap<string, LocalFunction>): Calls {
  const calls: Calls = new Map([...functions.keys()].map(name => [name, []]));
  const pending: [Node, Node | undefined][] = body.map(node => [node, undefined]);
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const [node, parent] = item;
    for (const name of exportedFunctions(node)) calls.delete(name);
    if (node.type === 'Identifier' && calls.has(node.name) && !isPropertyName(node, parent)) {
      const isDeclaration =
        (parent?.type === 'FunctionDeclaration' || parent?.type === 'VariableDeclarator') &&
        parent.id === node;
      const isCall = parent?.type === 'CallExpression' && strip(parent.callee) === node;
      if (isCall) calls.get(node.name)?.push(parent);
      else if (!isDeclaration) calls.delete(node.name);
    }
    for (const child of childNodes(node)) pending.push([child, node]);
  }
  return new Map(
    [...calls].map(([name, list]) => [name, list.toSorted((a, b) => a.start - b.start)]),
  );
}

/** Whether every name in an expression is declared once in the file, so no inner name hides one of the program. */
function namesAreUnique(node: Node, counts: ReadonlyMap<string, number>): boolean {
  const pending = [node];
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (item.type === 'Identifier' && (counts.get(item.name) ?? 0) > 1) return false;
    pending.push(...childNodes(item));
  }
  return true;
}

function argumentKeys(
  calls: readonly Node[],
  index: number,
  scope: Scope,
  counts: ReadonlyMap<string, number>,
): readonly string[] | undefined {
  const sets = calls.map(call => {
    const args = call.type === 'CallExpression' ? call.arguments : [];
    const argument = args[index];
    const spread = args.slice(0, index + 1).some(item => item.type === 'SpreadElement');
    return argument === undefined || spread || !namesAreUnique(argument, counts)
      ? undefined
      : keysOf(argument, scope);
  });
  return calls.length > 0 && sets.every(set => set !== undefined)
    ? [...new Set(sets.flat())]
    : undefined;
}

/**
 * The strings that a parameter holds, for a function of the file that is only called by name and
 * where every call passes a known string. The arguments are read in the scope of the program, so
 * a name that the file declares twice makes the argument unknown.
 * ponytail: a call that passes a name from an inner scope is unknown. Read the call site scope to lift it.
 */
export function findCallKeys(
  body: readonly Node[],
  functions: ReadonlyMap<string, LocalFunction>,
): CallKeys {
  const result = new Map<LocalFunction, Map<number, readonly string[]>>();
  const calls = callsOf(body, functions);
  if (calls.size === 0) return result;
  const scope = createScope();
  declare(scope, collectBlockNames(body));
  collectKnown(body, scope, []);
  const counts = declarationCounts(body);
  for (const [name, list] of calls) {
    const fn = functions.get(name);
    const keys = new Map<number, readonly string[]>();
    for (const [index, param] of fn?.params.entries() ?? []) {
      const found =
        param.type === 'Identifier' ? argumentKeys(list, index, scope, counts) : undefined;
      if (found !== undefined) keys.set(index, found);
    }
    if (fn !== undefined && keys.size > 0) result.set(fn, keys);
  }
  return result;
}

/** The local functions of a file, and the strings that their parameters hold. */
export function findFunctions(body: readonly Node[]): {
  functions: Map<string, LocalFunction>;
  callKeys: CallKeys;
} {
  const functions = findLocalFunctions(body);
  return { functions, callKeys: findCallKeys(body, functions) };
}
