import type { Node } from 'oxc-parser';

import { staticKey, staticString, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { fileMembers, wholeExport } from '@/extract/bindings.ts';
import type { VisitContext } from '@/extract/context.ts';
import { displayRef, isGlobalRoot, memberRef, moduleRef } from '@/extract/refs.ts';
import { assign } from '@/extract/scope.ts';
import { destructuredLoad, requireOf } from '@/trace/dynamic-imports.ts';
import type { ApiRef } from '@/types.ts';

type DestructuredProperty = NodeOf<'ObjectPattern'>['properties'][number];

export function bindTarget(
  target: Node,
  ref: ApiRef,
  context: VisitContext,
  recorded = true,
): void {
  let binding = target;
  if (binding.type === 'AssignmentPattern') {
    context.visit(binding.right);
    binding = binding.left;
  }
  if (binding.type === 'Identifier') {
    assign(context.scope, binding.name, { ref, recorded });
  } else if (binding.type === 'ObjectPattern') {
    bindDestructured(binding, ref, context);
  } else {
    context.visitPattern(binding);
  }
}

function bindProperty(property: DestructuredProperty, ref: ApiRef, context: VisitContext): void {
  if (property.type === 'RestElement') {
    context.collector.dynamic(
      ref,
      displayRef(ref),
      'collected with a rest element',
      property.start,
    );
    context.visitPattern(property.argument);
    return;
  }
  const key = staticKey(property.key, property.computed);
  if (key === undefined) {
    context.visit(property.key);
    context.collector.dynamic(
      ref,
      `${displayRef(ref)}[<expression>]`,
      'destructured with a computed key',
      property.key.start,
    );
    context.visitPattern(property.value);
    return;
  }
  const member = memberRef(ref, key);
  // `const { process } = globalThis` only reads a property that may not exist, and code that does
  // this usually checks the value before it uses it. What counts is where the name is used.
  const recorded = !isGlobalRoot(ref);
  if (recorded) {
    context.collector.api(member, property.key.start);
  }
  bindTarget(property.value, member, context, recorded);
}

/** `const { promises: { watch } } = fs` binds `watch` to `fs.promises.watch`. */
export function bindDestructured(
  pattern: NodeOf<'ObjectPattern'>,
  ref: ApiRef,
  context: VisitContext,
): void {
  for (const property of pattern.properties) {
    bindProperty(property, ref, context);
  }
}

/** `const { crypto } = await import('./file')`, or `({ crypto } = await import('./file'))`, binds the names that another file exports as a Node.js module. */
export function bindLoadedNames(node: Node, context: VisitContext): void {
  for (const kind of ['import', 'require'] as const) {
    const found = destructuredLoad(node, kind);
    for (const [local, name] of found?.names ?? []) {
      const alias = context.collector.importedModules.get(`${found?.specifier ?? ''}\0${name}`);
      if (alias !== undefined) {
        assign(context.scope, local, { ref: alias, recorded: false });
      }
    }
  }
}

/** The file that `init` loads by its literal specifier, with `require()` or `import()`, as written. */
function loadedSpecifier(init: Node | null): string | undefined {
  const inner = init === null ? undefined : strip(init);
  if (inner === undefined) {
    return undefined;
  }
  return inner.type === 'ImportExpression'
    ? staticString(inner.source)
    : requireOf(inner)?.specifier;
}

/**
 * `const files = require('./file')` binds `files` to the whole file, when the graph knows what the
 * file exports as Node.js modules, so that `files.crypto.randomBytes` is a use of `crypto`.
 */
export function bindFileNamespace(
  node: NodeOf<'VariableDeclarator'>,
  context: VisitContext,
): boolean {
  const { id, init } = node;
  const specifier = loadedSpecifier(init);
  const members =
    specifier === undefined ? undefined : fileMembers(context.collector.importedModules, specifier);
  if (id.type !== 'Identifier' || members === undefined) {
    return false;
  }
  context.visit(init);
  assign(context.scope, id.name, { ref: moduleRef('*file*'), recorded: false, members });
  return true;
}

/**
 * `const fs = require('./file')`, or `const { readFile } = require('./file')`, where the file sets
 * `module.exports` to a Node.js module: the name, or each destructured name, is that module.
 */
export function bindWholeExport(
  node: NodeOf<'VariableDeclarator'>,
  context: VisitContext,
): boolean {
  const { id, init } = node;
  const load = init === null ? undefined : requireOf(init);
  const alias =
    load === undefined || strip(init as Node) !== load.node
      ? undefined
      : context.collector.importedModules.get(`${load.specifier}\0${wholeExport}`);
  if (alias === undefined || (id.type !== 'Identifier' && id.type !== 'ObjectPattern')) {
    return false;
  }
  context.visit(init);
  bindTarget(id, alias, context, false);
  return true;
}
