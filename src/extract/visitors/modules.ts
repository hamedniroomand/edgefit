import type { Node } from 'oxc-parser';

import { builtinName } from '@/data/builtins.ts';
import { staticKey } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import type { VisitContext, Visitor } from '@/extract/context.ts';
import { displayRef, moduleRef } from '@/extract/refs.ts';
import { assign, isTracked, lookup } from '@/extract/scope.ts';
import type { ApiRef } from '@/types.ts';

function namedRef(module: string, name: Node): ApiRef {
  const key = staticKey(name, false) ?? 'default';
  return key === 'default' ? moduleRef(module) : { module, path: [key] };
}

export const visitImport: Visitor<NodeOf<'ImportDeclaration'>> = (node, context) => {
  if (node.importKind === 'type') {
    return;
  }
  const module = builtinName(node.source.value);
  if (module === undefined) {
    for (const specifier of node.specifiers) {
      assign(context.scope, specifier.local.name, null);
    }
    return;
  }
  context.collector.api(moduleRef(module), node.source.start);
  for (const specifier of node.specifiers) {
    if (specifier.type !== 'ImportSpecifier') {
      assign(context.scope, specifier.local.name, { ref: moduleRef(module), recorded: false });
    } else if (specifier.importKind !== 'type') {
      const ref = namedRef(module, specifier.imported);
      const recorded = ref.path.length > 0;
      if (recorded) {
        context.collector.api(ref, specifier.imported.start);
      }
      assign(context.scope, specifier.local.name, { ref, recorded });
    }
  }
};

function exportLocal(local: Node, context: VisitContext): void {
  const binding = local.type === 'Identifier' ? lookup(context.scope, local.name) : undefined;
  if (isTracked(binding)) {
    context.collector.dynamic(
      binding.ref,
      displayRef(binding.ref),
      'exported, so its members may be used elsewhere',
      local.start,
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
      exportLocal(specifier.local, context);
    } else {
      const ref = namedRef(module, specifier.local);
      context.collector.api(ref, specifier.local.start);
      context.collector.dynamic(ref, displayRef(ref), 're-exported', specifier.local.start);
    }
  }
};

export const visitExportAll: Visitor<NodeOf<'ExportAllDeclaration'>> = (node, context) => {
  const module = builtinName(node.source.value);
  if (module !== undefined) {
    const ref = moduleRef(module);
    context.collector.api(ref, node.source.start);
    context.collector.dynamic(ref, displayRef(ref), 're-exported with export *', node.start);
  }
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
