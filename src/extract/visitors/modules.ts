import type { Node } from 'oxc-parser';

import { builtinName } from '@/data/builtins.ts';
import { staticKey } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { fileMembers } from '@/extract/bindings.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { displayRef, isGlobalRoot, moduleRef } from '@/extract/refs.ts';
import { assign, isTracked, lookup } from '@/extract/scope.ts';
import type { Binding } from '@/extract/scope.ts';
import type { ApiRef } from '@/types.ts';

// What Vercel's Edge runtime accepts as a WebAssembly module: a `.wasm` file, with or without `?module`.
const wasmSource = /\.wasm(?:\?module)?$/u;

function namedRef(module: string, name: Node): ApiRef {
  const key = staticKey(name, false) ?? 'default';
  return key === 'default' ? moduleRef(module) : { module, path: [key] };
}

export const visitImport: Visitor<NodeOf<'ImportDeclaration'>> = (node, context) => {
  const used = node.specifiers.filter(
    specifier => !context.typeOnlyImports.has(specifier.local.name),
  );
  if (node.importKind === 'type' || (node.specifiers.length > 0 && used.length === 0)) {
    return;
  }
  context.collector.native(node.source.value, node.source.start);
  const module = builtinName(node.source.value);
  if (module === undefined) {
    const isWasm = wasmSource.test(node.source.value);
    for (const specifier of used) {
      const alias = context.collector.importedModules.get(specifier.local.name);
      const members =
        specifier.type === 'ImportNamespaceSpecifier'
          ? fileMembers(context.collector.importedModules, node.source.value)
          : undefined;
      let binding: Binding = alias === undefined ? null : { ref: alias, recorded: false };
      if (members !== undefined) {
        binding = { ref: moduleRef('*file*'), recorded: false, members };
      }
      assign(context.scope, specifier.local.name, binding);
      if (isWasm && specifier.type !== 'ImportSpecifier') {
        context.scope.wasmImports.add(specifier.local.name);
      }
    }
    return;
  }
  context.collector.api(moduleRef(module), node.source.start);
  for (const specifier of used) {
    if (specifier.type !== 'ImportSpecifier') {
      assign(context.scope, specifier.local.name, { ref: moduleRef(module), recorded: false });
    } else if (specifier.importKind !== 'type') {
      const ref = namedRef(module, specifier.imported);
      // Named imports are read where they are used when the platform stubs out the module.
      const recorded = ref.path.length > 0 && !context.collector.lazyNodeImports;
      if (recorded) {
        context.collector.api(ref, specifier.imported.start);
      }
      assign(context.scope, specifier.local.name, { ref, recorded });
    }
  }
};

export function exportLocal(local: Node, exported: string, context: VisitContext): void {
  const binding = local.type === 'Identifier' ? lookup(context.scope, local.name) : undefined;
  // The global object says nothing about which API is used, wherever it goes.
  if (isTracked(binding) && !isGlobalRoot(binding.ref)) {
    context.collector.aliases.set(exported, { ref: binding.ref, offset: local.start });
    context.collector.dynamic(
      binding.ref,
      displayRef(binding.ref),
      'exported, so its members may be used elsewhere',
      local.start,
      true,
    );
  }
}

export const visitExportNamed: Visitor<NodeOf<'ExportNamedDeclaration'>> = (node, context) => {
  if (node.exportKind === 'type') {
    return;
  }
  if (node.declaration !== null) {
    context.visit(node.declaration);
    return;
  }
  const module = node.source === null ? undefined : builtinName(node.source.value);
  if (node.source !== null && module === undefined) {
    return;
  }
  for (const specifier of node.specifiers) {
    if (specifier.exportKind === 'type') {
      continue;
    }
    if (module === undefined) {
      exportLocal(specifier.local, staticKey(specifier.exported, false) ?? 'default', context);
    } else {
      const ref = namedRef(module, specifier.local);
      const exported = staticKey(specifier.exported, false) ?? 'default';
      context.collector.aliases.set(exported, { ref, offset: specifier.local.start });
      context.collector.api(ref, specifier.local.start);
      context.collector.dynamic(ref, displayRef(ref), 're-exported', specifier.local.start, true);
    }
  }
};

/** `export default name` of a module is an export of that module. */
/** The name that `exports.name = …` or `module.exports.name = …` sets, if `node` is that member. */
export function commonJsExportName(node: Node): string | undefined {
  if (node.type !== 'MemberExpression') {
    return undefined;
  }
  const { object } = node;
  const isExports = object.type === 'Identifier' && object.name === 'exports';
  const isModuleExports =
    object.type === 'MemberExpression' &&
    object.object.type === 'Identifier' &&
    object.object.name === 'module' &&
    staticKey(object.property, object.computed) === 'exports';
  return isExports || isModuleExports ? staticKey(node.property, node.computed) : undefined;
}

/** Whether `node` is `module.exports` itself, which `module.exports = value` replaces. */
export function isWholeExports(node: Node): boolean {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'module' &&
    staticKey(node.property, node.computed) === 'exports'
  );
}

export const visitExportDefault: Visitor<NodeOf<'ExportDefaultDeclaration'>> = (node, context) => {
  if (node.declaration.type === 'Identifier') {
    const binding = lookup(context.scope, node.declaration.name);
    if (isTracked(binding) && binding.ref.module !== '*globals*') {
      exportLocal(node.declaration, 'default', context);
      return;
    }
  }
  context.visitChildren(node);
};

export const visitExportAll: Visitor<NodeOf<'ExportAllDeclaration'>> = (node, context) => {
  const module = builtinName(node.source.value);
  if (module === undefined) {
    return;
  }
  const ref = moduleRef(module);
  const exported = node.exported === null ? undefined : staticKey(node.exported, false);
  if (exported !== undefined) {
    context.collector.aliases.set(exported, { ref, offset: node.start });
  }
  context.collector.api(ref, node.source.start);
  context.collector.dynamic(
    ref,
    displayRef(ref),
    're-exported with export *',
    node.start,
    exported !== undefined,
  );
};

/** TypeScript's `import fs = require('fs')`. */
export const visitImportEquals: Visitor<NodeOf<'TSImportEqualsDeclaration'>> = (node, context) => {
  if (node.moduleReference.type !== 'TSExternalModuleReference') {
    return;
  }
  const { expression } = node.moduleReference;
  const module = builtinName(expression.value);
  if (module !== undefined) {
    assign(context.scope, node.id.name, { ref: moduleRef(module), recorded: false });
    context.collector.api(moduleRef(module), expression.start);
  }
};
