import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Loader, Plugin } from 'esbuild';
import type { Node } from 'oxc-parser';

import { childNodes, isEquality, isInequality, staticKey, strip } from '@/extract/ast.ts';
import { parse } from '@/extract/index.ts';

const loaders: Record<string, Loader> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
};

type Range = { start: number; end: number; keep: string };

const isName = (node: Node, name: string): boolean =>
  node.type === 'Identifier' && node.name === name;

function isMain(node: Node): boolean {
  const inner = strip(node);
  return (
    inner.type === 'MemberExpression' &&
    staticKey(inner.property, inner.computed) === 'main' &&
    isName(strip(inner.object), 'require')
  );
}

/** Whether a comparison of `require.main` with `module` is true when the file is the entry module. */
function mainTest(node: Node): boolean | undefined {
  const test = strip(node);
  if (
    test.type !== 'BinaryExpression' ||
    !(isEquality(test.operator) || isInequality(test.operator))
  ) {
    return undefined;
  }
  const [left, right] = [strip(test.left), strip(test.right)];
  const compares =
    (isMain(left) && isName(right, 'module')) || (isMain(right) && isName(left, 'module'));
  return compares ? isEquality(test.operator) : undefined;
}

/** The code that runs only when the file is the CommonJS entry module. */
function mainOnlyRanges(root: Node): Range[] {
  const found: Range[] = [];
  const dead = (node: Node, keep: string): void => {
    found.push({ start: node.start, end: node.end, keep });
  };
  const pending = [root];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const isEntry = node.type === 'IfStatement' ? mainTest(node.test) : undefined;
    const logical = node.type === 'LogicalExpression' ? mainTest(node.left) : undefined;
    if (node.type === 'IfStatement' && isEntry !== undefined) {
      const [gone, live] = isEntry
        ? [node.consequent, node.alternate]
        : [node.alternate, node.consequent];
      if (gone !== null) dead(gone, ';');
      if (live !== null) pending.push(live);
    } else if (
      node.type === 'LogicalExpression' &&
      logical !== undefined &&
      node.operator === (logical ? '&&' : '||')
    ) {
      dead(node.right, '0');
    } else {
      pending.push(...childNodes(node));
    }
  }
  return found;
}

function blank(source: string, ranges: readonly Range[]): string {
  let result = source;
  for (const { start, end, keep } of ranges.toSorted((a, b) => b.start - a.start)) {
    const text = result.slice(start, end).replaceAll(/[^\n]/gu, ' ');
    result = `${result.slice(0, start)}${keep}${text.slice(keep.length)}${result.slice(end)}`;
  }
  return result;
}

/**
 * A bundler follows `require('./cli.js')` behind `require.main === module`, but an imported file is
 * never the entry module. This blanks that code, as the `NODE_ENV` define does for a removed branch,
 * so the module that only it loads is not in the graph. The positions in the file do not change.
 * A file that an entry names stays as it is.
 * ponytail: a file that also has an `import()` wrapper keeps the wrapper plugin's output.
 */
export const mainOnly = (entries: ReadonlySet<string>): Plugin => ({
  name: 'edgefit-main-only',
  setup(build) {
    // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
    // oxlint-disable-next-line require-unicode-regexp
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
      if (entries.has(args.path)) {
        return;
      }
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes('require.main')) {
        return;
      }
      const result = parse(args.path, source);
      const ranges = result.errors.length > 0 ? [] : mainOnlyRanges(result.program as Node);
      if (ranges.length === 0) {
        return;
      }
      return {
        contents: blank(source, ranges),
        loader: loaders[path.extname(args.path)] ?? 'js',
        resolveDir: path.dirname(args.path),
      };
    });
  },
});
