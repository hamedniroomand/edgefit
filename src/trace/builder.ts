import type { Node } from 'oxc-parser';

import { childNodes, isFunction, isTypeOnly, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { ownNames, parameterNames } from '@/extract/set-again.ts';

import { isExportsMember, isModuleExports, isName } from './cjs-forms.ts';
import type { DynamicImports } from './dynamic-imports.ts';
import { thisReads } from './this-reads.ts';

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
  /** Whether the object that a CommonJS module exports at the end has an `__esModule` mark that is true, so it has a `default` export of its own. A node-mode importer does not use this mark. */
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
  /** The function or class that `module.exports` is set to. Anything asked of the module keeps it. */
  moduleExports?: { local: string };
  /** The modules `export * from` re-exports. */
  stars: string[];
  /** What the module asks of each file it loads with `import('literal')`. */
  dynamicImports: DynamicImports;
  /** What the module asks of each file it loads with `require('literal')`. */
  requires: DynamicImports;
  /** The specifiers that some `require` loads without binding or destructuring the result directly. */
  unboundRequires: Set<string>;
  /** The specifiers that a `require` outside any function loads, so the file runs when this module loads. */
  eagerRequires: Set<string>;
}

/** Whether the value is a call of `require`, whose result the declared name holds. */
function isRequireCall(node: Node): boolean {
  const call = strip(node);
  return (
    call.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    call.callee.name === 'require'
  );
}

/** What an assignment, an update or a `delete` writes to. */
function writeTarget(node: Node): Node | undefined {
  if (node.type === 'AssignmentExpression') {
    return node.left;
  }
  if (node.type === 'UpdateExpression') {
    return node.argument;
  }
  return node.type === 'UnaryExpression' && node.operator === 'delete' ? node.argument : undefined;
}

/** Whether code writes into the exports of the module. With `local`, a write through `exports`, as `exports.a = 1`, goes to a local variable. */
function writesExports(node: Node, local: boolean): boolean {
  const written = writeTarget(node);
  if (written === undefined || !isExportsMember(written)) {
    return false;
  }
  const inner = strip(written);
  return !(local && inner.type === 'MemberExpression' && isName(strip(inner.object), 'exports'));
}

/** A TypeScript parameter decorator, such as `@Inject(token) exports`, runs in the scope around the class. */
function hasDecorators(node: Node): boolean {
  return 'decorators' in node && Array.isArray(node.decorators) && node.decorators.length > 0;
}

/**
 * Whether `node` declares its own `exports` for `child`. A parameter or a default value does not
 * see the names that the function body declares. The name of a function declaration and the value
 * that a `switch` tests belong to the scope around them.
 */
function declaresExports(node: Node, child: Node, own: readonly string[]): boolean {
  if (
    (node.type === 'FunctionDeclaration' && child === node.id) ||
    (node.type === 'SwitchStatement' && child === node.discriminant) ||
    (isFunction(node) && child !== node.body && hasDecorators(child))
  ) {
    return false;
  }
  return (isFunction(node) && child !== node.body ? parameterNames(node) : own).includes('exports');
}

/** The text `module.exports.a` or `a.b` for a member read with a plain name. Such a read gives no other mention. */
function memberMention(node: Node): string | undefined {
  if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') {
    return undefined;
  }
  if (isModuleExports(node.object)) {
    return `module.exports.${node.property.name}`;
  }
  return node.object.type === 'Identifier'
    ? `${node.object.name}.${node.property.name}`
    : undefined;
}

/**
 * `local` is set inside a function, block, loop, `switch` or `catch` that declares its own `exports`. There, a
 * mention of `exports` is a local variable, not the exports of the module. A local `module` or
 * `eval` stays a mention: a bundle runtime declares its own `module`, and a call of a local `eval`
 * can still be a direct eval, which sees the module scope.
 */
export function mentionsIn(node: Node, names = new Set<string>(), local = false): Set<string> {
  if (isTypeOnly(node)) {
    return names;
  }
  if (node.type === 'VariableDeclarator' && node.init !== null && isRequireCall(node.init)) {
    // The name that a `require` declares is a use only where the code reads it.
    return mentionsIn(node.init, names, local);
  }
  if (writesExports(node, local)) {
    // Code that writes the exports changes them after the module loads: they cannot be read.
    names.add('exports');
  }
  const member = memberMention(node);
  if (member !== undefined) {
    if (!(local && member.startsWith('exports.'))) {
      names.add(member);
    }
    return names;
  }
  if (
    (node.type === 'Identifier' || (node.type === 'JSXIdentifier' && node.name !== 'this')) &&
    !(local && node.name === 'exports')
  ) {
    names.add(node.name);
  }
  const own = local ? [] : ownNames(node);
  for (const child of childNodes(node)) {
    mentionsIn(child, names, local || (own.length > 0 && declaresExports(node, child, own)));
  }
  return names;
}

function hasDecorator(node: Node): boolean {
  return node.type === 'Decorator' || childNodes(node).some(child => hasDecorator(child));
}

/** A name or a chain of names, such as `kName` or `Symbol.iterator`, which only reads a value. */
function isPlainKey(node: Node): boolean {
  return (
    node.type === 'Identifier' ||
    (node.type === 'MemberExpression' &&
      !node.computed &&
      node.property.type === 'Identifier' &&
      isPlainKey(node.object))
  );
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
          (!member.computed || isPlainKey(member.key)) &&
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
    requires: new Map(),
    unboundRequires: new Set(),
    eagerRequires: new Set(),
  };

  public unit(node: Node, name?: string, mentions?: Set<string>): void {
    const unit = { start: node.start, end: node.end, name, mentions: mentions ?? mentionsIn(node) };
    if (this.shape.commonJs) {
      // `this` can be the exports of a CommonJS module. `thisReads` says which reads count.
      for (const read of thisReads(node)) {
        unit.mentions.add(read);
      }
    }
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
