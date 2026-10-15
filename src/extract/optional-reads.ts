import type { Node } from 'oxc-parser';

import { strip } from './ast.ts';

const patterns = new Set(['ObjectPattern', 'ArrayPattern']);

/** Whether `parent` destructures the value of `node`: `const { a } = node`, `({ a } = node)` or `{ a } = node` as a default. */
function isDestructured(node: Node, parent: Node): boolean {
  return (
    (parent.type === 'VariableDeclarator' &&
      parent.init === node &&
      patterns.has(parent.id.type)) ||
    (parent.type === 'AssignmentExpression' &&
      parent.operator === '=' &&
      parent.right === node &&
      patterns.has(parent.left.type)) ||
    (parent.type === 'AssignmentPattern' && parent.right === node && patterns.has(parent.left.type))
  );
}

/**
 * Whether `parent` uses the value of `node` in a way that throws a TypeError for `undefined`:
 * `new`, `extends`, a tag, the right side of `instanceof`, destructuring, a spread into an array or
 * a call, `for…of` or `yield*`.
 * `outer` holds the ancestors above `parent`, nearest first.
 */
function throwsOnUndefined(node: Node, parent: Node, outer: readonly Node[]): boolean {
  return (
    (parent.type === 'NewExpression' && parent.callee === node) ||
    ((parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') &&
      parent.superClass === node) ||
    (parent.type === 'TaggedTemplateExpression' && parent.tag === node) ||
    (parent.type === 'BinaryExpression' &&
      parent.operator === 'instanceof' &&
      parent.right === node) ||
    (parent.type === 'SpreadElement' && outer[0]?.type !== 'ObjectExpression') ||
    (parent.type === 'ForOfStatement' && parent.right === node) ||
    (parent.type === 'YieldExpression' && parent.delegate) ||
    isDestructured(node, parent)
  );
}

/**
 * Whether `node` ends in `a?.b` and its value is not called as `a?.b()`. Such a read gives
 * `undefined` when `b` is missing, so it checks for `b` and does not use it. A use of the value
 * that throws for `undefined`, such as `new (a?.b)()`, is a use. `outer` holds the ancestors above
 * `parent`, nearest first.
 */
export function isOptionalRead(
  node: Node,
  parent: Node | undefined,
  outer: readonly Node[],
): boolean {
  const member = strip(node);
  return (
    member.type === 'MemberExpression' &&
    member.optional &&
    !(parent?.type === 'CallExpression' && parent.callee === node && !parent.optional) &&
    !(parent !== undefined && throwsOnUndefined(node, parent, outer))
  );
}
