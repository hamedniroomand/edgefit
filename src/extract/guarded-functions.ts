import type { Class, Node } from 'oxc-parser';

import { childNodes, staticKey } from './ast.ts';
import type { Guard } from './guard-stack.ts';
import { instanceCode } from './guarded-classes.ts';
import { declared, isPropertyName } from './local-functions.ts';
import type { LocalFunction } from './local-functions.ts';
import { exportedNames } from './main-only.ts';

/** A function or a class: code with a start and an end in the file. */
type Spanned = { start: number; end: number };

type Reads = { reads: Map<string, number[]>; exported: Set<string>; evaluated: boolean };

function guardKey(guard: Guard): string {
  return JSON.stringify(guard.kind === 'api' ? { kind: guard.kind, ref: guard.ref } : guard);
}

function shared(lists: readonly (readonly Guard[])[]): Guard[] {
  const [first = [], ...rest] = lists;
  const keys = rest.map(list => new Set(list.map(guard => guardKey(guard))));
  return first.filter(guard => keys.every(set => set.has(guardKey(guard))));
}

function declaresName(node: Node, parent: Node | undefined): boolean {
  return (
    (parent?.type === 'VariableDeclarator' || parent?.type === 'FunctionDeclaration') &&
    parent.id === node
  );
}

/** Whether a write to `node` sets a CommonJS export: `exports.x`, `module.exports` or a member of it. */
function isExportTarget(node: Node): boolean {
  for (let target = node; target.type === 'MemberExpression'; target = target.object) {
    const { object } = target;
    if (
      object.type === 'Identifier' &&
      (object.name === 'exports' ||
        (object.name === 'module' && staticKey(target.property, target.computed) === 'exports'))
    ) {
      return true;
    }
  }
  return false;
}

/** The names that `node` or a node below it reads. */
function namesBelow(node: Node): string[] {
  return node.type === 'Identifier'
    ? [node.name]
    : childNodes(node).flatMap(child => namesBelow(child));
}

/** The names that `node` exports, in any form. A CommonJS export counts also inside a check. */
function exportsOf(node: Node): string[] {
  if (node.type === 'ExportDefaultDeclaration') {
    return declared(node.declaration as Node).names;
  }
  return node.type === 'AssignmentExpression' && isExportTarget(node.left)
    ? namesBelow(node.right)
    : exportedNames(node);
}

/** Where the file reads the name of each local function outside its body, and which names it exports. */
function findReads(body: readonly Node[], functions: ReadonlyMap<string, Spanned>): Reads {
  const result: Reads = { reads: new Map(), exported: new Set(), evaluated: false };
  const visit = (node: Node, parent?: Node): void => {
    result.evaluated ||=
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'eval';
    for (const name of exportsOf(node)) result.exported.add(name);
    // A JSX use such as `<Download />` is a read too. The walker sees no guards for it.
    const named = node.type === 'Identifier' || node.type === 'JSXIdentifier';
    const fn = named ? functions.get(node.name) : undefined;
    if (
      fn !== undefined &&
      named &&
      !isPropertyName(node, parent) &&
      !declaresName(node, parent) &&
      (node.start < fn.start || node.start >= fn.end)
    ) {
      const reads = result.reads.get(node.name) ?? [];
      reads.push(node.start);
      result.reads.set(node.name, reads);
    }
    for (const child of childNodes(node)) visit(child, node);
  };
  for (const node of body) visit(node);
  return result;
}

/**
 * The guards that hold whenever a local function runs: the guards that every read of its name
 * shares. A read that the walker did not see counts as a read without guards. A read in code that
 * never runs does not count, unless every read is in such code. A function that the file exports
 * gets no guards, because other code can call it. No function gets guards in a file that calls `eval`.
 * ponytail: a read inside another function does not get the guards of that function, so a guard
 * reaches one function only. Upgrade: repeat until no function gets a new guard.
 */
export function functionGuards<TCode extends Spanned>(
  body: readonly Node[],
  functions: ReadonlyMap<string, TCode>,
  seen: ReadonlyMap<number, readonly Guard[]>,
): Map<TCode, Guard[]> {
  const result = new Map<TCode, Guard[]>();
  if (![...seen.values()].some(guards => guards.length > 0)) return result;
  const { reads, exported, evaluated } = findReads(body, functions);
  // Code that `eval` runs can call any function of the file.
  if (evaluated) return result;
  for (const [name, fn] of functions) {
    const offsets = reads.get(name);
    if (offsets === undefined || exported.has(name)) continue;
    const lists = offsets.map(offset => seen.get(offset) ?? []);
    const live = lists.filter(list => !list.some(guard => guard.kind === 'dead'));
    const guards = shared(live.length > 0 ? live : lists);
    if (guards.length > 0) result.set(fn, guards);
  }
  return result;
}

/** The code that the guards of `functionGuards` hold for: a function, or the instance code of a class. */
export const codeOf = (fn: LocalFunction | Class): readonly Node[] =>
  fn.type === 'ClassDeclaration' || fn.type === 'ClassExpression' ? instanceCode(fn) : [fn];
