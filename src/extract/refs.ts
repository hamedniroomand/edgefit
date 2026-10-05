import type { MemberExpression, Node } from 'oxc-parser';

import { displayApi } from '@/data/builtins.ts';
import type { ApiRef } from '@/types.ts';

import { destructuredNames, staticKey, strip, unwrap } from './ast.ts';
import { parameterReads } from './local-functions.ts';
import type { LocalFunction, ParameterRead } from './local-functions.ts';

function calledFunction(
  callee: Node,
  functions: ReadonlyMap<string, LocalFunction>,
): LocalFunction | undefined {
  if (callee.type === 'Identifier') {
    return functions.get(callee.name);
  }
  return callee.type === 'FunctionExpression' || callee.type === 'ArrowFunctionExpression'
    ? callee
    : undefined;
}

export const globalAliases = new Set(['global', 'globalThis', 'self']);

export const extendedReason = 'extended by a class, so its instance members may be used elsewhere';

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
  // `({ a } = value)` reads the names here. The value then goes where the assignment goes.
  const namedAssignment =
    parent.type === 'AssignmentExpression' &&
    parent.operator === '=' &&
    parent.right === node &&
    destructuredNames(parent.left) !== undefined;
  if ((passesOn || namedAssignment) && grand !== undefined) {
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
 * and `??` is a check too, see `isTested`.
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

const writeOperators = new Set(['=', '??=', '||=']);

/** Whether `node` is the member that `=`, `??=` or `||=` sets: `a.b = v`. */
export function isMemberWrite(node: Node, parent: Node): node is MemberExpression {
  return (
    node.type === 'MemberExpression' &&
    parent.type === 'AssignmentExpression' &&
    parent.left === node &&
    writeOperators.has(parent.operator)
  );
}

/** The object of a member that is set, with the offset of the access that names it. */
export function writtenObject(
  ref: ApiRef,
  node: MemberExpression,
): { ref: ApiRef; offset: number } {
  const object = strip(node.object);
  return {
    ref: { ...ref, path: ref.path.slice(0, -1) },
    offset: object.type === 'MemberExpression' ? object.property.start : object.start,
  };
}

/**
 * Whether `node` ends in `a?.b` and its value is not called as `a?.b()`. Such a read gives
 * `undefined` when `b` is missing, so it checks for `b` and does not use it.
 */
export function isOptionalRead(node: Node, parent: Node | undefined): boolean {
  const member = strip(node);
  return (
    member.type === 'MemberExpression' &&
    member.optional &&
    !(parent?.type === 'CallExpression' && parent.callee === node && !parent.optional)
  );
}

const comparisonOperators = new Set(['==', '===', '!=', '!==']);

/** Whether `node` is an operand of `==`, `===`, `!=` or `!==`, so only its identity is read. */
export function isComparisonOperand(node: Node, parent: Node): boolean {
  return (
    parent.type === 'BinaryExpression' &&
    comparisonOperators.has(parent.operator) &&
    (parent.left === node || parent.right === node)
  );
}

/** Whether a computed read only tests for a member, or is a global that is only compared. */
export function isOnlyTested(member: Node, parent: Node, ref: ApiRef): boolean {
  return (
    isFeatureCheck(member, parent) || (isGlobalRoot(ref) && isComparisonOperand(member, parent))
  );
}

/** Whether `node` is called and the result is awaited: `await a.b()`. `outer` holds the ancestors above `parent`. */
export function isAwaitedCall(node: Node, parent: Node, outer: readonly Node[]): boolean {
  // `await` also passes its value on, so it is the one wrapper that ends the search.
  const next = outer.find(
    ancestor => ancestor.type === 'AwaitExpression' || unwrap(ancestor) === undefined,
  );
  return (
    parent.type === 'CallExpression' && parent.callee === node && next?.type === 'AwaitExpression'
  );
}

/**
 * Whether the API gives a promise, so an error of it is a rejection. The data does not say it, so
 * this reads the name: a `promises` module or path, or `crypto.subtle`.
 * ponytail: a function that returns a promise outside a `promises` path counts as sync. Add a field to the data to cover it.
 */
export function isPromiseApi(ref: ApiRef): boolean {
  return (
    ref.module.endsWith('/promises') || ref.path.includes('promises') || ref.path.includes('subtle')
  );
}

/**
 * The member reads that the function of the file makes on the parameter that a value is passed to.
 * The value is an argument, or the value of a property of an object literal that is an argument.
 * `parent` is the parent of `node`, and `outer` holds the ancestors above it, nearest first.
 */
export function findParameterReads(
  node: Node,
  parent: Node,
  outer: readonly Node[],
  functions: ReadonlyMap<string, LocalFunction>,
): ParameterRead[] | undefined {
  const [grand, great] = outer;
  const inObject =
    parent.type === 'Property' &&
    parent.value === node &&
    grand?.type === 'ObjectExpression' &&
    great?.type === 'CallExpression';
  const call = inObject ? great : parent;
  const argument = inObject ? grand : node;
  const key = inObject ? staticKey(parent.key, parent.computed) : undefined;
  const callee = call.type === 'CallExpression' ? strip(call.callee) : undefined;
  const fn = callee === undefined ? undefined : calledFunction(callee, functions);
  const index =
    call.type === 'CallExpression' ? call.arguments.findIndex(item => item === argument) : -1;
  if (fn === undefined || index < 0 || (inObject && key === undefined)) {
    return undefined;
  }
  return parameterReads(fn, index, inObject, functions)?.filter(
    read => !inObject || read.key === undefined || read.key === key,
  );
}
