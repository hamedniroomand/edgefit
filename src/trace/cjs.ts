import type { Node } from 'oxc-parser';

import { isFunction, isTypeOnly, strip } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { patternNames } from '@/extract/declarations.ts';

import { ShapeBuilder, isLazyClass, rootNames } from './builder.ts';
import type { ModuleShape } from './builder.ts';
import { ExportWriter } from './cjs-exports.ts';
import {
  assignsExports,
  destructuredNames,
  helperName,
  isExportsObject,
  isHelperName,
  isName,
  opaqueNames,
  requireCall,
  requireCalls,
  requiredBy,
  starHelpers,
  topLevelFunctions,
} from './cjs-forms.ts';
import type { Call, Helpers, ObjectLiteral, RequireUse } from './cjs-forms.ts';
import { readableNestedBindings } from './cjs-nested.ts';
import { addWriteInto, exportWrittenInto, resolveOwnReads } from './cjs-own-exports.ts';
import type { WriteInto } from './cjs-own-exports.ts';

class CommonJsReader {
  readonly #builder = new ShapeBuilder();
  readonly #helpers: Helpers;
  /** The `require` calls whose use is understood. */
  readonly #read = new Set<Node>();
  /** The `require` calls that are the whole value of a declarator that binds or destructures the result. */
  readonly #bound = new Set<Node>();
  readonly #writer: ExportWriter;
  readonly #body: readonly Node[];
  /** The statements that write into an export, filed once the exports are known. */
  readonly #writesInto: WriteInto[] = [];

  public constructor(body: readonly Node[]) {
    this.#body = body;
    this.#helpers = topLevelFunctions(body);
    this.#writer = new ExportWriter({
      builder: this.#builder,
      helpers: this.#helpers,
      load: (found: RequireUse): void => {
        this.#load(found);
      },
    });
  }

  public get shape(): ModuleShape {
    return this.#builder.shape;
  }

  public run(): ModuleShape {
    const { shape } = this.#builder;
    shape.commonJs = true;
    for (const statement of this.#body) {
      this.#statement(statement);
    }
    this.#readNestedRequires();
    this.#finish();
    return shape;
  }

  /** A `require` inside a function asks for its module only when the code that holds it is used. */
  #readNestedRequires(): void {
    const { shape } = this.#builder;
    const topLevel = new Map(
      [...shape.imports].map(([local, source]) => [
        local,
        `${source.specifier}\0${source.imported}`,
      ]),
    );
    for (const { found, local, imported, direct } of readableNestedBindings(
      this.#body,
      this.#helpers,
      topLevel,
    )) {
      this.#load(found);
      if (direct) {
        this.#bound.add(found.call);
      }
      shape.imports.set(local, { specifier: found.specifier, imported });
      if (imported === '*') {
        shape.bindings.add(local);
      }
    }
  }

  #finish(): void {
    const { shape } = this.#builder;
    const settled = this.#writer.settle();
    for (const write of this.#writesInto) {
      addWriteInto(this.#builder, write);
    }
    // resolveOwnReads needs moduleExports, so it runs after settle(); a resolved read never counts
    // as a use for settle().
    resolveOwnReads(shape);
    shape.units.sort((left, right) => left.start - right.start);
    // A module that is required in a way that is not read asks for all of it.
    const unread = new Set(
      this.#body
        .flatMap(statement => requireCalls(statement))
        .filter(call => !this.#read.has(call))
        .map(call => requireCall(call)?.specifier),
    );
    for (const specifier of unread) {
      if (specifier !== undefined) {
        shape.specifiers.delete(specifier);
      }
    }
    for (const call of this.#body.flatMap(statement => requireCalls(statement))) {
      if (!this.#bound.has(call)) {
        shape.unboundRequires.add(requireCall(call)?.specifier ?? '');
      }
    }
    shape.traceable =
      settled &&
      !shape.units.some(
        unit =>
          // The body of a helper such as tsc's `__exportStar(m, exports)` names `exports` as a parameter.
          !(unit.name !== undefined && isHelperName(unit.name)) &&
          [...opaqueNames].some(name => rootNames(unit).has(name)),
      );
  }

  /** Notes a `require` that is the whole value of the declarator that binds or destructures it. */
  #markBound(required: RequireUse, init: Node | null): void {
    if (init !== null && strip(init) === required.call) {
      this.#bound.add(required.call);
    }
  }

  /** A `require` whose use is understood, which also loads the module. */
  #load(found: RequireUse): void {
    this.#read.add(found.call);
    this.#builder.importFrom(found.specifier);
  }

  #statement(node: Node): void {
    if (isTypeOnly(node)) {
      return;
    }
    if (node.type === 'ExpressionStatement') {
      const expression = strip(node.expression);
      const name = exportWrittenInto(expression);
      if (name !== undefined && expression.type === 'AssignmentExpression') {
        this.#writesInto.push({ node, name, value: expression.right });
      } else if (!this.#expression(expression)) {
        this.#builder.unit(node);
      }
    } else if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        this.#declarator(declarator);
      }
    } else if (node.type === 'FunctionDeclaration') {
      this.#builder.unit(node, node.id?.name);
    } else if (node.type === 'ClassDeclaration') {
      this.#builder.unit(node, isLazyClass(node) ? node.id?.name : undefined);
    } else {
      this.#builder.unit(node);
    }
  }

  #declarator(node: NodeOf<'VariableDeclarator'>): void {
    const { id, init } = node;
    const required = init === null ? undefined : requiredBy(init, this.#helpers);
    if (required !== undefined && required.member === undefined && id.type === 'Identifier') {
      // `const x = require('s')`: what is read from `x` is what is asked of `s`.
      this.#load(required);
      this.#markBound(required, init);
      this.#builder.unit(node, id.name, new Set());
      this.#builder.shape.imports.set(id.name, { specifier: required.specifier, imported: '*' });
      this.#builder.shape.bindings.add(id.name);
      return;
    }
    if (required !== undefined && required.member === undefined && id.type === 'ObjectPattern') {
      const names = destructuredNames(id);
      if (names !== undefined) {
        this.#load(required);
        this.#markBound(required, init);
        for (const [local, imported, property] of names) {
          this.#builder.unit(property, local, new Set());
          this.#builder.shape.imports.set(local, { specifier: required.specifier, imported });
        }
        return;
      }
    }
    if (
      id.type === 'Identifier' &&
      init !== null &&
      strip(init).type === 'ObjectExpression' &&
      this.#isModuleExportsTarget(id.name)
    ) {
      this.#writer.readObject(id.name, strip(init) as ObjectLiteral);
      return;
    }
    const lazy =
      id.type === 'Identifier' &&
      init !== null &&
      (isFunction(strip(init)) || this.#helpers.all.has(id.name));
    this.#builder.unit(node, lazy ? patternNames(id)[0] : undefined);
  }

  /** Whether the module sets `module.exports` to this name somewhere. */
  #isModuleExportsTarget(name: string): boolean {
    return this.#body.some(
      statement =>
        statement.type === 'ExpressionStatement' &&
        strip(statement.expression).type === 'AssignmentExpression' &&
        assignsExports(strip(statement.expression) as NodeOf<'AssignmentExpression'>, name),
    );
  }

  /** Reads the expression of a statement, and says whether it was understood. */
  #expression(node: Node): boolean {
    if (node.type === 'Literal') {
      return typeof node.value === 'string';
    }
    if (node.type === 'LogicalExpression' && node.operator === '&&') {
      // `0 && (module.exports = { a: null })` is a hint to tools that read the exports by name.
      const left = strip(node.left);
      return left.type === 'Literal' && left.value === 0;
    }
    if (node.type === 'AssignmentExpression') {
      return this.#writer.assignment(node);
    }
    if (node.type === 'CallExpression') {
      return this.#call(node);
    }
    return false;
  }

  #call(node: Call): boolean {
    const { callee, arguments: args } = node;
    const bare = requireCall(node);
    if (bare !== undefined) {
      // `require('s');` loads the module and asks nothing of it.
      this.#load({ ...bare, member: undefined });
      return true;
    }
    if (
      callee.type === 'MemberExpression' &&
      isName(callee.object, 'Object') &&
      isName(callee.property, 'defineProperty') &&
      args.length === 3
    ) {
      return this.#writer.defineProperty(args as [Node, Node, Node]);
    }
    if (args.length !== 2) {
      return false;
    }
    const [first, second] = args as [Node, Node];
    if (
      callee.type === 'MemberExpression' &&
      isExportsObject(callee.object) &&
      isName(callee.property, '__defineGetter__')
    ) {
      return this.#writer.defineGetter([first, second]);
    }
    const helper = helperName(callee, this.#helpers);
    if (helper !== undefined && this.#helpers.getters.has(helper) && isExportsObject(first)) {
      return this.#writer.getters(second);
    }
    if (helper !== undefined && starHelpers.has(helper)) {
      const required = requireCall(first);
      if (required !== undefined && isExportsObject(second)) {
        this.#load({ ...required, member: undefined });
        this.#builder.shape.stars.push(required.specifier);
        return true;
      }
    }
    return false;
  }
}

/** Splits the top level of a CommonJS module into the pieces that run on load and the pieces that wait to be used. */
export function collectCommonJsShape(body: readonly Node[]): ModuleShape {
  return new CommonJsReader(body).run();
}
