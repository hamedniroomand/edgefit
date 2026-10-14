import type { Node } from 'oxc-parser';

import { isFunction, staticKey, strip } from '@/extract/ast.ts';
import { constantOf } from '@/extract/constants.ts';

import { isLazyClass, mentionsIn } from './builder.ts';
import type { ExportSource, ShapeBuilder } from './builder.ts';
import { exportKey, isExportsObject } from './cjs-forms.ts';
import type { ObjectLiteral } from './cjs-forms.ts';

/** The export that `exports.name` reads, when the module wrote it before. */
export function exportedAs(builder: ShapeBuilder, value: Node): ExportSource | undefined {
  return value.type === 'MemberExpression' &&
    !value.computed &&
    value.property.type === 'Identifier' &&
    isExportsObject(value.object)
    ? builder.shape.exports.get(value.property.name)
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
 * Whether the descriptor of `__esModule` is `{ value: … }` with a value that `isTruthy` accepts. The
 * last `value` key wins, as at runtime, so a spread or a key that is not known after it can replace
 * it. A getter, or a descriptor with no `value`, is not a mark.
 */
export function isTruthyDescriptor(descriptor: ObjectLiteral): boolean {
  for (const property of descriptor.properties.toReversed()) {
    const key =
      property.type === 'Property' ? staticKey(property.key, property.computed) : undefined;
    if (key === undefined || property.type !== 'Property') {
      return false;
    }
    if (key === 'value') {
      return isTruthy(property.value);
    }
  }
  return false;
}
