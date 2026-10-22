import type { Node } from 'oxc-parser';

import { childNodes, isFunction, staticKey, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { patternNames } from './declarations.ts';
import { testsPresent } from './fallback-reads.ts';

const bindable = new Set(['Identifier', 'MemberExpression', 'CallExpression', 'ImportExpression']);

type Tally = { writes: number; declarations: number; value: Node | undefined };

function declaredNames(declaration: Node | null | undefined): string[] {
  return declaration?.type === 'VariableDeclaration'
    ? declaration.declarations.flatMap(declarator => patternNames(declarator.id))
    : [];
}

function nameOf(node: { id: { name: string } | null }): string[] {
  return node.id === null ? [] : [node.id.name];
}

const fallbackValues = new Set([
  'Literal',
  'ObjectExpression',
  'ArrayExpression',
  'TemplateLiteral',
]);

/** `name = value` with a literal, an object, an array or a template, which cannot be a module. */
function isFallback(node: NodeOf<'AssignmentExpression'>): boolean {
  return (
    node.operator === '=' &&
    node.left.type === 'Identifier' &&
    fallbackValues.has(strip(node.right).type)
  );
}

/** The names that `node` sets to a value. A declaration without a value sets nothing. */
function writtenNames(node: Node): string[] {
  if (node.type === 'AssignmentExpression') {
    // A fallback such as `x = {}` in a `catch` is a value that cannot be a module, as for a declaration.
    return isFallback(node) ? [] : patternNames(node.left);
  }
  if (node.type === 'UpdateExpression') {
    return patternNames(node.argument);
  }
  if (node.type === 'VariableDeclarator') {
    // A value that cannot be a module is replaced by the one that `=` sets. Any other value is a write.
    return node.init === null || !bindable.has(strip(node.init).type) ? [] : patternNames(node.id);
  }
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    return [...declaredNames(node.left), ...patternNames(node.left)];
  }
  if (node.type === 'ExportNamedDeclaration') {
    const listed = node.specifiers.flatMap(specifier => patternNames(specifier.local));
    return [...declaredNames(node.declaration), ...listed];
  }
  if (node.type === 'CatchClause') {
    return patternNames(node.param);
  }
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    return nameOf(node);
  }
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    return [...nameOf(node), ...node.params.flatMap(param => patternNames(param))];
  }
  if (node.type === 'ArrowFunctionExpression') {
    return node.params.flatMap(param => patternNames(param));
  }
  return [];
}

/**
 * The value of each name that is declared once and set once with `=`, such as
 * `let c; c = require('fs')`. A declaration with a value that cannot be a module, such as `let c = null`,
 * is not counted as a write. The count is by name only. A name that two scopes share counts for
 * both, so a name in the result has no other declaration or write in the file. An export counts
 * as a write, because other code can read the name.
 */
export function findAssigned(body: readonly Node[]): Map<string, Node> {
  const tallies = new Map<string, Tally>();
  const tally = (name: string): Tally => {
    const found = tallies.get(name) ?? { writes: 0, declarations: 0, value: undefined };
    tallies.set(name, found);
    return found;
  };
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    for (const name of writtenNames(node)) {
      tally(name).writes += 1;
    }
    if (node.type === 'VariableDeclarator') {
      for (const name of patternNames(node.id)) {
        tally(name).declarations += 1;
      }
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier' &&
      !isFallback(node)
    ) {
      tally(node.left.name).value = node.operator === '=' ? node.right : undefined;
    }
    for (const child of childNodes(node)) {
      pending.push(child);
    }
  }
  const assigned = new Map<string, Node>();
  for (const [name, { writes, declarations, value }] of tallies) {
    if (writes === 1 && declarations === 1 && value !== undefined) {
      assigned.set(name, value);
    }
  }
  return assigned;
}

/** Whether a value can be set, as the value of an option is: not `false`, `0`, `null`, `undefined` or `''`. */
function isSetValue(node: Node): boolean {
  const value = strip(node);
  if (value.type === 'Literal') {
    return Boolean(value.value) || value.value === true;
  }
  return !(value.type === 'Identifier' && value.name === 'undefined');
}

/** `x.name` or `x['name']` on a plain name, as one string, so the same member compares equal. */
function memberKey(node: Node): string | undefined {
  const member = strip(node);
  const object = member.type === 'MemberExpression' ? strip(member.object) : undefined;
  const name =
    member.type === 'MemberExpression' ? staticKey(member.property, member.computed) : undefined;
  return object?.type === 'Identifier' && name !== undefined ? `${object.name}.${name}` : undefined;
}

/**
 * The tests that are true when a child of `node` runs. A function starts a new list. The true
 * branch of an `if` adds the test of the `if`.
 */
function testsFor(node: Node, child: Node, tests: readonly Node[]): readonly Node[] {
  if (isFunction(node)) {
    return [];
  }
  return node.type === 'IfStatement' && child === node.consequent ? [...tests, node.test] : tests;
}

type Walk = {
  node: Node;
  nested: boolean;
  /** The node is a direct child of an object pattern. Its key names a value that the code reads. */
  read: boolean;
  /**
   * The keys of the properties that enclose the node, the nearest last, with an object literal as
   * each value. A function, a property with another value and a key that is not static start the
   * list again. A spread or a call inside the object does not, so that match can only show a finding.
   */
  keys: readonly string[];
  tests: readonly Node[];
};

/** The keys that enclose a child of `node`: see `Walk`. */
function keysFor(node: Node, keys: readonly string[]): readonly string[] {
  if (node.type !== 'Property') {
    return keys;
  }
  const name = staticKey(node.key, node.computed);
  return name !== undefined && strip(node.value).type === 'ObjectExpression' ? [...keys, name] : [];
}

/** The option paths that a property sets: its key is the last name, and the keys above it end with the other names. */
function pathsSetBy({ node, read, keys }: Walk, known: readonly (readonly string[])[]): string[] {
  if (
    known.length === 0 ||
    node.type !== 'Property' ||
    node.kind !== 'init' ||
    node.method ||
    read
  ) {
    return [];
  }
  const name = staticKey(node.key, node.computed);
  if (name === undefined || !isSetValue(node.value)) {
    return [];
  }
  return known
    .filter(
      path =>
        path.at(-1) === name &&
        path.slice(0, -1).every((key, place, above) => keys.at(place - above.length) === key),
    )
    .map(path => path.join('.'));
}

/** What a node sets: the name of the option, and the value that it gets. */
type Setting = { name: string | undefined; value: Node | undefined };

/**
 * The member that a destructuring pattern writes, as in `({ a: options.http2 } = env)`. It sets the
 * name of the member, to a value that is not known. A plain name, such as `{ http2 }`, sets nothing.
 */
function patternTarget(property: NodeOf<'Property'>): Setting | undefined {
  const target = strip(property.value);
  const member = target.type === 'AssignmentPattern' ? strip(target.left) : target;
  return member.type === 'MemberExpression'
    ? { name: staticKey(member.property, member.computed), value: member }
    : undefined;
}

/** `x.name = value`, unless a test shows that the member is present: see `findAssignedOptions`. */
function memberAssignment(
  node: NodeOf<'AssignmentExpression'>,
  left: NodeOf<'MemberExpression'>,
  tests: readonly Node[],
): Setting {
  const key = memberKey(left);
  const guarded =
    node.operator === '=' &&
    tests.some(test => testsPresent(test, side => memberKey(side) === key));
  return { name: staticKey(left.property, left.computed), value: guarded ? undefined : node.right };
}

function settingOf({ node, nested, read, tests }: Walk): Setting | undefined {
  if (node.type === 'Property' && node.kind === 'init' && !node.method && !nested) {
    return read
      ? patternTarget(node)
      : { name: staticKey(node.key, node.computed), value: node.value };
  }
  if (
    node.type === 'AssignmentExpression' &&
    ['=', '||=', '??='].includes(node.operator) &&
    node.left.type === 'MemberExpression'
  ) {
    return memberAssignment(node, node.left, tests);
  }
  return undefined;
}

/**
 * The names of the options that this file sets, and the paths of `paths` that it sets: a property of an object literal, or a member that
 * is assigned (`x.http2 = true`), whose value is not `false`, `0`, `null`, `undefined` or `''`. A
 * value that is not a literal counts as set, since it can be anything.
 *
 * A name counts only as a direct property, because the guard of an option reads a direct member of a
 * parameter (`options.http2`). A property of an object that is itself the value of a property does
 * not, at any depth, until a function starts: `{ http2: { type: 'boolean' } }` inside the `properties`
 * of a schema is a description, and `other({ server: { http2: true } })` is read as `options.server.http2`,
 * which no guard covers, so its finding stays.
 *
 * A path of `paths`, such as `auth.lock`, is set by a property `lock` in an object literal that is the
 * value of the property `auth`. The match is at the end of the path, so `{ supabase: { auth: { lock } } }`
 * sets it too. A path never sets its plain name, and no nested key is in the result except a path of `paths`.
 *
 * The keys of a destructuring pattern do not count, because the pattern reads those names:
 * `const { http2 } = env`, `function f({ http2 }) {}` and `({ http2 } = env)`, also with a default
 * value (`{ http2 = true }`). The target of a pattern is a write when it is a member:
 * `({ a: options.http2 } = env)` sets `http2`.
 *
 * An assignment in the true branch of a test that shows the member present does not count either:
 * it runs only when something else set the option, as a validator does that coerces a value and
 * writes it back. That other site counts by itself. A test of an absent member (`!x.name`) or a
 * default (`x.name ??= v`) still sets the option.
 */
export function findAssignedOptions(
  body: readonly Node[],
  paths: readonly string[] = [],
): string[] {
  const found = new Set<string>();
  const known = paths.map(path => path.split('.'));
  const pending: Walk[] = body.map(node => ({
    node,
    nested: false,
    read: false,
    keys: [],
    tests: [],
  }));
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const { node, nested, keys, tests } = item;
    const setting = settingOf(item);
    if (setting?.name !== undefined && setting.value !== undefined && isSetValue(setting.value)) {
      found.add(setting.name);
    }
    for (const path of pathsSetBy(item, known)) {
      found.add(path);
    }
    const reset = isFunction(node);
    for (const child of childNodes(node)) {
      pending.push({
        node: child,
        nested: !reset && (nested || node.type === 'Property'),
        read: node.type === 'ObjectPattern',
        keys: reset ? [] : keysFor(node, keys),
        tests: testsFor(node, child, tests),
      });
    }
  }
  return [...found].toSorted();
}
