import type { Node } from 'oxc-parser';

import { strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { patternNames } from './declarations.ts';
import { declaringScope, lookupFiltered } from './scope.ts';
import type { Scope } from './scope.ts';
import { collectWrites } from './writes.ts';

/** `-1` for a list of names, or the position of the name in a list of pairs. */
type Shape = { index: number; object: string };

const isName = (node: Node, name?: string): node is NodeOf<'Identifier'> =>
  node.type === 'Identifier' && (name === undefined || node.name === name);

/** The callback body when it is one expression or one `return` of it. */
function resultOf(callback: Node): Node | undefined {
  if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression') {
    return undefined;
  }
  const body: Node | null = callback.body;
  if (body === null) return undefined;
  if (body.type !== 'BlockStatement') return strip(body);
  const [only] = body.body;
  return body.body.length === 1 && only?.type === 'ReturnStatement' && only.argument !== null
    ? strip(only.argument)
    : undefined;
}

/** `([name]) => name in obj` or `name => name in obj`: which part of each item is tested, and the object. */
function testedShape(callback: Node): Shape | undefined {
  const result = resultOf(callback);
  const fn =
    callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression'
      ? callback
      : undefined;
  const param = fn?.params[0];
  if (result?.type !== 'BinaryExpression' || result.operator !== 'in' || param === undefined) {
    return undefined;
  }
  const left = strip(result.left);
  const right = strip(result.right);
  if (!isName(left) || !isName(right)) return undefined;
  // A parameter of the callback that has the name of the object is another binding.
  if (fn?.params.some(item => patternNames(item).includes(right.name)) === true) return undefined;
  if (isName(param, left.name)) return { index: -1, object: right.name };
  const index =
    param.type === 'ArrayPattern'
      ? param.elements.findIndex(element => element !== null && isName(element, left.name))
      : -1;
  return index < 0 ? undefined : { index, object: right.name };
}

/**
 * Remembers `const list = items.filter(([name]) => name in obj)`: each name in the list is a key
 * that `obj` has.
 * ponytail: a list that the code changes after the filter is not tracked.
 */
export function bindFilteredList(name: string, init: Node, scope: Scope): void {
  const call = strip(init);
  const callee = call.type === 'CallExpression' ? strip(call.callee) : undefined;
  const [callback] = call.type === 'CallExpression' ? call.arguments : [];
  const shape =
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === 'filter' &&
    callback !== undefined
      ? testedShape(callback)
      : undefined;
  if (shape !== undefined) {
    scope.filtered.set(name, { ...shape, scope: declaringScope(scope, shape.object) });
  }
}

/** The name of `for (const [name] of list)` is a key that the object of the filter has. */
export function bindPresentLoop(node: NodeOf<'ForOfStatement'>, scope: Scope): void {
  const list = strip(node.right);
  const entry = isName(list) ? lookupFiltered(scope, list.name) : undefined;
  const id =
    node.left.type === 'VariableDeclaration' && node.left.kind !== 'var'
      ? node.left.declarations[0]?.id
      : undefined;
  const target =
    entry === undefined
      ? undefined
      : entry.index < 0
        ? id
        : id && 'elements' in id
          ? id.elements[entry.index]
          : undefined;
  if (
    entry !== undefined &&
    target !== undefined &&
    target !== null &&
    isName(target) &&
    !collectWrites([node.body]).has(target.name)
  ) {
    scope.present.set(target.name, { object: entry.object, scope: entry.scope });
  }
}
