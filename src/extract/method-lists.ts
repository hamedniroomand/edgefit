import type { Node } from 'oxc-parser';

import { childNodes, staticKey, strip } from './ast.ts';
import type { NodeOf } from './ast.ts';
import { cannotChangeList, iterators, usesArguments } from './key-bindings.ts';
import { settle, valueOf } from './known-values.ts';
import { isPropertyName } from './local-functions.ts';
import type { LocalFunction } from './local-functions.ts';
import type { KnownObject, Scope } from './scope.ts';

/** The list that the one call of a class method passes in each parameter, by index of the parameter. */
export type CallLists = ReadonlyMap<LocalFunction, ReadonlyMap<number, KnownObject>>;

/** The lists, and the name of each method that got one, so another file can be searched for that name. */
export type MethodLists = { lists: CallLists; names: readonly string[] };

/** What the file knows of its own values: its scope, and how many times it declares each name. */
export type ProgramValues = { scope: Scope; counts: ReadonlyMap<string, number> };

/** `owner` is the class body of the call, and `thisOk` is set when `this` there is the instance. */
type Call = { node: NodeOf<'CallExpression'>; owner: Node | undefined; thisOk: boolean };
type Method = {
  fn: NodeOf<'FunctionExpression'> | undefined;
  owner: Node | undefined;
  definitions: number;
  calls: Call[];
};
type Frame = { node: Node; parent: Node | undefined; thisOk: boolean; owner: Node | undefined };

/** Whether no name in an expression is declared more than once in the file, so no inner name hides one of the program. */
export function namesAreUnique(node: Node, counts: ReadonlyMap<string, number>): boolean {
  const pending = [node];
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (item.type === 'Identifier' && (counts.get(item.name) ?? 0) > 1) return false;
    pending.push(...childNodes(item));
  }
  return true;
}

/** The name of a method that a class defines for its instances by a plain name, or `undefined`. */
function methodName(node: NodeOf<'MethodDefinition'>): string | undefined {
  const plain =
    node.kind === 'method' &&
    !node.static &&
    !node.computed &&
    node.value.type === 'FunctionExpression';
  return plain && node.key.type === 'Identifier' ? node.key.name : undefined;
}

/**
 * The frame of a child node. `this` is the instance in a method and in an arrow function inside it.
 * A function and a static block have another `this`. In a field initializer `this` is the instance,
 * but a call there is not read.
 */
function childFrame(child: Node, frame: Frame): Frame {
  const { node: parent } = frame;
  const owner = parent.type === 'ClassBody' ? parent : frame.owner;
  const method = parent.type === 'MethodDefinition' && parent.value === child;
  if (method && child.type === 'FunctionExpression') {
    return { node: child, parent, thisOk: !parent.static, owner };
  }
  const own =
    child.type === 'FunctionExpression' ||
    child.type === 'FunctionDeclaration' ||
    parent.type === 'PropertyDefinition' ||
    parent.type === 'StaticBlock' ||
    parent.type === 'ClassBody';
  return { node: child, parent, thisOk: own ? false : frame.thisOk, owner };
}

type Scan = {
  methods: Map<string, Method>;
  /** The method names that a mention other than a plain call or a definition uses. */
  spoiled: Set<string>;
  /** The member of each call that was counted, so it is not a second mention. */
  consumed: Set<Node>;
  /** Set when `this[name]` may reach any method. */
  spoilAll: boolean;
};

function noteDefinition(
  node: NodeOf<'MethodDefinition'>,
  owner: Node | undefined,
  scan: Scan,
): void {
  const name = staticKey(node.key, node.computed);
  const method = name === undefined ? undefined : scan.methods.get(name);
  if (name === undefined || method === undefined) return;
  if (methodName(node) === name && node.value.type === 'FunctionExpression') {
    method.definitions += 1;
    method.fn = node.value;
    method.owner = owner;
  } else {
    scan.spoiled.add(name);
  }
}

/** A key of an object, a pattern or a field with the name of a method is another mention of it. */
function noteKey(node: NodeOf<'PropertyDefinition' | 'Property'>, scan: Scan): void {
  const name = staticKey(node.key, node.computed);
  if (name !== undefined && scan.methods.has(name)) scan.spoiled.add(name);
}

/** A call `this.name(…)` is counted with its place, and its member is not a second mention. */
function noteCall(node: NodeOf<'CallExpression'>, frame: Frame, scan: Scan): void {
  const callee = strip(node.callee);
  if (node.optional || callee.type !== 'MemberExpression' || callee.optional) return;
  const name =
    callee.object.type === 'ThisExpression'
      ? staticKey(callee.property, callee.computed)
      : undefined;
  if (name === undefined) return;
  scan.methods.get(name)?.calls.push({ node, owner: frame.owner, thisOk: frame.thisOk });
  if (scan.methods.has(name)) scan.consumed.add(callee);
}

function noteMember(node: NodeOf<'MemberExpression'>, scan: Scan): void {
  if (scan.consumed.has(node)) return;
  const name = staticKey(node.property, node.computed);
  if (name !== undefined && scan.methods.has(name)) {
    scan.spoiled.add(name);
  } else if (name === undefined && node.computed && node.object.type === 'ThisExpression') {
    scan.spoilAll = true;
  }
}

function note(frame: Frame, scan: Scan): void {
  const { node, owner } = frame;
  if (node.type === 'MethodDefinition') noteDefinition(node, owner, scan);
  else if (node.type === 'PropertyDefinition' || node.type === 'Property') noteKey(node, scan);
  else if (node.type === 'CallExpression') noteCall(node, frame, scan);
  else if (node.type === 'MemberExpression') noteMember(node, scan);
}

/** The names that a file defines as methods of a class, each with its definitions and its calls. */
function scanMethods(body: readonly Node[]): Map<string, Method> | undefined {
  const names = new Set<string>();
  const first = [...body];
  for (let node = first.pop(); node !== undefined; node = first.pop()) {
    const name = node.type === 'MethodDefinition' ? methodName(node) : undefined;
    if (name !== undefined) names.add(name);
    for (const child of childNodes(node)) first.push(child);
  }
  if (names.size === 0) return undefined;
  const scan: Scan = {
    methods: new Map(
      [...names].map(name => [
        name,
        { fn: undefined, owner: undefined, definitions: 0, calls: [] },
      ]),
    ),
    spoiled: new Set(),
    consumed: new Set(),
    spoilAll: false,
  };
  const pending: Frame[] = body.map(node => ({
    node,
    parent: undefined,
    thisOk: false,
    owner: undefined,
  }));
  for (let frame = pending.pop(); frame !== undefined; frame = pending.pop()) {
    note(frame, scan);
    for (const child of childNodes(frame.node)) pending.push(childFrame(child, frame));
  }
  for (const name of scan.spoiled) scan.methods.delete(name);
  return scan.spoilAll ? undefined : scan.methods;
}

/**
 * Whether the body only walks the list that a parameter holds: `list.forEach(…)`, `list.map(…)` and
 * the other iterators of `iterators`, or `for (const item of list)`. Any other use of the name is
 * not read: it can change the list or give it to other code.
 */
function onlyIterated(body: Node | null | undefined, name: string): boolean {
  const pending: [Node, Node | undefined, Node | undefined][] =
    body === null || body === undefined ? [] : [[body, undefined, undefined]];
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const [node, parent, grand] = item;
    if (node.type === 'Identifier' && node.name === name && !isPropertyName(node, parent)) {
      const iterates =
        parent?.type === 'MemberExpression' &&
        parent.object === node &&
        iterators.has(staticKey(parent.property, parent.computed) ?? '') &&
        grand?.type === 'CallExpression' &&
        strip(grand.callee) === parent &&
        cannotChangeList(grand.arguments[0]);
      const loops = parent?.type === 'ForOfStatement' && parent.right === node;
      if (!iterates && !loops) return false;
    }
    for (const child of childNodes(node)) pending.push([child, node, parent]);
  }
  return true;
}

/**
 * The lists that the one call passes, for each parameter that the method only walks. The argument
 * must be an array that the call writes in place. A name can hold an array that other code changes.
 */
function listsOf(
  fn: NodeOf<'FunctionExpression'>,
  call: NodeOf<'CallExpression'>,
  program: () => ProgramValues,
): Map<number, KnownObject> {
  const lists = new Map<number, KnownObject>();
  for (const [index, param] of fn.params.entries()) {
    const argument = call.arguments[index];
    const spread = call.arguments.slice(0, index + 1).some(item => item.type === 'SpreadElement');
    if (param.type !== 'Identifier' || argument === undefined || spread) continue;
    if (strip(argument).type !== 'ArrayExpression') continue;
    // The values of the file are read only when a call passes an array, which is rare.
    const { scope, counts } = program();
    const value = namesAreUnique(argument, counts) ? valueOf(argument, scope) : undefined;
    if (
      typeof value === 'object' &&
      value.values !== undefined &&
      onlyIterated(fn.body, param.name) &&
      fn.params.every(other => other === param || onlyIterated(other, param.name)) &&
      !usesArguments(fn)
    ) {
      lists.set(index, settle(value));
    }
  }
  return lists;
}

/**
 * The list of strings that a method of a class gets in a parameter, for a method that the file
 * defines once and calls once, as `this.name([…])` from the class. Any other mention of the name in
 * the file, such as a call on another object, a read that is not a call, or a key of an object,
 * leaves the method out. So does a computed `this[…]` anywhere in the file. A name in `shared` is
 * mentioned by another file, which can call the method with another list, so it is left out too.
 */
export function findCallLists(
  body: readonly Node[],
  program: () => ProgramValues,
  shared: ReadonlySet<string> = new Set(),
): MethodLists {
  const lists = new Map<LocalFunction, Map<number, KnownObject>>();
  const names: string[] = [];
  const methods = scanMethods(body);
  let values: ProgramValues | undefined;
  const programValues = (): ProgramValues => (values ??= program());
  for (const [name, { fn, owner, definitions, calls }] of methods ?? []) {
    const [call] = calls;
    if (fn === undefined || definitions !== 1 || calls.length !== 1 || call === undefined) continue;
    if (!call.thisOk || call.owner === undefined || call.owner !== owner || shared.has(name))
      continue;
    const found = listsOf(fn, call.node, programValues);
    if (found.size > 0) {
      lists.set(fn, found);
      names.push(name);
    }
  }
  return { lists, names };
}
