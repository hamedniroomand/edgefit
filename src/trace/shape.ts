import type { Node } from 'oxc-parser';

import { childNodes, isFunction, isTypeOnly, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { patternNames } from '@/extract/declarations.ts';

/**
 * A top-level piece of a module. Code that runs when the module loads has no `name`. A function
 * or class that does nothing until it is used has one, and only counts once something uses it.
 */
export interface Unit {
  start: number;
  end: number;
  name: string | undefined;
  /** Every name the code mentions, which is more than the names it uses. */
  mentions: Set<string>;
}

/** What an export stands for: a name in this module, or something another module exports. */
export type ExportSource = { local: string } | { specifier: string; imported: string };

export interface ModuleShape {
  /** False when the exports cannot be told apart, as in CommonJS. All of the module counts. */
  traceable: boolean;
  /** In source order. They never overlap. */
  units: Unit[];
  /** The lazy units by the name they declare. */
  declared: Map<string, Unit[]>;
  /** What each imported local name takes from its module: a name, `default`, or `*` for all. */
  imports: Map<string, { specifier: string; imported: string }>;
  /** Every specifier a static `import` or `export … from` names. */
  specifiers: Set<string>;
  exports: Map<string, ExportSource>;
  /** The modules `export * from` re-exports. */
  stars: string[];
}

// Names that make a module read its own exports or run code from text, so nothing is known about it.
const opaqueNames = new Set(['module', 'exports', 'eval']);

const exportedDefault = '*default*';

function moduleName(node: Node): string {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'Literal' ? String(node.value) : '';
}

function mentionsIn(node: Node, names = new Set<string>()): Set<string> {
  if (isTypeOnly(node)) {
    return names;
  }
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
    names.add(node.name);
  }
  for (const child of childNodes(node)) {
    mentionsIn(child, names);
  }
  return names;
}

function hasDecorator(node: Node): boolean {
  return node.type === 'Decorator' || childNodes(node).some(child => hasDecorator(child));
}

/** Whether evaluating the class only defines it, so nothing runs until it is used. */
function isLazyClass(node: NodeOf<'ClassDeclaration' | 'ClassExpression'>): boolean {
  const { superClass } = node;
  const plainSuper =
    superClass === null ||
    superClass.type === 'Identifier' ||
    (superClass.type === 'MemberExpression' && !superClass.computed);
  return (
    plainSuper &&
    !hasDecorator(node) &&
    node.body.body.every(
      member =>
        member.type === 'TSIndexSignature' ||
        (member.type !== 'StaticBlock' &&
          !member.computed &&
          (member.type === 'MethodDefinition' || !member.static)),
    )
  );
}

class ShapeBuilder {
  public readonly shape: ModuleShape = {
    traceable: true,
    units: [],
    declared: new Map(),
    imports: new Map(),
    specifiers: new Set(),
    exports: new Map(),
    stars: [],
  };

  public unit(node: Node, name?: string, mentions?: Set<string>): void {
    const unit = { start: node.start, end: node.end, name, mentions: mentions ?? mentionsIn(node) };
    this.shape.units.push(unit);
    if (name !== undefined) {
      this.shape.declared.set(name, [...(this.shape.declared.get(name) ?? []), unit]);
    }
  }

  /** A statement that holds no code of its own to run or to use. */
  public bare(node: Node): void {
    this.unit(node, undefined, new Set());
  }

  public export(name: string, source: ExportSource): void {
    this.shape.exports.set(name, source);
  }

  public importFrom(specifier: string): void {
    this.shape.specifiers.add(specifier);
  }
}

function addImport(builder: ShapeBuilder, node: NodeOf<'ImportDeclaration'>): void {
  if (node.importKind === 'type') {
    return;
  }
  const specifier = node.source.value;
  builder.importFrom(specifier);
  // The module itself is used wherever it is imported; only the names it takes can be unused.
  builder.bare(node.source);
  for (const item of node.specifiers) {
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

function addStatement(builder: ShapeBuilder, node: Node): void {
  if (node.type === 'ImportDeclaration') {
    addImport(builder, node);
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
export function collectShape(body: readonly Node[], hasModuleSyntax: boolean): ModuleShape {
  const builder = new ShapeBuilder();
  for (const statement of body) {
    addStatement(builder, statement);
  }
  const { shape } = builder;
  shape.units.sort((left, right) => left.start - right.start);
  shape.traceable =
    shape.traceable &&
    hasModuleSyntax &&
    !shape.units.some(unit => [...opaqueNames].some(name => unit.mentions.has(name)));
  return shape;
}
