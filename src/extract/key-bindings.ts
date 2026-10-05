import type { Node } from 'oxc-parser';

import { staticKey, strip } from './ast.ts';
import type { FunctionNode, NodeOf } from './ast.ts';
import { collectVarDeclarators } from './declarations.ts';
import { elementsOf, keysOf, unionKeys, valueOf } from './known-values.ts';
import type { Scope } from './scope.ts';
import { collectWrites } from './writes.ts';
import type { Writes } from './writes.ts';

/** Array methods whose callback gets each element as its first argument. */
const iterators = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'flatMap',
  'forEach',
  'map',
  'some',
]);

function functionName(statement: Node): string[] {
  const declaration =
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
  return declaration?.type === 'FunctionDeclaration' && declaration.id !== null
    ? [declaration.id.name]
    : [];
}

/**
 * The declarators a block declares in its own scope, with whether each is a `const`. `params`
 * is the parameter list of a function body, where each `var` of the body belongs too.
 */
function declarators(
  statements: readonly Node[],
  params: readonly string[] | undefined,
): (readonly [NodeOf<'VariableDeclarator'>, boolean])[] {
  const lexical = statements.flatMap(statement => {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    return declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var'
      ? declaration.declarations.map(
          declarator => [declarator, declaration.kind === 'const'] as const,
        )
      : [];
  });
  if (params === undefined) {
    return lexical;
  }
  // A parameter or a function with the same name holds another value before the `var` line runs.
  const taken = new Set([...params, ...statements.flatMap(statement => functionName(statement))]);
  const hoisted = statements
    .flatMap(statement => collectVarDeclarators(statement))
    .filter(({ id }) => id.type !== 'Identifier' || !taken.has(id.name));
  return [...lexical, ...hoisted.map(declarator => [declarator, false] as const)];
}

/** Remembers what `name` may hold: the value of `init`, and each other value written to it. */
function bindName(
  scope: Scope,
  name: string,
  init: Node,
  others: readonly Node[] | null,
  constant: boolean,
): void {
  const keys = unionKeys([
    keysOf(init, scope),
    ...(others ?? []).map(value => keysOf(value, scope)),
  ]);
  const value = others?.length === 0 ? valueOf(init, scope) : undefined;
  if (keys !== undefined && (others !== null || constant)) {
    scope.keys.set(name, keys);
  }
  if (typeof value === 'object') {
    scope.objects.set(name, value);
  }
}

/**
 * Remembers the names a block declares that can only hold known values, before the block runs,
 * so a function can read a `const` that the file declares after it. A `let` or a `var` counts
 * when each value written to it is known: `if (!console[m]) m = 'log'` adds `log` to `m`.
 * `params` is given for the body of a function or a file, where each `var` of the body belongs.
 */
export function collectKnown(
  statements: readonly Node[],
  scope: Scope,
  params?: readonly string[],
): void {
  let writes: Writes | undefined;
  for (const [{ id, init }, constant] of declarators(statements, params)) {
    if (
      id.type !== 'Identifier' ||
      init === null ||
      !scope.names.has(id.name) ||
      (keysOf(init, scope) === undefined && typeof valueOf(init, scope) !== 'object')
    ) {
      continue;
    }
    // Only a known value needs the writes, and finding them reads the whole block.
    // ponytail: each nested block with a known value walks its statements again.
    writes ??= collectWrites(statements);
    const written = writes.get(id.name);
    let others: readonly Node[] | null = null;
    if (written !== null) {
      others = constant ? [] : (written ?? []).filter(value => value !== init);
    }
    bindName(scope, id.name, init, others, constant);
  }
}

/** `name` holds each string of `list`, and each value that `body` writes to it. */
function bindElements(scope: Scope, name: string, list: Node, body: Node, outer: Scope): void {
  const elements = elementsOf(list, outer);
  const written = elements === undefined ? null : collectWrites([body]).get(name);
  const keys =
    written === null
      ? undefined
      : unionKeys([elements, ...(written ?? []).map(value => keysOf(value, scope))]);
  if (keys !== undefined) {
    scope.keys.set(name, keys);
  }
}

/** The name of `for (const key of keys)` holds each string of `keys`. */
export function bindLoopKeys(node: NodeOf<'ForOfStatement'>, scope: Scope): void {
  const id = node.left.type === 'VariableDeclaration' ? node.left.declarations[0]?.id : node.left;
  if (id?.type === 'Identifier') {
    bindElements(scope, id.name, node.right, node.body, scope);
  }
}

/** The first parameter of `keys.forEach(key => ...)` holds each string of `keys`. */
export function bindCallbackKeys(
  fn: FunctionNode,
  call: Node | undefined,
  scope: Scope,
  outer: Scope,
): void {
  const callee = call?.type === 'CallExpression' ? strip(call.callee) : undefined;
  const [first] = fn.params;
  if (
    call?.type === 'CallExpression' &&
    call.arguments[0] === fn &&
    callee?.type === 'MemberExpression' &&
    iterators.has(staticKey(callee.property, callee.computed) ?? '') &&
    first?.type === 'Identifier' &&
    fn.body !== null
  ) {
    bindElements(scope, first.name, callee.object, fn.body, outer);
  }
}
