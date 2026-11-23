import type { Node } from 'oxc-parser';

import { childNodes, staticKey } from './ast.ts';
import type { FunctionNode } from './ast.ts';
import type { Check, Scope } from './scope.ts';

const patchers = new Set(['assign', 'defineProperty', 'defineProperties']);

/**
 * The members of `name` that the code writes, as in `Monitor.isAvailable = () => true`, or
 * `undefined` when a write can change any of them: `Monitor = Other`, `Object.assign(Monitor, …)`
 * or `Object.defineProperty(Monitor, …)`.
 */
function memberWrites(nodes: readonly Node[], name: string): Set<string> | undefined {
  const keys = new Set<string>();
  const found = { any: false };
  const visit = (node: Node): void => {
    // `Monitor = Other` replaces the whole class.
    found.any ||=
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier' &&
      node.left.name === name;
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      node.left.object.type === 'Identifier' &&
      node.left.object.name === name
    ) {
      const key = staticKey(node.left.property, node.left.computed);
      found.any ||= key === undefined;
      if (key !== undefined) {
        keys.add(key);
      }
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const object = node.callee.object;
      const method = staticKey(node.callee.property, node.callee.computed);
      const [target] = node.arguments;
      found.any ||=
        object.type === 'Identifier' &&
        object.name === 'Object' &&
        method !== undefined &&
        patchers.has(method) &&
        target?.type === 'Identifier' &&
        target.name === name;
    }
    for (const child of childNodes(node)) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return found.any ? undefined : keys;
}

/**
 * Whether the file exports `name`, which another file can then patch: `export { name }`,
 * `export default name`, `module.exports = name` or `exports.x = name`.
 */
function exportsName(statements: readonly Node[], name: string): boolean {
  const isName = (node: Node | null | undefined): boolean =>
    node?.type === 'Identifier' && node.name === name;
  const visit = (node: Node): boolean => {
    if (node.type === 'ExportNamedDeclaration' && node.source === null) {
      return node.specifiers.some(specifier => isName(specifier.local));
    }
    if (node.type === 'ExportDefaultDeclaration') {
      return isName(node.declaration);
    }
    if (node.type === 'AssignmentExpression' && isName(node.right)) {
      const target = node.left;
      return (
        target.type === 'MemberExpression' &&
        ((target.object.type === 'Identifier' &&
          (target.object.name === 'exports' || target.object.name === 'module')) ||
          (target.object.type === 'MemberExpression' &&
            target.object.object.type === 'Identifier' &&
            target.object.object.name === 'module'))
      );
    }
    return childNodes(node).some(child => visit(child));
  };
  return statements.some(statement => visit(statement));
}

/** Whether `node` reads `this` or `super`, which a check read in the file's scope cannot follow. */
function readsThis(node: Node): boolean {
  return (
    node.type === 'ThisExpression' ||
    node.type === 'Super' ||
    childNodes(node).some(child => readsThis(child))
  );
}

/**
 * The checks that the static methods of a local class hold, as `Monitor.isAvailable`, when the
 * method has no parameters and the file does not set it again.
 */
export function staticChecks(
  node: Node,
  exported: boolean,
  statements: readonly Node[],
  scope: Scope,
  helperCheck: (fn: FunctionNode, scope: Scope) => Check | undefined,
): void {
  if (
    node.type !== 'ClassDeclaration' ||
    node.id === null ||
    exported ||
    exportsName(statements, node.id.name)
  ) {
    return;
  }
  const name = node.id.name;
  const written = memberWrites(statements, name);
  if (written === undefined) {
    return;
  }
  for (const member of node.body.body) {
    const key =
      member.type === 'MethodDefinition' && member.static && member.kind === 'method'
        ? staticKey(member.key, member.computed)
        : undefined;
    if (
      key === undefined ||
      member.type !== 'MethodDefinition' ||
      written.has(key) ||
      readsThis(member.value)
    ) {
      continue;
    }
    const check = helperCheck(member.value, scope);
    if (check !== undefined) {
      scope.checks.set(`${name}.${key}`, check);
    }
  }
}
