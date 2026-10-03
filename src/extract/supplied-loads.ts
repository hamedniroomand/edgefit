import type { ArrowFunctionExpression, Function as FunctionNode, Node } from 'oxc-parser';

import { childNodes, staticKey, strip } from './ast.ts';
import { patternNames } from './declarations.ts';

export type LocalFunction = FunctionNode | ArrowFunctionExpression;

function isFunction(node: Node): node is LocalFunction {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

/** The values that a name or a `this` member is set to in a function: its declarations, its assignments, and the ones of `this.name`. */
function valuesSetIn(root: LocalFunction, target: Node): Node[] {
  const values: Node[] = [];
  const pending: Node[] = root.body === null ? [] : [root.body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.type === 'VariableDeclarator' && node.init !== null && sameTarget(node.id, target)) {
      values.push(node.init);
    } else if (node.type === 'AssignmentExpression' && sameTarget(node.left, target)) {
      values.push(node.right);
    }
    pending.push(...childNodes(node));
  }
  return values;
}

/** Whether two nodes name the same variable, or the same member of `this`. */
function sameTarget(node: Node, target: Node): boolean {
  if (node.type === 'Identifier' && target.type === 'Identifier') {
    return node.name === target.name;
  }
  return (
    node.type === 'MemberExpression' &&
    target.type === 'MemberExpression' &&
    node.object.type === 'ThisExpression' &&
    target.object.type === 'ThisExpression' &&
    staticKey(node.property, node.computed) === staticKey(target.property, target.computed) &&
    staticKey(node.property, node.computed) !== undefined
  );
}

/** Whether an expression joins a string it spells out with other values: a path prefix, not a module name. */
function joinsLiteral(node: Node): boolean {
  if (node.type === 'TemplateLiteral') {
    return node.quasis.some(quasi => (quasi.value.cooked ?? '') !== '');
  }
  return (
    node.type === 'BinaryExpression' &&
    node.operator === '+' &&
    [node.left, node.right].some(side => strip(side).type === 'Literal')
  );
}

type Chain = { functions: readonly LocalFunction[]; seen: Set<Node> };

/**
 * Whether the value of an expression comes from what the caller gives a function: a parameter, a
 * member or a call result of one, or a name that is set from such a value in the function.
 */
function isSupplied(node: Node, chain: Chain): boolean {
  const inner = strip(node);
  const [outermost] = chain.functions;
  if (outermost === undefined || chain.seen.has(inner) || joinsLiteral(inner)) {
    return false;
  }
  chain.seen.add(inner);
  if (inner.type === 'Identifier') {
    const isParameter = chain.functions.some(fn =>
      fn.params.some(param => patternNames(param).includes(inner.name)),
    );
    return isParameter || valuesSetIn(outermost, inner).some(value => isSupplied(value, chain));
  }
  if (inner.type === 'MemberExpression') {
    const set = inner.object.type === 'ThisExpression' ? valuesSetIn(outermost, inner) : [];
    return isSupplied(inner.object, chain) || set.some(value => isSupplied(value, chain));
  }
  if (inner.type === 'CallExpression') {
    const callee = strip(inner.callee);
    const parts = callee.type === 'MemberExpression' ? [callee.object] : [];
    return [...parts, ...inner.arguments].some(part => isSupplied(part, chain));
  }
  if (inner.type === 'LogicalExpression') {
    return isSupplied(inner.left, chain) || isSupplied(inner.right, chain);
  }
  if (inner.type === 'ConditionalExpression') {
    return isSupplied(inner.consequent, chain) || isSupplied(inner.alternate, chain);
  }
  return false;
}

/** The names that the file calls, or builds with `new`, by a plain name. */
function calledNames(body: readonly Node[]): Set<string> {
  const names = new Set<string>();
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const callee =
      node.type === 'CallExpression' || node.type === 'NewExpression'
        ? strip(node.callee)
        : undefined;
    if (callee?.type === 'Identifier') {
      names.add(callee.name);
    }
    pending.push(...childNodes(node));
  }
  return names;
}

/**
 * The `require(x)` and `import(x)` of a file whose `x` is a parameter of the enclosing function, a
 * property of one, or a value set from one, such as `require(mod)` after `mod = options.engine`.
 * The module is the one that the user of the function names. That holds only when the file does
 * not call the outermost function by its name: then the file names the module itself.
 * `functions` maps the plain names of the file to their functions.
 */
export function findSuppliedLoads(
  body: readonly Node[],
  functions: ReadonlyMap<string, LocalFunction>,
): Set<Node> {
  const found = new Set<Node>();
  const called = calledNames(body);
  const isCalledHere = (fn: LocalFunction): boolean =>
    [...functions].some(([name, other]) => other === fn && called.has(name));
  const visit = (node: Node, functions: readonly LocalFunction[]): void => {
    const scope = isFunction(node) ? [...functions, node] : functions;
    const load =
      node.type === 'CallExpression' &&
      strip(node.callee).type === 'Identifier' &&
      (strip(node.callee) as { name: string }).name === 'require'
        ? node.arguments[0]
        : node.type === 'ImportExpression'
          ? node.source
          : undefined;
    const [outermost] = scope;
    if (
      load !== undefined &&
      outermost !== undefined &&
      !isCalledHere(outermost) &&
      isSupplied(load, { functions: scope, seen: new Set() })
    ) {
      found.add(node);
    }
    for (const child of childNodes(node)) {
      visit(child, scope);
    }
  };
  for (const node of body) {
    visit(node, []);
  }
  return found;
}
