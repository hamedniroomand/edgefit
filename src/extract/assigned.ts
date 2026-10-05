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

type Walk = { node: Node; nested: boolean; tests: readonly Node[] };

/**
 * The names of the options that this file sets: a property of an object literal, or a member that
 * is assigned (`x.http2 = true`), whose value is not `false`, `0`, `null`, `undefined` or `''`. A
 * value that is not a literal counts as set, since it can be anything.
 *
 * Only a direct property counts, because the guard of an option reads a direct member of a
 * parameter (`options.http2`). A property of an object that is itself the value of a property does
 * not, at any depth, until a function starts: `{ http2: { type: 'boolean' } }` inside the `properties`
 * of a schema is a description, and `other({ server: { http2: true } })` is read as `options.server.http2`,
 * which no guard covers, so its finding stays.
 *
 * An assignment in the true branch of a test that shows the member present does not count either:
 * it runs only when something else set the option, as a validator does that coerces a value and
 * writes it back. That other site counts by itself. A test of an absent member (`!x.name`) or a
 * default (`x.name ??= v`) still sets the option.
 */
export function findAssignedOptions(body: readonly Node[]): string[] {
  const found = new Set<string>();
  const pending: Walk[] = body.map(node => ({ node, nested: false, tests: [] }));
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const { node, nested, tests } = item;
    let name: string | undefined;
    let value: Node | undefined;
    if (node.type === 'Property' && node.kind === 'init' && !node.method && !nested) {
      name = staticKey(node.key, node.computed);
      value = node.value;
    } else if (
      node.type === 'AssignmentExpression' &&
      ['=', '||=', '??='].includes(node.operator) &&
      node.left.type === 'MemberExpression'
    ) {
      name = staticKey(node.left.property, node.left.computed);
      const key = memberKey(node.left);
      const guarded =
        node.operator === '=' &&
        tests.some(test => testsPresent(test, side => memberKey(side) === key));
      value = guarded ? undefined : node.right;
    }
    if (name !== undefined && value !== undefined && isSetValue(value)) found.add(name);
    const reset = isFunction(node);
    for (const child of childNodes(node)) {
      pending.push({
        node: child,
        nested: !reset && (nested || node.type === 'Property'),
        tests: reset
          ? []
          : node.type === 'IfStatement' && child === node.consequent
            ? [...tests, node.test]
            : tests,
      });
    }
  }
  return [...found].toSorted();
}
