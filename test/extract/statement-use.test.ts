import { parseSync, visitorKeys } from 'oxc-parser';
import type { Node } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { isStatementUse } from '@/extract/statement-use.ts';

/** The first `?:` in `source`, with its parents, root first. */
function findConditional(source: string): { node: Node; ancestors: Node[] } {
  const program = parseSync('input.ts', source, { preserveParens: true }).program as Node;
  const pending: { node: Node; ancestors: Node[] }[] = [{ node: program, ancestors: [] }];
  for (let item = pending.shift(); item !== undefined; item = pending.shift()) {
    if (item.node.type === 'ConditionalExpression') {
      return item;
    }
    const record = item.node as unknown as Record<string, unknown>;
    for (const key of visitorKeys[item.node.type] ?? []) {
      const children = [record[key]].flat();
      for (const child of children) {
        if (typeof child === 'object' && child !== null && 'type' in child) {
          pending.push({ node: child as Node, ancestors: [...item.ancestors, item.node] });
        }
      }
    }
  }
  throw new Error(`no ?: in ${source}`);
}

const usedBy = (source: string): boolean => {
  const { node, ancestors } = findConditional(source);
  return isStatementUse(node, ancestors);
};

const form = '(c ? a : b)';

describe('a statement that reads the value or calls it', () => {
  it.each([
    [`${form}.z;`],
    [`${form}();`],
    [`${form}.z(1).w();`],
    [`${form}['z'];`],
    [`(${form} as any).z;`],
    [`async function f() {\n  (await ${form}).z;\n}`],
    [`${form}.z, f();`],
    [`f(), ${form}.z;`],
    [`(${form}.z, f());`],
  ])('counts %s', source => {
    expect(usedBy(source)).toBe(true);
  });

  it.each([
    [`${form};`],
    [`${form}?.z;`],
    [`${form}?.();`],
    [`${form}[k];`],
    [`${form}.call(o);`],
    [`${form}.apply(o);`],
    [`${form}.bind(o);`],
    [`const v = ${form}.z;`],
    [`if (${form}.z) f();`],
    [`${form}.z && f();`],
    [`const v = (f(), ${form}.z);`],
    [`(f(), ${form}.z).w;`],
    [`${form}, f();`],
    [`(0, ${form}).z;`],
    [`g(${form}.z);`],
    [`new ${form}.z();`],
    [`function f() {\n  return ${form}.z;\n}`],
    [`f(${form});`],
  ])('does not count %s', source => {
    expect(usedBy(source)).toBe(false);
  });
});
