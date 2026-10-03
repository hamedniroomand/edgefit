import type { Node } from 'oxc-parser';

import { isFunction, strip } from '@/extract/ast.ts';

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
