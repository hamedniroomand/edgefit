import type { Node } from 'oxc-parser';

import { childNodes, staticKey } from './ast.ts';
import type { VisitContext } from './context.ts';
import { isModuleLet } from './module-let.ts';
import { isGlobalRoot } from './refs.ts';
import { isTracked } from './scope.ts';

/** How a statement list uses one name. */
type Uses = { declared: number; writes: number; other: boolean };

/** How a statement list uses each name, and whether it has `eval` or `with`, which can reach any name. */
type Scan = { uses: ReadonlyMap<string, Uses>; dynamic: boolean };

type Parents = ReadonlyMap<Node, Node>;

const found = new WeakMap<readonly Node[], Scan>();

/** Wrappers that pass the object of a member read through unchanged. */
const passThrough = new Set([
  'ParenthesizedExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

/** Keys that reach the prototype of an object, give the object back, or change it. */
const unsafeKeys = new Set([
  '__proto__',
  'constructor',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/** A literal or a template. A regular expression is an object with methods that return it. */
function isPrimitive(value: Node): boolean {
  return value.type === 'TemplateLiteral' || (value.type === 'Literal' && !('regex' in value));
}

/**
 * A value that cannot give the global object, or itself, through a member: a primitive, or an object
 * literal of primitives. An array or a nested object has members that return it or can be changed.
 */
function isInert(value: Node): boolean {
  return (
    isPrimitive(value) ||
    (value.type === 'ObjectExpression' &&
      value.properties.every(
        property =>
          property.type === 'Property' &&
          property.kind === 'init' &&
          !property.method &&
          !property.shorthand &&
          !property.computed &&
          staticKey(property.key, false) !== '__proto__' &&
          isPrimitive(property.value),
      ))
  );
}

/** Whether the member chain `top` is written to or deleted, and not read. */
function isWritten(top: Node, parents: Parents): boolean {
  const parent = parents.get(top);
  if (parent === undefined) {
    return false;
  }
  if (
    parent.type === 'AssignmentExpression' ||
    parent.type === 'AssignmentPattern' ||
    parent.type === 'ForInStatement' ||
    parent.type === 'ForOfStatement'
  ) {
    return parent.left === top;
  }
  if (parent.type === 'Property') {
    return parents.get(parent)?.type === 'ObjectPattern';
  }
  return (
    (parent.type === 'UnaryExpression' && parent.operator === 'delete') ||
    parent.type === 'UpdateExpression' ||
    parent.type === 'ArrayPattern' ||
    parent.type === 'RestElement'
  );
}

/**
 * Whether `name` is only read through members, as in `g.document`. A computed key that is not a
 * fixed string, a key that reaches the prototype, or a chain that is written to or deleted does
 * not count.
 */
function isMemberRead(name: Node, parents: Parents): boolean {
  let top = name;
  let reads = 0;
  for (let parent = parents.get(top); parent !== undefined; parent = parents.get(top)) {
    if (parent.type === 'MemberExpression' && parent.object === top) {
      const key = staticKey(parent.property, parent.computed);
      if (key === undefined || unsafeKeys.has(key)) {
        return false;
      }
      reads += 1;
    } else if (!passThrough.has(parent.type)) {
      break;
    }
    top = parent;
  }
  return reads > 0 && !isWritten(top, parents);
}

/** Whether `node` names a property and not a variable, as `b` in `a.b` or `{ b: 1 }`. */
function isKey(node: Node, parent: Node | undefined): boolean {
  if (parent?.type === 'MemberExpression') {
    return parent.property === node && !parent.computed;
  }
  return (
    parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand
  );
}

function addUse(
  uses: Map<string, Uses>,
  name: Node,
  parents: Parents,
  statements: ReadonlySet<Node>,
): void {
  const parent = parents.get(name);
  if (name.type !== 'Identifier' || isKey(name, parent)) {
    return;
  }
  const use = uses.get(name.name) ?? { declared: 0, writes: 0, other: false };
  uses.set(name.name, use);
  const statement = parent === undefined ? undefined : parents.get(parent);
  if (parent?.type === 'VariableDeclarator' && parent.id === name) {
    // Each declaration counts, also one with no value, such as a loop head that writes the name.
    use.declared += 1;
  } else if (
    parent?.type === 'AssignmentExpression' &&
    parent.left === name &&
    parent.operator === '=' &&
    statement !== undefined &&
    statements.has(statement)
  ) {
    use.writes += 1;
  } else if (!isMemberRead(name, parents)) {
    use.other = true;
  }
}

/**
 * How `statements` use each name: the declarations, the writes that are statements of their own,
 * and whether any other use is not a member read.
 * ponytail: a nested list is scanned again for each list around it that has a candidate write.
 * Upgrade: scan each function once.
 */
function usesIn(statements: readonly Node[]): Scan {
  const cached = found.get(statements);
  if (cached !== undefined) {
    return cached;
  }
  const uses = new Map<string, Uses>();
  const parents = new Map<Node, Node>();
  const own = new Set(statements);
  const pending = [...statements];
  let dynamic = false;
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    addUse(uses, node, parents, own);
    dynamic ||= node.type === 'WithStatement';
    for (const child of childNodes(node)) {
      parents.set(child, node);
      pending.push(child);
    }
  }
  const scan = { uses, dynamic: dynamic || uses.has('eval') };
  found.set(statements, scan);
  return scan;
}

/** Whether `statement` declares a function, which exists before the code above it runs. */
function isHoisted(statement: Node): boolean {
  let declared: Node = statement;
  while (declared.type === 'LabeledStatement') {
    declared = declared.body;
  }
  const inner =
    declared.type === 'ExportNamedDeclaration' || declared.type === 'ExportDefaultDeclaration'
      ? declared.declaration
      : declared;
  return inner?.type === 'FunctionDeclaration';
}

/**
 * Whether no other code in `statements` can give `name` the global object again or use it as a
 * value. A scope with `eval` or `with`, a parameter, or a top-level name that is not a plain `let`
 * of a file that surely is an ES module fails.
 */
function isOnlyRead(name: string, statements: readonly Node[], context: VisitContext): boolean {
  const { uses, dynamic } = usesIn(statements);
  const use = uses.get(name);
  return (
    use?.declared === 1 &&
    use.writes === 1 &&
    !use.other &&
    !dynamic &&
    // In sloppy code, `arguments[0] = value` also writes the first parameter.
    !context.scope.parameters.has(name) &&
    (context.scope.parent !== undefined || isModuleLet(statements, name))
  );
}

/**
 * `g = {}` as a statement of its own ends `let g = globalThis`, so the code after it does not read
 * the global object through `g`. The value must not be able to hold the global object, and all
 * other code in the scope must only read members of `g`. At the top level, code outside the file
 * can write `g` unless the file surely is an ES module. A function declaration is hoisted, so a function
 * that comes after the write can run before it. In these cases the alias stays.
 */
export function dropRewrittenAlias(
  statements: readonly Node[],
  index: number,
  context: VisitContext,
): void {
  const statement = statements[index];
  const write = statement?.type === 'ExpressionStatement' ? statement.expression : undefined;
  if (
    write?.type !== 'AssignmentExpression' ||
    write.operator !== '=' ||
    write.left.type !== 'Identifier' ||
    !isInert(write.right)
  ) {
    return;
  }
  const { name } = write.left;
  const binding = context.scope.names.get(name);
  if (
    isTracked(binding) &&
    isGlobalRoot(binding.ref) &&
    isOnlyRead(name, statements, context) &&
    !statements.slice(index + 1).some(later => isHoisted(later))
  ) {
    context.scope.names.set(name, null);
  }
}
