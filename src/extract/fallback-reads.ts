import type { Node } from 'oxc-parser';

import { isEquality, isInequality, stringLiteral, strip } from './ast.ts';

const isNull = (node: Node): boolean => node.type === 'Literal' && node.value === null;
const isUndefined = (node: Node): boolean =>
  node.type === 'Identifier' && node.name === 'undefined';

/** Whether a test is true when the value holds nothing: `!x`, `x == null`, or `typeof x !== 'function'`. */
function testsMissing(test: Node, isName: (node: Node) => boolean): boolean {
  const inner = strip(test);
  if (inner.type === 'UnaryExpression') {
    return inner.operator === '!' && isName(strip(inner.argument));
  }
  if (inner.type !== 'BinaryExpression') {
    return false;
  }
  const [left, right] = [strip(inner.left), strip(inner.right)];
  if (
    left.type === 'UnaryExpression' &&
    left.operator === 'typeof' &&
    isName(strip(left.argument))
  ) {
    const text = stringLiteral(right);
    return isInequality(inner.operator) ? text === 'function' : text === 'undefined';
  }
  const [other] = isName(left) ? [right] : isName(right) ? [left] : [];
  // `undefined === null` is false, so only a loose comparison with `null` finds a missing member.
  return (
    other !== undefined &&
    isEquality(inner.operator) &&
    (isUndefined(other) || (inner.operator === '==' && isNull(other)))
  );
}

/**
 * Whether a test is true only when the value is there: `x`, `x !== undefined`, `x != null`, or
 * `typeof x !== 'undefined'`, also as one side of `&&`. A test of an absent value says nothing.
 */
export function testsPresent(test: Node, isName: (node: Node) => boolean): boolean {
  const inner = strip(test);
  if (inner.type === 'LogicalExpression') {
    return (
      inner.operator === '&&' &&
      (testsPresent(inner.left, isName) || testsPresent(inner.right, isName))
    );
  }
  if (inner.type !== 'BinaryExpression') {
    return isName(inner);
  }
  const [left, right] = [strip(inner.left), strip(inner.right)];
  if (
    left.type === 'UnaryExpression' &&
    left.operator === 'typeof' &&
    isName(strip(left.argument))
  ) {
    return isInequality(inner.operator) && stringLiteral(right) === 'undefined';
  }
  const [other] = isName(left) ? [right] : isName(right) ? [left] : [];
  return (
    other !== undefined &&
    isInequality(inner.operator) &&
    (isUndefined(other) || (inner.operator === '!=' && isNull(other)))
  );
}

/** Whether a branch sets `name`: `x = fallback;` or a block that holds it. */
function setsName(branch: Node, name: string): boolean {
  const statements = branch.type === 'BlockStatement' ? branch.body : [branch];
  return statements.some(statement => {
    const write =
      statement.type === 'ExpressionStatement' ? strip(statement.expression) : undefined;
    return (
      write?.type === 'AssignmentExpression' &&
      write.operator === '=' &&
      write.left.type === 'Identifier' &&
      write.left.name === name
    );
  });
}

/** The name that `let x = value` or `x = value` sets, when it is the only thing its statement does. */
function assignedName(node: Node, parent: Node, statement: Node | undefined): string | undefined {
  if (parent.type === 'AssignmentExpression') {
    return parent.operator === '=' && parent.right === node && parent.left.type === 'Identifier'
      ? parent.left.name
      : undefined;
  }
  return parent.type === 'VariableDeclarator' &&
    parent.init === node &&
    parent.id.type === 'Identifier' &&
    statement?.type === 'VariableDeclaration' &&
    statement.declarations.length === 1
    ? parent.id.name
    : undefined;
}

/**
 * Whether `node` is the value of `x = obj[key];` or `let x = obj[key];` and the next statement is
 * `if (typeof x !== 'function') x = fallback;`. This is `obj[key] || fallback` in two statements:
 * a missing member gives `undefined` and the fallback replaces it.
 */
export function isFallbackRead(node: Node, parent: Node, outer: readonly Node[]): boolean {
  const [statement, container] = outer;
  const name = assignedName(node, parent, statement);
  const body =
    container?.type === 'BlockStatement' || container?.type === 'Program'
      ? (container.body as readonly Node[])
      : undefined;
  const next = statement === undefined ? undefined : body?.[body.indexOf(statement) + 1];
  return (
    name !== undefined &&
    next?.type === 'IfStatement' &&
    next.alternate === null &&
    testsMissing(next.test, node => node.type === 'Identifier' && node.name === name) &&
    setsName(next.consequent, name)
  );
}
