import type { Node } from 'oxc-parser';

import { isFunction, isTypeOnly, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { patternNames } from '@/extract/declarations.ts';

import { ShapeBuilder, isLazyClass, rootNames } from './builder.ts';
import type { ModuleShape } from './builder.ts';
import { collectCommonJsShape } from './cjs.ts';
import { loadsOf } from './dynamic-imports.ts';

export type { ExportSource, ModuleShape, Unit } from './builder.ts';

// Names that make a module read its own exports or run code from text, so nothing is known about it.
const opaqueNames = new Set(['module', 'exports', 'eval']);

const exportedDefault = '*default*';

function moduleName(node: Node): string {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'Literal' ? String(node.value) : '';
}

function addImport(
  builder: ShapeBuilder,
  node: NodeOf<'ImportDeclaration'>,
  typeOnly: ReadonlySet<string>,
): void {
  const used = node.specifiers.filter(item => !typeOnly.has(item.local.name));
  if (node.importKind === 'type' || (node.specifiers.length > 0 && used.length === 0)) {
    return;
  }
  const specifier = node.source.value;
  builder.importFrom(specifier);
  // The module itself is used wherever it is imported; only the names it takes can be unused.
  builder.bare(node.source);
  for (const item of used) {
    if (item.type === 'ImportSpecifier' && item.importKind === 'type') {
      continue;
    }
    let imported = '*';
    if (item.type === 'ImportDefaultSpecifier') {
      imported = 'default';
    } else if (item.type === 'ImportSpecifier') {
      imported = moduleName(item.imported);
    }
    builder.unit(item, item.local.name, new Set());
    builder.shape.imports.set(item.local.name, { specifier, imported });
    if (item.type === 'ImportNamespaceSpecifier') {
      // Only the members that are read from `import * as ns` are asked of the module.
      builder.shape.bindings.add(item.local.name);
    }
  }
}

function addDeclaration(builder: ShapeBuilder, node: Node, exported: boolean): void {
  if (isTypeOnly(node)) {
    return;
  }
  if (node.type === 'VariableDeclaration') {
    for (const declarator of node.declarations) {
      const names = patternNames(declarator.id);
      const lazy =
        declarator.id.type === 'Identifier' &&
        declarator.init !== null &&
        isFunction(strip(declarator.init));
      builder.unit(declarator, lazy ? names[0] : undefined);
      for (const name of exported ? names : []) {
        builder.export(name, { local: name });
      }
    }
    return;
  }
  const name = 'id' in node && node.id?.type === 'Identifier' ? node.id.name : undefined;
  const lazy =
    node.type === 'FunctionDeclaration' || (node.type === 'ClassDeclaration' && isLazyClass(node));
  builder.unit(node, lazy ? name : undefined);
  if (exported && name !== undefined) {
    builder.export(name, { local: name });
  }
}

function addDefault(builder: ShapeBuilder, node: NodeOf<'ExportDefaultDeclaration'>): void {
  const { declaration } = node;
  const lazy =
    declaration.type === 'FunctionDeclaration' ||
    (declaration.type === 'ClassDeclaration' && isLazyClass(declaration));
  const name =
    'id' in declaration && declaration.id?.type === 'Identifier' ? declaration.id.name : undefined;
  builder.unit(declaration, lazy ? (name ?? exportedDefault) : undefined);
  builder.export('default', { local: name ?? exportedDefault });
}

function addExportNamed(builder: ShapeBuilder, node: NodeOf<'ExportNamedDeclaration'>): void {
  if (node.exportKind === 'type') {
    return;
  }
  if (node.declaration !== null) {
    addDeclaration(builder, node.declaration, true);
    return;
  }
  const from = node.source?.value;
  if (from !== undefined) {
    builder.importFrom(from);
  }
  builder.bare(node);
  for (const item of node.specifiers) {
    if (item.exportKind === 'type') {
      continue;
    }
    const local = moduleName(item.local);
    builder.export(
      moduleName(item.exported),
      from === undefined ? { local } : { specifier: from, imported: local },
    );
  }
}

function addExportAll(builder: ShapeBuilder, node: NodeOf<'ExportAllDeclaration'>): void {
  builder.importFrom(node.source.value);
  builder.bare(node);
  if (node.exported === null) {
    builder.shape.stars.push(node.source.value);
  } else {
    builder.export(moduleName(node.exported), { specifier: node.source.value, imported: '*' });
  }
}

function addStatement(builder: ShapeBuilder, node: Node, typeOnly: ReadonlySet<string>): void {
  if (node.type === 'ImportDeclaration') {
    addImport(builder, node, typeOnly);
  } else if (node.type === 'ExportNamedDeclaration') {
    addExportNamed(builder, node);
  } else if (node.type === 'ExportDefaultDeclaration') {
    addDefault(builder, node);
  } else if (node.type === 'ExportAllDeclaration') {
    addExportAll(builder, node);
  } else if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'VariableDeclaration'
  ) {
    addDeclaration(builder, node, false);
  } else {
    // `export =` sets what the module exports as a whole.
    if (node.type === 'TSExportAssignment' || node.type === 'TSNamespaceExportDeclaration') {
      builder.shape.traceable = false;
    }
    builder.unit(node);
  }
}

/** Splits the top level of a module into the pieces that run on load and the pieces that wait to be used. */
export function collectShape(
  body: readonly Node[],
  hasModuleSyntax: boolean,
  typeOnly: ReadonlySet<string> = new Set(),
): ModuleShape {
  if (!hasModuleSyntax) {
    return {
      ...collectCommonJsShape(body),
      dynamicImports: loadsOf(body, 'import'),
      requires: loadsOf(body, 'require'),
    };
  }
  const builder = new ShapeBuilder();
  for (const statement of body) {
    addStatement(builder, statement, typeOnly);
  }
  const { shape } = builder;
  shape.dynamicImports = loadsOf(body, 'import');
  shape.requires = loadsOf(body, 'require');
  shape.units.sort((left, right) => left.start - right.start);
  shape.traceable =
    shape.traceable &&
    !shape.units.some(unit => {
      const roots = rootNames(unit);
      return [...opaqueNames].some(name => roots.has(name));
    });
  return shape;
}
