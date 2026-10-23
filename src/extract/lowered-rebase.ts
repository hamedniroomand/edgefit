import type { Node } from 'oxc-parser';

import { chainTemps } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { isTemp, parens, tempOf } from './lowered-tests.ts';
import type { Temp } from './lowered-tests.ts';

/** The object `W` of the member `V = W.y`, also when `V` is the chain of an inner form. */
function objectOf(value: Node): Node | undefined {
  let inner = parens(value);
  if (inner.type === 'ChainExpression') {
    inner = parens(inner.expression);
  }
  return inner.type === 'MemberExpression' ? parens(inner.object) : undefined;
}

/**
 * Whether `thisArg` of `t.call(thisArg, …)`, which a compiler writes for `V?.()`, is the object
 * of `V`: the temp `u` of `(u = W).y`, or the same name. The temp is marked, so it passes its
 * value on.
 */
function isObjectOf(thisArg: Node | undefined, value: Node): boolean {
  const object = objectOf(value);
  const name = thisArg === undefined ? undefined : parens(thisArg);
  if (object === undefined || name?.type !== 'Identifier') {
    return false;
  }
  const temp = tempOf(object);
  if (temp?.assignment !== undefined && temp.name === name.name) {
    chainTemps.add(temp.assignment);
    return true;
  }
  return object.type === 'Identifier' && object.name === name.name;
}

/** Whether `callee` is `t.call`, with `t` the temp of the form. */
function isCallOf(callee: Node, temp: Temp): boolean {
  const inner = parens(callee);
  return (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.type === 'Identifier' &&
    inner.property.name === 'call' &&
    isTemp(inner.object, temp)
  );
}

/**
 * Makes `use` a chain on `(t = V)`: `t.y.z` gives `(t = V)?.y.z`, and `t.call(o, x)` gives
 * `(t = V)?.(x)` when `o` is the object of `V`. Returns whether it did: nothing changes when `use`
 * does not start with `t`.
 */
export function rebase(use: Node, temp: Temp): boolean {
  const inner = parens(use);
  if (inner.type === 'MemberExpression') {
    const object = parens(inner.object);
    if (
      object.type === 'AssignmentExpression' &&
      object.operator === '=' &&
      object.left.type === 'Identifier'
    ) {
      // `(u = t.y).z`: `u` is the receiver of a later `.call(u)`, so it passes its value on.
      const found = rebase(object.right, temp);
      if (found) chainTemps.add(object);
      return found;
    }
    if (!isTemp(inner.object, temp)) {
      return rebase(inner.object, temp);
    }
    inner.object = temp.node as typeof inner.object;
  } else if (inner.type === 'CallExpression') {
    const [thisArg, ...rest] = inner.arguments;
    if (
      temp.assignment === undefined ||
      !isCallOf(inner.callee, temp) ||
      !isObjectOf(thisArg, temp.assignment.right)
    ) {
      return rebase(inner.callee, temp);
    }
    inner.callee = temp.node as typeof inner.callee;
    inner.arguments = rest;
  } else {
    return false;
  }
  inner.optional = true;
  if (temp.assignment !== undefined) {
    chainTemps.add(temp.assignment);
  }
  return true;
}

export function chainOf(use: Node, replaced: Node): Node {
  const expression = use as NodeOf<'ChainExpression'>['expression'];
  return { type: 'ChainExpression', expression, start: replaced.start, end: replaced.end };
}
