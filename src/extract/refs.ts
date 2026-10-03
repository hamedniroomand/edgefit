import type { Node } from 'oxc-parser';

import { displayApi } from '@/data/builtins.ts';
import type { ApiRef } from '@/types.ts';

import { unwrap } from './ast.ts';

export const globalAliases = new Set(['global', 'globalThis', 'self']);

// Helpers that wrap `require()` results in Babel, TypeScript, esbuild and Rollup output.
const interopHelpers = new Set([
  '__importDefault',
  '__importStar',
  '__toESM',
  '_interopDefault',
  '_interopDefaultCompat',
  '_interopNamespace',
  '_interopNamespaceCompat',
  '_interopNamespaceDefault',
  '_interopNamespaceDefaultOnly',
  '_interopRequireDefault',
  '_interopRequireWildcard',
  '_interop_require_default',
  '_interop_require_wildcard',
  'interopRequireDefault',
  'interopRequireWildcard',
]);

// Parents that use a value on the spot rather than pass it on.
const consumingParents = new Set([
  'ExpressionStatement',
  'VariableDeclarator',
  'MemberExpression',
  'UnaryExpression',
  'BinaryExpression',
  'LogicalExpression',
  'IfStatement',
  'ConditionalExpression',
  'SwitchStatement',
  'NewExpression',
  'TaggedTemplateExpression',
]);

export function moduleRef(module: string): ApiRef {
  return { module, path: [] };
}

export function memberRef(ref: ApiRef, key: string): ApiRef {
  return { ...ref, path: [...ref.path, key] };
}

export function globalRef(name: string): ApiRef {
  return { module: '*globals*', path: [name] };
}

/** True for `globalThis` and its aliases on their own, which say nothing about the API used. */
export function isGlobalRoot(ref: ApiRef): boolean {
  return ref.module === '*globals*' && ref.path.every(segment => globalAliases.has(segment));
}

/** Maps `globalThis.process.env` to `process.env` and `global.Buffer` to `Buffer`. */
export function normalizeRef(ref: ApiRef): ApiRef {
  if (ref.module !== '*globals*') {
    return ref;
  }
  let start = 0;
  while (start < ref.path.length - 1 && globalAliases.has(ref.path[start] ?? '')) {
    start += 1;
  }
  const path = ref.path.slice(start);
  return path[0] === 'process'
    ? { module: 'process', path: path.slice(1), global: true }
    : { module: '*globals*', path };
}

export function displayRef(ref: ApiRef): string {
  const normalized = normalizeRef(ref);
  return displayApi(normalized.module, normalized.path);
}

export function isInteropHelper(callee: Node): boolean {
  if (callee.type === 'Identifier') {
    return interopHelpers.has(callee.name);
  }
  if (callee.type === 'MemberExpression' && !callee.computed) {
    return interopHelpers.has(callee.property.name);
  }
  if (callee.type === 'ParenthesizedExpression') {
    return isInteropHelper(callee.expression);
  }
  if (callee.type === 'SequenceExpression') {
    const last = callee.expressions.at(-1);
    return last !== undefined && isInteropHelper(last);
  }
  return false;
}

const thisBinders = new Set(['apply', 'bind', 'call']);

/** `fn.call(util, ...)` only sets `this`; the module's other members stay out of reach. */
function isThisArgument(node: Node, call: Node): boolean {
  return (
    call.type === 'CallExpression' &&
    call.arguments[0] === node &&
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    thisBinders.has(call.callee.property.name)
  );
}

/**
 * Whether a value flows somewhere edgefit does not follow, such as a call argument or a return.
 * `outer` holds the ancestors above `parent`, nearest first. The last value of a sequence goes where the
 * sequence goes, so `(0, ns.fn)()` calls `ns.fn`.
 */
export function escapes(node: Node, parent: Node, outer: readonly Node[] = []): boolean {
  const [grand, ...rest] = outer;
  const passesOn =
    unwrap(parent) === node ||
    (parent.type === 'SequenceExpression' && parent.expressions.at(-1) === node);
  if (passesOn && grand !== undefined) {
    return escapes(parent, grand, rest);
  }
  if (parent.type === 'CallExpression') {
    return parent.callee !== node && !isThisArgument(node, parent);
  }
  return !consumingParents.has(parent.type);
}

function isNullishOperand(node: Node): boolean {
  return (
    (node.type === 'Identifier' && node.name === 'undefined') ||
    (node.type === 'Literal' && node.value === null && node.raw === 'null') ||
    (node.type === 'UnaryExpression' && node.operator === 'void')
  );
}

/**
 * Tests for an API rather than uses it: `typeof x.y`, `'y' in x`, `!x.y`, `x.y === undefined`,
 * and `x.y` as the condition of an `if` or `?:` or the left side of `&&`. The left side of `||`
 * and `??` is the value that gets used, so it stays a use.
 */
export function isFeatureCheck(node: Node, parent: Node): boolean {
  if (parent.type === 'UnaryExpression') {
    return parent.operator === 'typeof' || parent.operator === '!';
  }
  if (parent.type === 'BinaryExpression') {
    if (parent.operator === 'in') {
      return parent.right === node;
    }
    const other = parent.left === node ? parent.right : parent.left;
    return ['==', '===', '!=', '!=='].includes(parent.operator) && isNullishOperand(other);
  }
  if (parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') {
    return parent.test === node;
  }
  return parent.type === 'LogicalExpression' && parent.operator === '&&' && parent.left === node;
}
