import type { Node } from 'oxc-parser';

import { childNodes, rootName } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { patternNames } from './declarations.ts';

/** Each value written to a name, or `null` when one write has a value that is not known. */
export type Writes = ReadonlyMap<string, readonly Node[] | null>;

type Add = (name: string, value: Node | null) => void;

const logicalAssignments = new Set(['=', '||=', '&&=', '??=']);

/** A write to a member changes the object that the root name holds. */
function addTarget(target: Node, add: Add): void {
  const root = target.type === 'MemberExpression' ? rootName(target) : undefined;
  for (const name of root === undefined ? patternNames(target) : [root]) {
    add(name, null);
  }
}

function addLoopHead(node: NodeOf<'ForInStatement' | 'ForOfStatement'>, add: Add): void {
  const targets =
    node.left.type === 'VariableDeclaration'
      ? node.left.declarations.map(declarator => declarator.id)
      : [node.left];
  for (const target of targets) {
    addTarget(target, add);
  }
}

const writers: { [TType in Node['type']]?: (node: NodeOf<TType>, add: Add) => void } = {
  AssignmentExpression: (node, add) => {
    if (node.left.type === 'Identifier' && logicalAssignments.has(node.operator)) {
      add(node.left.name, node.right);
    } else {
      addTarget(node.left, add);
    }
  },
  UpdateExpression: (node, add) => {
    addTarget(node.argument, add);
  },
  UnaryExpression: (node, add) => {
    if (node.operator === 'delete') {
      addTarget(node.argument, add);
    }
  },
  VariableDeclarator: (node, add) => {
    if (node.id.type !== 'Identifier') {
      addTarget(node.id, add);
    } else if (node.init !== null) {
      add(node.id.name, node.init);
    }
  },
  ForInStatement: addLoopHead,
  ForOfStatement: addLoopHead,
};

/**
 * Every value written to each name in `nodes`, nested functions included: each `=` and each
 * declaration with a value. A name that a nearer declaration shadows counts too, so the result
 * can only hold more values than the name does.
 * ponytail: a method call that changes an object, such as `list.push(x)`, is not a write.
 */
export function collectWrites(nodes: readonly Node[]): Writes {
  const writes = new Map<string, Node[] | null>();
  const add: Add = (name, value) => {
    const values = writes.get(name);
    if (value === null) {
      writes.set(name, null);
    } else if (values === undefined) {
      writes.set(name, [value]);
    } else {
      values?.push(value);
    }
  };
  // Children go on the stack in reverse, so the values come out in source order.
  const pending = [...nodes].reverse();
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const writer = writers[node.type] as ((node: Node, add: Add) => void) | undefined;
    writer?.(node, add);
    pending.push(...childNodes(node).reverse());
  }
  return writes;
}
