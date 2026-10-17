import type { Node } from 'oxc-parser';

import {
  childNodes,
  isEquality,
  isFunction,
  isInequality,
  strip,
  stringLiteral,
} from '@/extract/ast.ts';

import { isName } from './cjs-forms.ts';

/** The nodes whose `test` field is only a condition. */
const testers = new Set([
  'IfStatement',
  'ConditionalExpression',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
]);
const testOperators = new Set(['typeof', '!', 'void']);
/** The tsc helpers that take `this` as the first argument and only pass it on to a nested function. */
const forwarders = new Set(['__awaiter', '__generator']);

/** Whether the parent only tests `this`, as in `this && this.name` or `typeof this`. Then no value of it is used. */
function isTested(node: Node, parent: Node): boolean {
  return (
    (parent.type === 'LogicalExpression' && parent.operator === '&&' && parent.left === node) ||
    (parent.type === 'UnaryExpression' && testOperators.has(parent.operator)) ||
    (parent.type === 'BinaryExpression' &&
      (isEquality(parent.operator) ||
        isInequality(parent.operator) ||
        parent.operator === 'instanceof' ||
        parent.operator === 'in')) ||
    (testers.has(parent.type) && 'test' in parent && parent.test === node)
  );
}

/**
 * `this` as the first argument of `__awaiter(this, …)` or `tslib_1.__generator(this, …)`, which tsc
 * writes for an async function, or of `name.apply(this, …)` or `name.call(this, …)`, which Babel and
 * SWC write. The `this` reads of that function count in its own code, when its unit is an export.
 */
function isForwarded(node: Node, parent: Node): boolean {
  if (parent.type !== 'CallExpression' || parent.arguments[0] !== node) {
    return false;
  }
  const callee = strip(parent.callee);
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    strip(callee.object).type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    (callee.property.name === 'apply' || callee.property.name === 'call')
  ) {
    return true;
  }
  const name =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier'
        ? callee.property.name
        : undefined;
  return name !== undefined && forwarders.has(name);
}

/** The mention for one `this`: `this.key` for a read of `key`, `this` for any other use, or none for a test. */
function mentionOf(node: Node, parent: Node | undefined): string | undefined {
  if (parent?.type === 'MemberExpression' && parent.object === node) {
    const key = parent.computed
      ? stringLiteral(parent.property)
      : parent.property.type === 'Identifier'
        ? parent.property.name
        : undefined;
    // An empty key or a key with a dot cannot be written as a mention of an export, so it counts as
    // any use.
    return key === undefined || key === '' || key.includes('.') ? 'this' : `this.${key}`;
  }
  return parent !== undefined && (isTested(node, parent) || isForwarded(node, parent))
    ? undefined
    : 'this';
}

/** A top-level `var __assign = (this && this.__assign) || …`, as tsc writes its helpers. */
function isHelper(node: Node, depth: number): boolean {
  if (
    depth > 0 ||
    node.type !== 'VariableDeclarator' ||
    node.id.type !== 'Identifier' ||
    node.init === null
  ) {
    return false;
  }
  const init = strip(node.init);
  const test =
    init.type === 'LogicalExpression' && init.operator === '||' ? strip(init.left) : undefined;
  const read =
    test?.type === 'LogicalExpression' &&
    test.operator === '&&' &&
    strip(test.left).type === 'ThisExpression'
      ? strip(test.right)
      : undefined;
  return (
    read?.type === 'MemberExpression' &&
    read.object.type === 'ThisExpression' &&
    !read.computed &&
    isName(read.property, node.id.name)
  );
}

function visit(node: Node, parent: Node | undefined, depth: number, found: Set<string>): void {
  if (node.type === 'ThisExpression') {
    const mention = mentionOf(node, parent);
    if (mention !== undefined) {
      // A read in a function counts only when its unit is an export (see `resolveThisReads`).
      found.add(depth > 0 ? `fn:${mention}` : mention);
    }
    return;
  }
  const own = isFunction(node) && node.type !== 'ArrowFunctionExpression';
  // A class body and a function inside the first one have a `this` of their own, so a computed key
  // in a class body is skipped too. The body of a helper only passes its `this` on.
  if (node.type === 'ClassBody' || (own && depth > 0) || isHelper(node, depth)) {
    return;
  }
  for (const child of childNodes(node)) {
    visit(child, node, own ? depth + 1 : depth, found);
  }
}

/**
 * The reads of `this` in code that can be the exports of a CommonJS module: at the top level, and
 * in each outermost function that the code holds (an export can be called as `lib.name()`), also
 * in an arrow inside it. A read in a function starts with `fn:`, because it counts only when the
 * unit is an export.
 */
export function thisReads(node: Node): Set<string> {
  const found = new Set<string>();
  visit(node, undefined, 0, found);
  return found;
}
