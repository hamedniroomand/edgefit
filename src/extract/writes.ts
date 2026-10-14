import type { Node } from 'oxc-parser';

import { childNodes, rootName, staticKey, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { functionTypes, patternNames } from './declarations.ts';

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

/** Calls that change the object of their first argument, such as `Object.assign(options, more)`. */
const objectWriters: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Object', new Set(['assign', 'defineProperty', 'defineProperties'])],
  ['Reflect', new Set(['deleteProperty', 'set', 'defineProperty'])],
]);

function isObjectWriter(callee: Node): boolean {
  const inner = strip(callee);
  if (inner.type !== 'MemberExpression' || inner.object.type !== 'Identifier') {
    return false;
  }
  const member = staticKey(inner.property, inner.computed);
  return member !== undefined && objectWriters.get(inner.object.name)?.has(member) === true;
}

const writers: { [TType in Node['type']]?: (node: NodeOf<TType>, add: Add) => void } = {
  CallExpression: (node, add) => {
    const [target] = node.arguments;
    const object =
      target === undefined || target.type === 'SpreadElement' ? undefined : strip(target);
    const root = object === undefined ? undefined : rootName(object);
    if (root !== undefined && isObjectWriter(node.callee)) {
      add(root, null);
    }
  },
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
 * Every value written to each name in `nodes`: each `=` and each declaration with a value. A write
 * inside a nested function can run at any time, so it makes the name unknown. A name that a
 * nearer declaration shadows counts too, so the result can only hold more values than the name does.
 * A change of the object that a name holds, such as `o.x = 1`, `delete o.x` or
 * `Object.assign(o, more)`, makes the name unknown. A change through another name for the same
 * object is not seen.
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
  const unknown: Add = name => {
    add(name, null);
  };
  // Children go on the stack in reverse, so the values come out in source order.
  const pending: (readonly [Node, boolean])[] = nodes.map(node => [node, false] as const).reverse();
  for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
    const [node, nested] = entry;
    const writer = writers[node.type] as ((node: Node, add: Add) => void) | undefined;
    writer?.(node, nested ? unknown : add);
    const inner = nested || functionTypes.has(node.type);
    pending.push(
      ...childNodes(node)
        .map(child => [child, inner] as const)
        .reverse(),
    );
  }
  return writes;
}
