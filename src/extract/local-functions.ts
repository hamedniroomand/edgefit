import type { ArrowFunctionExpression, Function as FunctionNode, Node } from 'oxc-parser';

import { childNodes, staticKey, strip, unwrap } from './ast.ts';
import { patternNames } from './declarations.ts';

export type LocalFunction = FunctionNode | ArrowFunctionExpression;

/** A member read on a parameter. `key` is the first key for an object parameter, `undefined` when it is not a string. */
export type ParameterRead = { key: string | undefined; path: string[]; offset: number };

function isFunction(node: Node): node is LocalFunction {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

/** The names that a node declares, and the function it declares when it has one. */
export function declared(node: Node): { names: string[]; fn?: LocalFunction } {
  if (node.type === 'FunctionDeclaration') {
    return { names: node.id === null ? [] : [node.id.name], fn: node };
  }
  if (node.type === 'VariableDeclarator') {
    const init = node.init === null ? undefined : strip(node.init);
    const names = patternNames(node.id);
    return init !== undefined && isFunction(init) && node.id.type === 'Identifier'
      ? { names, fn: init }
      : { names };
  }
  if (isFunction(node)) {
    return { names: node.params.flatMap(param => patternNames(param)) };
  }
  if (node.type === 'AssignmentExpression') {
    // A name that the file sets again is not one function.
    return { names: patternNames(node.left) };
  }
  if (node.type === 'ClassDeclaration' || node.type === 'CatchClause') {
    return { names: patternNames(node.type === 'CatchClause' ? node.param : node.id) };
  }
  return { names: [] };
}

/**
 * The functions of a file that a plain name stands for: `function f() {}` or `const f = () => {}`.
 * A name that anything else in the file declares, as a parameter or a variable, is left out.
 */
export function findLocalFunctions(body: readonly Node[]): Map<string, LocalFunction> {
  const counts = new Map<string, number>();
  const functions = new Map<string, LocalFunction>();
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const { names, fn } = declared(node);
    for (const name of names) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const [name] = names;
    if (fn !== undefined && name !== undefined) {
      functions.set(name, fn);
    }
    pending.push(...childNodes(node));
  }
  for (const [name, count] of counts) {
    if (count > 1) {
      functions.delete(name);
    }
  }
  return functions;
}

/** The static key of a member, or `undefined` when it is a name that is not known. */
function keyOf(member: Node): string | undefined {
  return member.type === 'MemberExpression'
    ? staticKey(member.property, member.computed)
    : undefined;
}

/** Whether `node` is the name of a member or of an object property, which no variable holds. */
export function isPropertyName(node: Node, parent: Node | undefined): boolean {
  return (
    (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
    (parent?.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand)
  );
}

/** Whether a member is set, deleted or updated. */
function isWritten(node: Node, parent: Node | undefined): boolean {
  return (
    (parent?.type === 'AssignmentExpression' && parent.left === node) ||
    (parent?.type === 'UpdateExpression' && parent.argument === node) ||
    (parent?.type === 'UnaryExpression' && parent.operator === 'delete')
  );
}

/** The read that starts at an identifier, or `undefined` when the name is used another way. */
function readFrom(
  identifier: Node,
  ancestors: readonly Node[],
  keyed: boolean,
): ParameterRead | undefined {
  const keys: string[] = [];
  let first: string | undefined;
  let offset = 0;
  let current = identifier;
  let parent: Node | undefined;
  for (let position = ancestors.length - 1; position >= 0; position -= 1) {
    parent = ancestors[position];
    if (parent !== undefined && unwrap(parent) === current) {
      current = parent;
    } else if (parent?.type === 'MemberExpression' && parent.object === current) {
      const key = keyOf(parent);
      if (keyed && keys.length === 0) {
        first = key;
      } else if (key === undefined) {
        return undefined;
      }
      keys.push(key ?? '');
      offset = parent.property.start;
      current = parent;
    } else {
      break;
    }
    parent = undefined;
  }
  const reads = keys.length > (keyed ? 1 : 0);
  return reads && !isWritten(current, parent)
    ? { key: first, path: keyed ? keys.slice(1) : keys, offset }
    : undefined;
}

/**
 * The member reads that a function makes on one of its parameters, when every use of the
 * parameter is such a read: `param.a.b`. For an object parameter (`keyed`), a read is `param[key].a`
 * or `param.key.a`. A parameter that is stored, passed on, returned, set, or read with a computed key
 * that is not a string gives `undefined`.
 */
export function parameterReads(
  fn: LocalFunction,
  index: number,
  keyed: boolean,
): ParameterRead[] | undefined {
  const param = fn.params[index];
  if (param?.type !== 'Identifier' || fn.body === null) {
    return undefined;
  }
  const reads: ParameterRead[] = [];
  const visit = (node: Node, ancestors: Node[]): boolean => {
    const shadows = node !== fn && declared(node).names.includes(param.name);
    const isReference =
      node.type === 'Identifier' &&
      node.name === param.name &&
      !isPropertyName(node, ancestors.at(-1));
    if (shadows) {
      return false;
    }
    if (isReference) {
      const read = readFrom(node, ancestors, keyed);
      if (read === undefined) {
        return false;
      }
      reads.push(read);
      return true;
    }
    return childNodes(node).every(child => visit(child, [...ancestors, node]));
  };
  return visit(fn.body, []) ? reads : undefined;
}
