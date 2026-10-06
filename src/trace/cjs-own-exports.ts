import type { Node } from 'oxc-parser';

import { isFunction, strip } from '@/extract/ast.ts';

import { isLazyClass } from './builder.ts';
import type { ModuleShape, ShapeBuilder } from './builder.ts';
import { isExportsObject } from './cjs-forms.ts';

/** A statement such as `module.exports.name.key = value`, which writes into an export. */
export interface WriteInto {
  node: Node;
  name: string;
  value: Node;
}

/** The export that `exports.name.key = value` writes into, as `name`. */
export function exportWrittenInto(node: Node): string | undefined {
  const target = node.type === 'AssignmentExpression' ? strip(node.left) : undefined;
  let object = target?.type === 'MemberExpression' ? strip(target.object) : undefined;
  while (object?.type === 'MemberExpression' && !isExportsObject(object.object)) {
    object = strip(object.object);
  }
  return object?.type === 'MemberExpression' &&
    !object.computed &&
    object.property.type === 'Identifier'
    ? object.property.name
    : undefined;
}

/** Whether evaluating the value runs no code: a name, a literal, a function or a lazy class. */
function runsNothing(value: Node): boolean {
  const inner = strip(value);
  return (
    inner.type === 'Identifier' ||
    inner.type === 'Literal' ||
    isFunction(inner) ||
    (inner.type === 'ClassExpression' && isLazyClass(inner))
  );
}

/**
 * Files a write into an export. When the value runs nothing, the write only matters to code
 * that uses the export, so it counts with the export. Otherwise it counts when the module loads.
 */
export function addWriteInto(builder: ShapeBuilder, { node, name, value }: WriteInto): void {
  const source = builder.shape.exports.get(name);
  const local = source !== undefined && 'local' in source ? source.local : undefined;
  builder.unit(node, runsNothing(value) ? local : undefined);
}

/** The name that a read of the export `name` stands for, or `undefined` when it is not known. */
function ownExport(shape: ModuleShape, name: string): string | undefined {
  if (shape.moduleExports !== undefined) {
    return `${shape.moduleExports.local}.${name}`;
  }
  const source = shape.exports.get(name);
  if (source === undefined || 'local' in source) {
    return source?.local;
  }
  const local = `import:${name}`;
  shape.imports.set(local, source);
  return local;
}

/**
 * Turns a read of `exports.name` or `module.exports.name` in code into a use of that export, once
 * all the exports are known. A read that cannot be told apart stays, so the module counts in full.
 */
export function resolveOwnReads(shape: ModuleShape): void {
  // ponytail: a parameter or a variable named `exports` reads as the exports of the module.
  for (const unit of shape.units) {
    for (const mention of unit.mentions) {
      const name = /^(?:module\.)?exports\.([^.]+)$/u.exec(mention)?.[1];
      const local = name === undefined ? undefined : ownExport(shape, name);
      if (local !== undefined) {
        unit.mentions.delete(mention);
        unit.mentions.add(local);
      }
    }
  }
}
