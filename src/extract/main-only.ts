import type { Node } from 'oxc-parser';

import { childNodes, isFunction, staticKey, staticString, strip } from './ast.ts';
import { patternNames } from './declarations.ts';
import { declared, isPropertyName } from './local-functions.ts';
import type { LocalFunction } from './local-functions.ts';
import type { UsageCollector } from './usage-collector.ts';

type References = { edges: Map<string, Set<string>>; live: Set<string>; dead: Set<string> };

function namesIn(body: readonly Node[]): Map<Node, string> {
  const names = new Map<Node, string>();
  const counts = new Map<string, number>();
  const pending = [...body];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const declaration = declared(node);
    for (const name of declaration.names) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const [name] = declaration.names;
    if (
      name !== undefined &&
      (node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration')
    ) {
      names.set(node, name);
    }
    pending.push(...childNodes(node));
  }
  for (const [node, name] of names) {
    if (counts.get(name) !== 1) names.delete(node);
  }
  return names;
}

function addReference(
  node: Node,
  parent: Node | undefined,
  owner: string | undefined,
  dead: ReadonlySet<Node>,
  result: References,
): void {
  if (node.type !== 'Identifier' || isPropertyName(node, parent)) return;
  const target = dead.has(node)
    ? result.dead
    : owner === undefined
      ? result.live
      : (result.edges.get(owner) ?? new Set<string>());
  target.add(node.name);
  if (!dead.has(node) && owner !== undefined) result.edges.set(owner, target);
}

function descendants(node: Node): Node[] {
  const found: Node[] = [];
  const pending = [node];
  for (let child = pending.pop(); child !== undefined; child = pending.pop()) {
    found.push(child);
    pending.push(...childNodes(child));
  }
  return found;
}

/** `{ exports: {} }`, the object that a CommonJS helper gives to a factory as `module`. */
function isModuleObject(node: Node): boolean {
  return (
    node.type === 'ObjectExpression' &&
    node.properties.some(
      property =>
        property.type === 'Property' &&
        staticKey(property.key, property.computed) === 'exports' &&
        property.value.type === 'ObjectExpression' &&
        property.value.properties.length === 0,
    )
  );
}

function writesName(node: Node, name: string): boolean {
  const target =
    node.type === 'AssignmentExpression'
      ? node.left
      : node.type === 'UpdateExpression'
        ? node.argument
        : undefined;
  return patternNames(target).includes(name);
}

function setsExports(node: Node, name: string): boolean {
  const left = node.type === 'AssignmentExpression' ? node.left : undefined;
  return (
    left?.type === 'MemberExpression' &&
    left.object.type === 'Identifier' &&
    left.object.name === name &&
    staticKey(left.property, left.computed) === 'exports'
  );
}

/**
 * The `module` parameter of a CommonJS factory, such as one that esbuild's `__commonJS` calls: a
 * function with two parameters, given to a local helper that makes `{ exports: {} }`, that sets
 * `module.exports` and never writes the parameter.
 */
export function factoryModule(
  node: Node,
  parent: Node | undefined,
  functions: ReadonlyMap<string, LocalFunction>,
): string | undefined {
  if (
    !isFunction(node) ||
    parent?.type !== 'CallExpression' ||
    parent.callee.type !== 'Identifier' ||
    node.params.length !== 2
  )
    return undefined;
  const helper = functions.get(parent.callee.name);
  const module = node.params[1];
  if (helper === undefined || module?.type !== 'Identifier') return undefined;
  const inside = descendants(node.body as Node);
  return descendants(helper).some(child => isModuleObject(child)) &&
    inside.some(child => setsExports(child, module.name)) &&
    !inside.some(child => writesName(child, module.name))
    ? module.name
    : undefined;
}

function exportedNames(node: Node): string[] {
  if (node.type !== 'ExportNamedDeclaration' || node.declaration === null) return [];
  return node.declaration.type === 'VariableDeclaration'
    ? node.declaration.declarations.flatMap(declaration => declared(declaration).names)
    : declared(node.declaration).names;
}

function addLiveCalls(
  node: Node,
  deferred: boolean,
  dead: ReadonlySet<Node>,
  functions: ReadonlyMap<string, LocalFunction>,
  names: Map<Node, string>,
  live: Set<string>,
): void {
  if (dead.has(node) || node.type !== 'CallExpression' || node.callee.type !== 'Identifier') return;
  if (node.callee.name === 'eval') {
    for (const local of names.values()) live.add(local);
  }
  if (!deferred && functions.has(node.callee.name)) live.add(node.callee.name);
}

function references(
  body: readonly Node[],
  names: Map<Node, string>,
  dead: ReadonlySet<Node>,
  functions: ReadonlyMap<string, LocalFunction>,
): References {
  const result: References = { edges: new Map(), live: new Set(), dead: new Set() };
  const visit = (node: Node, parent?: Node, owner?: string, deferred = false): void => {
    const name = names.get(node);
    const current = name ?? owner;
    addReference(node, parent, current, dead, result);
    for (const exported of exportedNames(node)) result.live.add(exported);
    addLiveCalls(node, deferred, dead, functions, names, result.live);
    for (const child of childNodes(node)) {
      if (
        (node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration') &&
        child === node.id
      )
        continue;
      visit(
        child,
        node,
        current,
        isFunction(node) ? functions.get(current ?? '') === node : deferred,
      );
    }
  };
  for (const node of body) visit(node);
  return result;
}

function reached(
  roots: Iterable<string>,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const found = new Set<string>();
  const pending = [...roots];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (!found.has(name)) {
      found.add(name);
      pending.push(...(edges.get(name) ?? []));
    }
  }
  return found;
}

export function omitMainFunctions(
  body: readonly Node[],
  functions: ReadonlyMap<string, LocalFunction>,
  deadNodes: ReadonlySet<Node>,
  collector: UsageCollector,
): void {
  if (deadNodes.size === 0) return;
  // ponytail: repeated names stay checked. Use lexical references to resolve them in the future.
  const names = namesIn(body);
  const { edges, live, dead } = references(body, names, deadNodes, functions);
  const cli = reached(dead, edges);
  const active = reached([...live, ...[...names.values()].filter(name => !cli.has(name))], edges);
  const imports = [...names].flatMap(([node, name]) => {
    const init =
      node.type === 'VariableDeclarator' && node.init !== null ? strip(node.init) : undefined;
    return cli.has(name) &&
      !active.has(name) &&
      init?.type === 'CallExpression' &&
      init.callee.type === 'Identifier' &&
      init.callee.name === 'require' &&
      init.arguments.length === 1 &&
      staticString(init.arguments[0]) !== undefined
      ? [node]
      : [];
  });
  const bodies = [...functions].flatMap(([name, fn]) =>
    cli.has(name) && !active.has(name) && fn.body !== null ? [fn.body] : [],
  );
  // ponytail: each usage checks every CLI body. Use sorted intervals for large CLI bundles.
  for (let index = collector.offsets.length - 1; index >= 0; index -= 1) {
    const offset = collector.offsets[index];
    if (
      offset !== undefined &&
      (bodies.some(body => offset >= body.start && offset < body.end) ||
        (collector.usages[index]?.kind === 'api' &&
          imports.some(binding => offset >= binding.start && offset < binding.end)))
    ) {
      collector.offsets.splice(index, 1);
      collector.usages.splice(index, 1);
    }
  }
}
