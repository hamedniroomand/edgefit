import type { Node } from 'oxc-parser';

import { isFunction } from './ast.ts';

const loops = new Set([
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
]);
const logicalAssignments = new Set(['??=', '||=', '&&=']);

/** Whether `child` runs only sometimes, or later, when `parent` runs. */
function defers(parent: Node, child: Node): boolean {
  if (isFunction(parent) || parent.type === 'TryStatement' || parent.type === 'SwitchCase') {
    return true;
  }
  if (parent.type === 'IfStatement') {
    return child === parent.consequent || child === parent.alternate;
  }
  if (parent.type === 'ConditionalExpression') {
    return child !== parent.test;
  }
  if (parent.type === 'LogicalExpression') {
    return child === parent.right;
  }
  if (parent.type === 'AssignmentExpression') {
    return logicalAssignments.has(parent.operator) && child === parent.right;
  }
  if (parent.type === 'PropertyDefinition' || parent.type === 'AccessorProperty') {
    return !parent.static && child === parent.value;
  }
  return loops.has(parent.type) && 'body' in parent && child === parent.body;
}

/**
 * Whether the code at the top of `stack`, the ancestors of a node from the program down, runs when
 * the module loads: no function, branch, loop, `try` or `switch` case sits around it.
 */
export function runsAtLoad(stack: readonly Node[]): boolean {
  for (let index = stack.length - 1; index > 0; index -= 1) {
    const parent = stack[index - 1];
    const child = stack[index];
    if (parent !== undefined && child !== undefined && defers(parent, child)) {
      return false;
    }
  }
  return true;
}
