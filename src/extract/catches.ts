import type { Node } from 'oxc-parser';

import { childNodes, isFunction, isInequality, staticKey, stringLiteral, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';

/** Whether code throws, in the code itself rather than in a function it defines. */
function throws(node: Node): boolean {
  return (
    node.type === 'ThrowStatement' ||
    (!isFunction(node) && childNodes(node).some(child => throws(child)))
  );
}

/**
 * Whether a `catch` stops an error that reaches it: it does not throw again, so what follows
 * the `try` runs either way.
 */
export function catches(node: NodeOf<'TryStatement'>): boolean {
  return node.handler !== null && !throws(node.handler.body);
}

const moduleErrorCodes = new Set([
  'ERR_MODULE_NOT_FOUND',
  'ERR_UNKNOWN_BUILTIN_MODULE',
  'MODULE_NOT_FOUND',
]);

/** `error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE'`, or the same with the sides swapped. */
function unequalModuleCode(node: Node, param: string): string | undefined {
  const test = strip(node);
  if (test.type !== 'BinaryExpression' || !isInequality(test.operator)) {
    return undefined;
  }
  const member = test.left.type === 'MemberExpression' ? test.left : test.right;
  const literal = member === test.left ? test.right : test.left;
  const code = stringLiteral(literal);
  const object = member.type === 'MemberExpression' ? strip(member.object) : undefined;
  const key =
    member.type === 'MemberExpression' ? staticKey(member.property, member.computed) : undefined;
  if (
    code === undefined ||
    !moduleErrorCodes.has(code) ||
    member.type !== 'MemberExpression' ||
    member.optional ||
    key !== 'code' ||
    object?.type !== 'Identifier' ||
    object.name !== param
  ) {
    return undefined;
  }
  return code;
}

/** The missing-module codes that make an `&&` test false. An `||` does not, because one side can still throw. */
function codesInTest(node: Node, param: string, found: Set<string>): void {
  const test = strip(node);
  if (test.type === 'LogicalExpression' && test.operator === '&&') {
    codesInTest(test.left, param, found);
    codesInTest(test.right, param, found);
    return;
  }
  const code = unequalModuleCode(test, param);
  if (code !== undefined) {
    found.add(code);
  }
}

/**
 * The missing-module codes that this `catch` does not throw again. Every `throw` must sit in the
 * branch that runs only when `error.code` is not one of those codes. A `throw` anywhere else
 * means the catch does not stop that error.
 */
function codesOfThrows(
  node: Node,
  param: string,
  active: ReadonlySet<string>,
  found: Set<string> | undefined,
): Set<string> | undefined {
  if (found === undefined || isFunction(node)) {
    return found;
  }
  if (node.type === 'ThrowStatement') {
    for (const code of found) {
      if (!active.has(code)) {
        found.delete(code);
      }
    }
    return found.size === 0 ? undefined : found;
  }
  if (node.type === 'IfStatement') {
    const added = new Set(active);
    codesInTest(node.test, param, added);
    const consequent = codesOfThrows(node.consequent, param, added, found);
    return node.alternate === null
      ? consequent
      : codesOfThrows(node.alternate, param, active, consequent);
  }
  let current: Set<string> | undefined = found;
  for (const child of childNodes(node)) {
    current = codesOfThrows(child, param, active, current);
  }
  return current;
}

/**
 * The codes of a missing module that this `catch` stops: it throws again only when `error.code`
 * is not `ERR_UNKNOWN_BUILTIN_MODULE` or not `MODULE_NOT_FOUND`. Empty when the catch does not
 * throw, or when a throw is not limited to those codes.
 */
export function missingModuleCatch(node: NodeOf<'TryStatement'>): ReadonlySet<string> | undefined {
  const param = node.handler?.param;
  if (node.handler === null || param?.type !== 'Identifier' || !throws(node.handler.body)) {
    return undefined;
  }
  return codesOfThrows(node.handler.body, param.name, new Set(), new Set(moduleErrorCodes));
}
