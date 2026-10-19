import type { Node } from 'oxc-parser';

import { isFunction, staticKey, strip, stringLiteral } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';

import { isLazyClass, mentionsIn, rootNames } from './builder.ts';
import { EsModuleMark } from './cjs-es-module.ts';
import {
  exportKey,
  isExportsObject,
  isHelperName,
  isModuleExports,
  isName,
  isVoidChain,
  moduleExportsKey,
  opaqueNames,
  requiredBy,
} from './cjs-forms.ts';
import type { ObjectLiteral } from './cjs-forms.ts';
import {
  exportedAs,
  loadTimeExport,
  moduleExportsValue,
  objectExport,
  readProperties,
  waitingExport,
} from './cjs-values.ts';
import type { ExportContext } from './cjs-values.ts';

/** Reads what a CommonJS module sets on `exports` and `module.exports`. */
export class ExportWriter {
  readonly #context: ExportContext;
  /** Writes to `exports` that are not copies of what `module.exports` was set to. */
  #writes = 0;
  /** Writes of `module.exports.name` after `module.exports = value` that add an export, as a property of that value. */
  #added = 0;
  /** Set when `module.exports` is assigned: the name it was set to, if it was a variable. */
  #assigned: { name?: string } | undefined;
  /** The writes `exports.k = obj.k`, which copy from the object that `module.exports` may be set to. */
  readonly #mirrors: { from: string; name: string; value: Node }[] = [];
  /** The variables that were set to an object literal and read as exports. */
  readonly #objects = new Set<string>();
  #unreadable = false;
  readonly #mark: EsModuleMark;

  public constructor(context: ExportContext) {
    this.#context = context;
    this.#mark = new EsModuleMark(context.builder.shape);
  }

  /** Notes that a variable holds an object literal that `module.exports` is set to. */
  public readObject(name: string, object: ObjectLiteral): void {
    this.#objects.add(name);
    if (!readProperties(this.#context, object)) {
      this.#unreadable = true;
    }
  }

  /** Whether everything the module writes to its exports could be read. */
  public settle(): boolean {
    if (this.#assigned === undefined) {
      // Nothing replaced `exports`, so `exports.k = obj.k` is an export like any other.
      for (const { name, value } of this.#mirrors.splice(0)) {
        loadTimeExport(this.#context.builder, name, value);
      }
    }
    const { shape } = this.#context.builder;
    const named = this.#assigned?.name;
    // What `module.exports` was set to replaces `exports`, so the only writes to `exports` that
    // can be left alone are copies of it. Without that, a copy is an export like any other.
    const stray = this.#mirrors.filter(mirror => mirror.from !== named).length;
    // A function or a class that waits to be used is read as it is, when nothing else names it.
    const waiting = named !== undefined && !this.#objects.has(named) && shape.declared.has(named);
    // Only such a value holds its added properties. Other modules can read a required module.
    const mixed =
      this.#assigned === undefined
        ? this.#mirrors.length > 0
        : this.#writes + stray > 0 ||
          (this.#added > 0 &&
            (!waiting || shape.imports.has(named) || this.#context.reaches(false)));
    const used =
      named !== undefined &&
      ((!this.#objects.has(named) && !waiting) ||
        shape.units.some(
          unit => rootNames(unit).has(named) && shape.declared.get(named)?.includes(unit) !== true,
        ));
    const readable = !(this.#unreadable || mixed || used);
    if (readable && waiting) {
      shape.moduleExports = { local: named };
    }
    return readable;
  }

  /** `Object.defineProperty(exports, 'name', { get })` or `{ value }`. */
  public defineProperty([target, key, descriptor]: [Node, Node, Node]): boolean {
    const name = stringLiteral(key);
    const object = strip(descriptor);
    if (!isExportsObject(target) || name === undefined || object.type !== 'ObjectExpression') {
      return false;
    }
    if (name === '__esModule') {
      this.#mark.define(target, object);
      return true;
    }
    this.#writes += 1;
    for (const property of object.properties) {
      if (property.type !== 'Property' || property.computed) {
        continue;
      }
      const field = staticKey(property.key, false);
      if (field === 'get' || (field === 'value' && isFunction(strip(property.value)))) {
        this.#export(name, property.value, property);
        return true;
      }
    }
    // A value that is computed when the module loads.
    return false;
  }

  /** `_export(exports, { name: function () { return … } })`. */
  public getters(node: Node): boolean {
    const object = strip(node);
    if (object.type !== 'ObjectExpression') {
      return false;
    }
    this.#writes += object.properties.length;
    for (const property of object.properties) {
      const name =
        property.type === 'Property' && !property.computed
          ? staticKey(property.key, false)
          : undefined;
      if (
        property.type !== 'Property' ||
        name === undefined ||
        !isFunction(strip(property.value))
      ) {
        this.#unreadable = true;
        return true;
      }
      this.#export(name, property.value, property);
    }
    return true;
  }

  /** An export that is the function `value`, filed as a unit that counts once the export is used. */
  #export(name: string, value: Node, unit: Node): void {
    this.#context.builder.unit(unit, exportKey(name), mentionsIn(value));
    this.#context.builder.export(name, { local: exportKey(name) });
  }

  public assignment(node: NodeOf<'AssignmentExpression'>): boolean {
    // In a chain, `this` can be the exports object, and the module cannot tell it apart from the value.
    const whole = moduleExportsValue(node, () => !this.#context.reaches(true));
    if (whole !== undefined) {
      return this.#assignModuleExports(whole);
    }
    if (node.operator !== '=') {
      return false;
    }
    const left = strip(node.left);
    if (left.type === 'Identifier') {
      return this.alias(left.name, node.right, node);
    }
    if (left.type !== 'MemberExpression' || !isExportsObject(left.object)) {
      return false;
    }
    const name = staticKey(left.property, left.computed);
    if (name === undefined || left.computed) {
      this.#unreadable = true;
      return true;
    }
    // After `module.exports = value`, `module.exports.key = …` adds a property to that value. A write
    // through `exports` still counts, because `exports` can name the object that was replaced.
    const counted = this.#assigned === undefined || !isModuleExports(left.object);
    if (name === '__esModule') {
      this.#mark.assign(left.object, strip(node.right));
      return true;
    }
    const known = this.#context.builder.shape.exports;
    const before = known.get(name);
    const read = this.#assignExport(name, strip(node.right), counted);
    if (!counted && known.get(name) !== before) {
      this.#added += 1;
      // Only the last write is an export, but code that runs between the writes can read the first.
      this.#unreadable ||= before !== undefined;
    }
    return read;
  }

  /** `local = exports.name = value`: the function or lazy class `value` is both the export and `local`. */
  public alias(local: string, value: Node, unit: Node): boolean {
    // A helper name skips the opaque check, and `this` can read the export by another name.
    const write = opaqueNames.has(local) || isHelperName(local) ? undefined : waitingExport(value);
    if (write === undefined || this.#context.reaches(true)) {
      return false;
    }
    this.#writes += 1;
    this.#context.builder.unit(unit, local, mentionsIn(write.value));
    this.#context.builder.export(write.name, { local });
    return true;
  }

  /** `exports.name = value`. */
  #assignExport(name: string, value: Node, counted: boolean): boolean {
    if (value.type === 'Identifier') {
      this.#context.builder.export(name, { local: value.name });
      this.#writes += counted ? 1 : 0;
      return true;
    }
    if (value.type === 'MemberExpression' && !value.computed && isName(value.property, name)) {
      const from = strip(value.object);
      if (from.type === 'Identifier') {
        // `exports.a = obj.a`, which copies onto the object that `module.exports = obj` replaced.
        this.#mirrors.push({ from: from.name, name, value });
        return true;
      }
    }
    if (isVoidChain(value)) {
      // `exports.a = exports.b = void 0`, as tsc declares the names it assigns later.
      return true;
    }
    this.#writes += counted ? 1 : 0;
    const required = requiredBy(value, this.#context.helpers);
    if (required !== undefined) {
      this.#context.load(required);
      this.#context.builder.export(name, {
        specifier: required.specifier,
        imported: required.member ?? '*',
      });
      return true;
    }
    if (value.type === 'ObjectExpression') {
      objectExport(this.#context.builder, name, value);
      return true;
    }
    if (isFunction(value) || (value.type === 'ClassExpression' && isLazyClass(value))) {
      this.#export(name, value, value);
      return true;
    }
    const source = exportedAs(this.#context.builder, value);
    if (source === undefined) {
      loadTimeExport(this.#context.builder, name, value);
    } else {
      // `exports.b = exports.a`: the same export under another name.
      this.#context.builder.export(name, source);
    }
    return true;
  }

  /** `exports.__defineGetter__('name', () => …)`: the function runs when the export is read. */
  public defineGetter([key, getter]: [Node, Node]): boolean {
    const name = stringLiteral(key);
    const value = strip(getter);
    if (name === undefined || !isFunction(value)) {
      return false;
    }
    this.#writes += 1;
    this.#export(name, value, value);
    return true;
  }

  /** `module.exports = value`. */
  #assignModuleExports(value: Node): boolean {
    this.#mark.replace();
    if (this.#assigned !== undefined) {
      this.#unreadable = true;
      return false;
    }
    if (value.type === 'ObjectExpression') {
      this.#assigned = {};
      if (!readProperties(this.#context, value)) {
        this.#unreadable = true;
        return false;
      }
      return true;
    }
    if (value.type === 'Identifier') {
      this.#assigned = { name: value.name };
      return true;
    }
    if (isFunction(value) || (value.type === 'ClassExpression' && isLazyClass(value))) {
      this.#assigned = { name: moduleExportsKey };
      this.#context.builder.unit(value, moduleExportsKey, mentionsIn(value));
      return true;
    }
    const required = requiredBy(value, this.#context.helpers);
    if (required !== undefined && required.member === undefined) {
      this.#assigned = {};
      this.#context.load(required);
      this.#context.builder.shape.stars.push(required.specifier);
      return true;
    }
    this.#unreadable = true;
    return false;
  }
}
