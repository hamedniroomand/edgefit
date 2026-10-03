import type { Node } from 'oxc-parser';

import { childNodes, staticKey, strip } from './ast.ts';

export type Loader = { specifier: string; caught: boolean };

/** What a function that only returns `require('literal')` loads, and the call inside it. */
export type RequireWrapperOf = (
  fn: Node,
) => { call: Node; specifier: string; caught: boolean } | undefined;

export type LoaderObjects = {
  /** The modules that each call such as `loaders[name]()` may load. */
  calls: Map<Node, Loader[]>;
  /** The `require('literal')` inside each loader. The calls stand for it. */
  requires: Set<Node>;
};

type FoundLoader = { call: Node; specifier: string; caught: boolean };

type Found = {
  /** The loaders of each object, by key, and the name in its declaration. */
  objects: Map<string, { id: Node; loaders: Map<string, FoundLoader> }>;
  references: Map<string, Node[]>;
  calls: { name: string; object: Node; key: string | undefined; node: Node }[];
};

/** The loader that each property of an object literal holds, when every property is one: `{ a: () => require('x') }`. */
function loadersOf(
  object: Node,
  wrapperOf: RequireWrapperOf,
): Map<string, FoundLoader> | undefined {
  if (object.type !== 'ObjectExpression' || object.properties.length === 0) {
    return undefined;
  }
  const loaders = new Map<string, FoundLoader>();
  for (const property of object.properties) {
    if (property.type !== 'Property') {
      return undefined;
    }
    const key = staticKey(property.key, property.computed);
    // `__proto__: null` only makes the object have no prototype.
    if (key === '__proto__' && property.value.type === 'Literal' && property.value.value === null) {
      continue;
    }
    const loader = key === undefined ? undefined : wrapperOf(property.value);
    if (key === undefined || loader === undefined) {
      return undefined;
    }
    loaders.set(key, loader);
  }
  return loaders.size > 0 ? loaders : undefined;
}

function collect(body: readonly Node[], wrapperOf: RequireWrapperOf): Found {
  const found: Found = { objects: new Map(), references: new Map(), calls: [] };
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init !== null) {
      const loaders = loadersOf(strip(node.init), wrapperOf);
      if (loaders !== undefined) {
        found.objects.set(node.id.name, { id: node.id, loaders });
      }
    }
    if (node.type === 'Identifier') {
      found.references.set(node.name, [...(found.references.get(node.name) ?? []), node]);
    }
    const callee = node.type === 'CallExpression' ? strip(node.callee) : undefined;
    if (node.type === 'CallExpression' && callee?.type === 'MemberExpression') {
      const object = callee.object;
      if (object.type === 'Identifier' && node.arguments.length === 0) {
        found.calls.push({
          name: object.name,
          object,
          key: staticKey(callee.property, callee.computed),
          node,
        });
      }
    }
    pending.push(...childNodes(node));
  }
  return found;
}

/**
 * The objects of a file that hold only functions that return `require('literal')`, such as
 * `const loaders = { 'node:zlib': () => require('node:zlib') }`, when every use of the object is a
 * call of one of them: `loaders[name]()` or `loaders.zlib()`. A call with a key that is not a known
 * string may load any of them, so each call stands for the `require()` of every module it may load.
 * An object that is passed on, read some other way, or called with a key that it lacks is left out.
 */
export function findLoaderObjects(
  body: readonly Node[],
  wrapperOf: RequireWrapperOf,
): LoaderObjects {
  const { objects, references, calls } = collect(body, wrapperOf);
  const result: LoaderObjects = { calls: new Map(), requires: new Set() };
  for (const [name, { id, loaders }] of objects) {
    const mine = calls.filter(call => call.name === name);
    const accounted = new Set<Node>([id, ...mine.map(call => call.object)]);
    const loose = (references.get(name) ?? []).some(reference => !accounted.has(reference));
    const missing = mine.some(call => call.key !== undefined && !loaders.has(call.key));
    if (loose || missing || mine.length === 0) {
      continue;
    }
    for (const { call } of loaders.values()) {
      result.requires.add(call);
    }
    for (const { key, node } of mine) {
      const used = key === undefined ? [...loaders.values()] : [loaders.get(key)];
      result.calls.set(
        node,
        used.flatMap(loader =>
          loader === undefined ? [] : [{ specifier: loader.specifier, caught: loader.caught }],
        ),
      );
    }
  }
  return result;
}
