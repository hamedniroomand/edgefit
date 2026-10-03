import type { Node } from 'oxc-parser';

import { childNodes, isTypeOnly } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';

import type { DynamicImports } from './dynamic-imports.ts';

/**
 * A top-level piece of a module. Code that runs when the module loads has no `name`. A function
 * or class that does nothing until it is used has one, and only counts once something uses it.
 */
export interface Unit {
  start: number;
  end: number;
  name: string | undefined;
  /**
   * Every name the code mentions, which is more than the names it uses. A member read from a
   * plain name is `name.member`, so what is asked of an imported module can be told apart.
   */
  mentions: Set<string>;
}

/** What an export stands for: a name in this module, or something another module exports. */
export type ExportSource = { local: string } | { specifier: string; imported: string };

export interface ModuleShape {
  /** False when the exports cannot be told apart. All of the module counts. */
  traceable: boolean;
  /** Whether the module is CommonJS, so its `default` export is all of what it exports. */
  commonJs: boolean;
  /** Whether a CommonJS module marks itself `__esModule`, so it has a `default` export of its own. */
  esModule: boolean;
  /** In source order. They never overlap. */
  units: Unit[];
  /** The lazy units by the name they declare. */
  declared: Map<string, Unit[]>;
  /**
   * What each imported local name takes from its module: a name, `default`, or `*` for all. A
   * `*` is asked for only the members that are read from it, unless it is used as a whole.
   */
  imports: Map<string, { specifier: string; imported: string }>;
  /** The local names that hold a `require`d module, which only asks for the members read from it. */
  bindings: Set<string>;
  /** Every specifier a static `import` or `export … from` names. */
  specifiers: Set<string>;
  exports: Map<string, ExportSource>;
  /** The modules `export * from` re-exports. */
  stars: string[];
  /** What the module asks of each file it loads with `import('literal')`. */
  dynamicImports: DynamicImports;
}

export function mentionsIn(node: Node, names = new Set<string>()): Set<string> {
  if (isTypeOnly(node)) {
    return names;
  }
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.property.type === 'Identifier'
  ) {
    names.add(`${node.object.name}.${node.property.name}`);
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
export function isLazyClass(node: NodeOf<'ClassDeclaration' | 'ClassExpression'>): boolean {
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

export class ShapeBuilder {
  public readonly shape: ModuleShape = {
    traceable: true,
    commonJs: false,
    esModule: false,
    units: [],
    declared: new Map(),
    imports: new Map(),
    bindings: new Set(),
    specifiers: new Set(),
    exports: new Map(),
    stars: [],
    dynamicImports: new Map(),
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

/** The plain names a unit mentions, without the member that is read from them. */
export function rootNames(unit: Unit): Set<string> {
  return new Set([...unit.mentions].map(name => name.split('.', 1)[0] ?? name));
}
