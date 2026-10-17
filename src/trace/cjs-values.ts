import type { Node } from 'oxc-parser';

import { childNodes, isFunction, staticKey, strip, stringLiteral } from '@/extract/ast.ts';
import type { NodeOf } from '@/extract/ast.ts';
import { constantOf } from '@/extract/constants.ts';

import { isLazyClass, mentionsIn } from './builder.ts';
import type { ExportSource, ShapeBuilder } from './builder.ts';
import { exportKey, isExportsObject, isModuleExports, isName, requiredBy } from './cjs-forms.ts';
import type { Helpers, ObjectLiteral, RequireUse } from './cjs-forms.ts';

/** What the reader of a module gives the reader of its exports. */
export interface ExportContext {
  builder: ShapeBuilder;
  helpers: Helpers;
  /** Notes that a `require` is understood, and that its module is loaded. */
  load: (found: RequireUse) => void;
  /** Whether the module can reach its own exports in a way that cannot be read, also through `this` with `withThis`. */
  reaches: (withThis: boolean) => boolean;
}

/** Whether the code uses `this`, which can be the exports object in CommonJS. */
function hasThis(node: Node): boolean {
  return node.type === 'ThisExpression' || childNodes(node).some(child => hasThis(child));
}

const selfNames = new Set(['arguments', 'caller', 'require']);

/**
 * Whether the code can reach the exports of its own module without the names `exports` and
 * `module`: `arguments` of the module wrapper, `caller`, or `require` in any way other than a call
 * with a string literal, such as `require(__filename)` or `require.cache`.
 */
function reachesItself(node: Node): boolean {
  if (
    node.type === 'CallExpression' &&
    isName(strip(node.callee), 'require') &&
    node.arguments[0] !== undefined &&
    stringLiteral(node.arguments[0]) !== undefined
  ) {
    return node.arguments.some(argument => reachesItself(argument));
  }
  return (
    (node.type === 'Identifier' && selfNames.has(node.name)) ||
    childNodes(node).some(child => reachesItself(child))
  );
}

/** The `reaches` check of a module, which walks the module at most once for each kind of read. */
export function selfReach(body: readonly Node[]): (withThis: boolean) => boolean {
  let self: boolean | undefined;
  let thisFound: boolean | undefined;
  return (withThis: boolean): boolean =>
    (self ??= body.some(statement => reachesItself(statement))) ||
    (withThis && (thisFound ??= body.some(statement => hasThis(statement))));
}

/** The export that `exports.name` reads, when the module wrote it before. */
export function exportedAs(builder: ShapeBuilder, value: Node): ExportSource | undefined {
  return value.type === 'MemberExpression' &&
    !value.computed &&
    value.property.type === 'Identifier' &&
    isExportsObject(value.object)
    ? builder.shape.exports.get(value.property.name)
    : undefined;
}

/** `exports.name = value`, when `value` is a function or a lazy class that waits to be used. */
export function waitingExport(node: Node): { name: string; value: Node } | undefined {
  const write = strip(node);
  if (write.type !== 'AssignmentExpression' || write.operator !== '=') {
    return undefined;
  }
  const target = strip(write.left);
  const value = strip(write.right);
  const name =
    target.type === 'MemberExpression' && !target.computed && isExportsObject(target.object)
      ? staticKey(target.property, false)
      : undefined;
  return name !== undefined &&
    name !== '__esModule' &&
    (isFunction(value) || (value.type === 'ClassExpression' && isLazyClass(value)))
    ? { name, value }
    : undefined;
}

/** An export whose value the module computes when it loads: that code counts, and the export has no part that waits. */
export function loadTimeExport(builder: ShapeBuilder, name: string, value: Node): void {
  builder.unit(value, undefined, mentionsIn(value));
  builder.export(name, { local: exportKey(name) });
}

/** Only a function or a lazy class in the object waits for the export to be used. The rest runs when the module loads. */
export function objectExport(builder: ShapeBuilder, name: string, object: ObjectLiteral): void {
  for (const property of object.properties) {
    const value =
      property.type === 'Property' && !property.computed ? strip(property.value) : undefined;
    if (
      value !== undefined &&
      (isFunction(value) || (value.type === 'ClassExpression' && isLazyClass(value)))
    ) {
      builder.unit(property, exportKey(name), mentionsIn(value));
    } else {
      builder.unit(property);
    }
  }
  builder.export(name, { local: exportKey(name) });
}

/**
 * Whether `exports.__esModule` is set to a value that is known to be true, such as `true`, `1` or
 * `!0`. Any other value, such as `false`, a name, a regular expression or a bigint, is not a mark,
 * and a later write of such a value clears an earlier mark.
 */
export function isTruthy(node: Node): boolean {
  const constant = constantOf(node);
  return constant !== undefined && Boolean(constant.value);
}

/**
 * Whether the `field` of a descriptor of `__esModule`, such as `value` or `writable`, holds a value
 * that `isTruthy` accepts. The last such key wins, as at runtime, so a spread or a key that is not
 * known after it can replace it. A getter, or a descriptor with no such key, gives false.
 */
export function isTruthyDescriptor(
  descriptor: ObjectLiteral,
  field: 'value' | 'writable',
): boolean {
  for (const property of descriptor.properties.toReversed()) {
    const key =
      property.type === 'Property' ? staticKey(property.key, property.computed) : undefined;
    if (key === undefined || property.type !== 'Property') {
      return false;
    }
    if (key === field) {
      return isTruthy(property.value);
    }
  }
  return false;
}

/**
 * The value of `module.exports = value`. In `module.exports = exports = value` and
 * `exports = module.exports = value`, both names hold the same object, so the value is the same.
 */
export function moduleExportsValue(
  node: NodeOf<'AssignmentExpression'>,
  chains = (): boolean => true,
): Node | undefined {
  if (node.operator !== '=') {
    return undefined;
  }
  const left = strip(node.left);
  const right = strip(node.right);
  const inner = right.type === 'AssignmentExpression' && right.operator === '=' ? right : undefined;
  if (isModuleExports(left)) {
    return inner !== undefined && isName(strip(inner.left), 'exports') && chains()
      ? strip(inner.right)
      : right;
  }
  return isName(left, 'exports') && inner !== undefined && isModuleExports(inner.left) && chains()
    ? strip(inner.right)
    : undefined;
}

/** Reads `{ name: value }` as the exports of the module. */
export function readProperties(context: ExportContext, object: ObjectLiteral): boolean {
  for (const property of object.properties) {
    if (property.type !== 'Property' || property.computed) {
      return false;
    }
    const name = staticKey(property.key, false);
    const value = strip(property.value);
    if (name === undefined) {
      return false;
    }
    const required = requiredBy(value, context.helpers);
    if (required !== undefined) {
      context.load(required);
      context.builder.export(name, {
        specifier: required.specifier,
        imported: required.member ?? '*',
      });
    } else if (value.type === 'Identifier') {
      context.builder.export(name, { local: value.name });
    } else if (isFunction(value)) {
      context.builder.unit(property, exportKey(name), mentionsIn(property.value));
      context.builder.export(name, { local: exportKey(name) });
    } else {
      return false;
    }
  }
  return true;
}
