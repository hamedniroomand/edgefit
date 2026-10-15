import { parseSync } from 'oxc-parser';
import type { Node } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { isModuleLet } from '@/extract/module-let.ts';

function moduleLet(source: string, file = 'input.ts'): boolean {
  const { body } = parseSync(file, `${source}\nlet g = globalThis;`).program;
  return isModuleLet(body as Node[], 'g');
}

describe('a top-level let of an ES module', () => {
  it.each([
    ['an exported const', 'export const a = 1;'],
    ['an exported function', 'export function f() {}'],
    ['an exported class', 'export class C {}'],
    ['a default export of a value', 'export default {};'],
    ['a default export of a function', 'export default function () {}'],
    ['an export of all names', "export * from 'm';"],
  ])('counts a file with %s', (_, source) => {
    expect(moduleLet(source)).toBe(true);
    expect(moduleLet(source, 'input.js')).toBe(true);
  });

  it.each([
    ['no module statement', ''],
    ['an empty export', 'export {};'],
    ['an import', "import a from 'a';"],
    ['a side-effect import', "import 'a';"],
    ['a type import', "import type { A } from 'a';"],
    ['an export of names', 'const a = 1;\nexport { a };'],
    ['an export of names from a module', "export { a } from 'a';"],
    ['an exported type', 'export type A = 1;'],
    ['an exported interface', 'export interface I {}'],
    ['an exported declare', 'export declare const a: number;'],
    ['a declared class', 'export declare class C {}'],
    ['a function overload', 'export function f(): void;'],
    ['an exported enum', 'export enum E { A }'],
    ['a default export of a name', 'const a = 1;\nexport default a;'],
    ['a default export of an interface', 'export default interface I {}'],
    ['a default export of a name in parentheses', 'interface I {}\nexport default (I);'],
    ['a default export with no body', 'export default function f(): void;'],
    ['an export of all types', "export type * from 'm';"],
  ])('does not count a file with %s', (_, source) => {
    expect(moduleLet(source)).toBe(false);
  });

  it('does not count a var or an exported let', () => {
    const body = (source: string): Node[] => parseSync('input.ts', source).program.body as Node[];
    expect(isModuleLet(body('export default {};\nvar g = globalThis;'), 'g')).toBe(false);
    expect(isModuleLet(body('export let g = globalThis;'), 'g')).toBe(false);
  });
});
